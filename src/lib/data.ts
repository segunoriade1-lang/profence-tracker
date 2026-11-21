"use client";

import {
  addDoc,
  collection,
  deleteDoc,
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

export type OfficeLocation = {
  id: string;
  name: string;
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
