"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type Timestamp,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db, firebaseConfigured } from "./firebase";
import { imageToDataUrl } from "./qr";
import { ZONES, zoneNameScore, type Zone } from "./siteMap";

export type OfficeLocation = {
  id: string;
  name: string;
  /** The site-map area this location is drawn as (see lib/siteMap.ts). */
  zoneId?: string | null;
  createdAt?: Timestamp | null;
};

export type InventoryOrder = {
  id: string;
  poNumber: string;
  itemName: string;
  description: string;
  locationId: string;
  locationName: string;
  /** Small JPEG data URL for lists; the full photo lives in photos/{id}. */
  photoThumb: string | null;
  hasPhoto: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

/* ---------- Office locations ---------- */

export function useLocations() {
  const [locations, setLocations] = useState<OfficeLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    const q = query(collection(db(), "locations"), orderBy("name"));
    return onSnapshot(
      q,
      (snap) => {
        setLocations(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OfficeLocation, "id">) })));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
  }, []);

  return { locations, loading, error };
}

export async function addLocations(names: string[]) {
  const seen = new Set<string>();
  const clean = names
    .map((n) => n.trim())
    .filter((n) => {
      const key = n.toLowerCase();
      if (!n || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  await Promise.all(
    clean.map((name) =>
      addDoc(collection(db(), "locations"), { name, createdAt: serverTimestamp() })
    )
  );
  return clean.length;
}

/**
 * Makes sure every area on the site map has a location:
 * links existing locations whose name matches an area (or its aliases),
 * and creates locations for the rest. Returns what it did.
 */
export function planMapSync(locations: OfficeLocation[]) {
  const link: { location: OfficeLocation; zone: Zone }[] = [];
  const create: Zone[] = [];
  const used = new Set(locations.filter((l) => l.zoneId).map((l) => l.id));
  const pending = ZONES.filter((zone) => !locations.some((l) => l.zoneId === zone.id));
  // Exact name matches first, then aliases, so "Dinma's Mesh Area" wins over a lookalike.
  for (const score of [2, 1]) {
    for (const zone of pending) {
      if (link.some((x) => x.zone.id === zone.id)) continue;
      const match = locations.find((l) => !used.has(l.id) && zoneNameScore(l.name, zone) === score);
      if (match) {
        used.add(match.id);
        link.push({ location: match, zone });
      }
    }
  }
  for (const zone of pending) if (!link.some((x) => x.zone.id === zone.id)) create.push(zone);
  return { link, create };
}

export async function syncMapLocations(locations: OfficeLocation[]) {
  const { link, create } = planMapSync(locations);
  if (!link.length && !create.length) return { linked: 0, created: 0 };
  const batch = writeBatch(db());
  for (const { location, zone } of link) {
    batch.update(doc(db(), "locations", location.id), { zoneId: zone.id });
  }
  for (const zone of create) {
    batch.set(doc(collection(db(), "locations")), {
      name: zone.label,
      zoneId: zone.id,
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return { linked: link.length, created: create.length };
}

/** Takes an area off the map but keeps the location (and its POs) for picking and search. */
export async function removeFromMap(locationId: string) {
  await updateDoc(doc(db(), "locations", locationId), { zoneId: deleteField() });
}

/**
 * Puts a removed area back on the map: links a location with the same name if one
 * exists without an area, otherwise creates a new location for it.
 */
export async function addZoneBack(zone: Zone, locations: OfficeLocation[]) {
  const match =
    locations.find((l) => !l.zoneId && zoneNameScore(l.name, zone) === 2) ??
    locations.find((l) => !l.zoneId && zoneNameScore(l.name, zone) === 1);
  if (match) {
    await updateDoc(doc(db(), "locations", match.id), { zoneId: zone.id });
    return { linked: match.name };
  }
  await addDoc(collection(db(), "locations"), { name: zone.label, zoneId: zone.id, createdAt: serverTimestamp() });
  return { created: zone.label };
}

export async function renameLocation(id: string, name: string) {
  await updateDoc(doc(db(), "locations", id), { name: name.trim() });
}

export async function deleteLocation(id: string) {
  await deleteDoc(doc(db(), "locations", id));
}

/* ---------- Inventory orders ---------- */

export function useOrders() {
  const [orders, setOrders] = useState<InventoryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return;
    }
    const q = query(collection(db(), "orders"), orderBy("createdAt", "desc"));
    return onSnapshot(
      q,
      (snap) => {
        setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InventoryOrder, "id">) })));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
  }, []);

  return { orders, loading, error };
}

export function useOrder(id: string | undefined) {
  const [order, setOrder] = useState<InventoryOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !firebaseConfigured) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      doc(db(), "orders", id),
      (snap) => {
        setOrder(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<InventoryOrder, "id">) } : null);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
  }, [id]);

  return { order, loading, error };
}

/** Full-size photo for one order, or null. */
export function usePhoto(id: string | undefined, enabled: boolean) {
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !enabled || !firebaseConfigured) {
      setPhoto(null);
      return;
    }
    return onSnapshot(
      doc(db(), "photos", id),
      (snap) => setPhoto(snap.exists() ? (snap.data().data as string) : null),
      () => setPhoto(null)
    );
  }, [id, enabled]);
  return photo;
}

/** Reserve a document id up front so the QR code can point at it before saving. */
export function newOrderId() {
  return doc(collection(db(), "orders")).id;
}

export type OrderInput = {
  poNumber: string;
  itemName: string;
  description: string;
  locationId: string;
  locationName: string;
};

async function processPhoto(file: Blob) {
  const [full, thumb] = await Promise.all([
    imageToDataUrl(file, 1400, 900_000),
    imageToDataUrl(file, 240, 40_000),
  ]);
  return { full, thumb };
}

/**
 * Saves an order. `photo`: a File to set a new photo, null to have no photo,
 * undefined to keep the existing one (edits only).
 */
export async function saveOrder(
  id: string,
  input: OrderInput,
  photo: Blob | null | undefined,
  isNew: boolean
) {
  const batch = writeBatch(db());
  const orderRef = doc(db(), "orders", id);
  const photoRef = doc(db(), "photos", id);

  let photoFields: Partial<InventoryOrder> = {};
  if (photo) {
    const { full, thumb } = await processPhoto(photo);
    batch.set(photoRef, { data: full });
    photoFields = { photoThumb: thumb, hasPhoto: true };
  } else if (photo === null) {
    batch.delete(photoRef);
    photoFields = { photoThumb: null, hasPhoto: false };
  }

  const data = {
    ...clean(input),
    ...photoFields,
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdAt: serverTimestamp() } : {}),
  };
  if (isNew) batch.set(orderRef, data);
  else batch.update(orderRef, data);
  await batch.commit();
}

export async function deleteOrder(order: InventoryOrder) {
  const batch = writeBatch(db());
  batch.delete(doc(db(), "photos", order.id));
  batch.delete(doc(db(), "orders", order.id));
  await batch.commit();
}

function clean(input: OrderInput): OrderInput {
  return {
    poNumber: input.poNumber.trim(),
    itemName: input.itemName.trim(),
    description: input.description.trim(),
    locationId: input.locationId,
    locationName: input.locationName,
  };
}

/* ---------- Search ---------- */

export function matchesSearch(order: InventoryOrder, term: string) {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  const haystack = [order.poNumber, order.itemName, order.description, order.locationName]
    .join(" ")
    .toLowerCase();
  // every word typed must appear somewhere
  return t.split(/\s+/).every((word) => haystack.includes(word));
}
