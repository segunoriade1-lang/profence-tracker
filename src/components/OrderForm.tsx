"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CameraIcon, CheckIcon, QrIcon, XIcon } from "@/components/Icons";
import LocationPicker from "@/components/LocationPicker";
import QrLabel from "@/components/QrLabel";
import SetupNotice from "@/components/Setup";
import {
  newOrderId,
  saveOrder,
  useLocations,
  useOrders,
  usePhoto,
  type InventoryOrder,
} from "@/lib/data";
import { firebaseConfigured } from "@/lib/firebase";

export default function OrderForm({ existing, initialLocationId }: { existing?: InventoryOrder; initialLocationId?: string }) {
  const router = useRouter();
  const { locations, error: locError } = useLocations();
  const { orders } = useOrders();

  const [poNumber, setPoNumber] = useState(existing?.poNumber ?? "");
  const [itemName, setItemName] = useState(existing?.itemName ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [locationId, setLocationId] = useState(existing?.locationId ?? initialLocationId ?? "");
  const [locationName, setLocationName] = useState(existing?.locationName ?? "");

  // Coming from "Add order here" on the map: fill in that location's name once locations load.
  useEffect(() => {
    if (existing || !locationId || locationName) return;
    const loc = locations.find((l) => l.id === locationId);
    if (loc) setLocationName(loc.name);
  }, [existing, locationId, locationName, locations]);

  // photo: undefined = unchanged (edit), null = none/removed, File = new
  const [photo, setPhoto] = useState<File | null | undefined>(existing ? undefined : null);
  const [preview, setPreview] = useState<string | null>(existing?.photoThumb ?? null);
  const savedPhoto = usePhoto(existing?.id, !!existing?.hasPhoto);
  useEffect(() => {
    if (savedPhoto && photo === undefined) setPreview(savedPhoto);
  }, [savedPhoto, photo]);

  const [generated, setGenerated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = useMemo(
    () => existing?.id ?? (firebaseConfigured ? newOrderId() : "preview"),
    [existing?.id]
  );

  useEffect(() => {
    if (!(photo instanceof File)) return;
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const duplicate = orders.find(
    (o) => o.id !== id && o.poNumber.trim().toLowerCase() === poNumber.trim().toLowerCase()
  );

  function validate() {
    if (!poNumber.trim()) return "Enter the purchase order number.";
    if (!locationId) return "Choose where in the office this item is going.";
    return null;
  }

  function onGenerate() {
    const v = validate();
    setError(v);
    if (!v) setGenerated(true);
  }

  // Changing anything after generating means the label needs regenerating.
  function edit<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setGenerated(false);
    };
  }

  async function onSave() {
    const v = validate();
    if (v) return setError(v);
    setSaving(true);
    setError(null);
    try {
      const input = { poNumber, itemName, description, locationId, locationName };
      await saveOrder(id, input, photo, !existing);
      router.push(`/orders/${id}?saved=1`);
    } catch (err) {
      setError(`Couldn't save: ${(err as Error).message}`);
      setSaving(false);
    }
  }

  const step2 = generated || !!existing;

  return (
    <>
      <SetupNotice error={locError} />
      <div className="form-grid">
        <div className="card stack">
          <h2 className="section-title">
            <span className="step">1</span> Order details
          </h2>

          <div className="field">
            <label htmlFor="po" className="label-text">
              Purchase order number <span className="req">*</span>
            </label>
            <input
              id="po"
              className="mono"
              autoFocus={!existing}
              placeholder="e.g. PO-10432 or ABC123"
              value={poNumber}
              onChange={(e) => edit(setPoNumber)(e.target.value)}
            />
            {duplicate && (
              <p className="warn">
                Heads up: PO “{duplicate.poNumber}” already exists in {duplicate.locationName}.
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="item" className="label-text">
              Item / what came in <span className="muted">· optional</span>
            </label>
            <input
              id="item"
              placeholder="e.g. 50× galvanised fence posts"
              value={itemName}
              onChange={(e) => edit(setItemName)(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="desc" className="label-text">
              Description <span className="muted">· optional</span>
            </label>
            <textarea
              id="desc"
              rows={3}
              placeholder="Supplier, serial numbers, notes — anything you'd want to search for later"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field">
            <span className="label-text">
              Photo <span className="muted">· optional</span>
            </span>
            {preview ? (
              <div className="photo-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Order photo" />
                <div className="photo-actions">
                  <label className="btn">
                    <CameraIcon size={16} /> Replace
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setPhoto(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-icon"
                    aria-label="Remove photo"
                    onClick={() => {
                      setPhoto(null);
                      setPreview(null);
                    }}
                  >
                    <XIcon size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <label className="dropzone">
                <span className="dropzone-icon">
                  <CameraIcon size={22} />
                </span>
                <strong>Take or choose a photo</strong>
                <span className="small">Of the order, label or delivery note</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setPhoto(f);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
          </div>

          <hr className="divider" />

          <h2 className="section-title">
            <span className="step">2</span> Where in the office? <span className="req">*</span>
          </h2>
          <LocationPicker
            locations={locations}
            value={locationId}
            onChange={(l) => {
              edit(setLocationId)(l.id);
              setLocationName(l.name);
            }}
          />

          {error && <p className="error">{error}</p>}

          {!existing && (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={onGenerate}
              disabled={!firebaseConfigured}
            >
              <QrIcon size={19} /> Generate QR code &amp; PO number
            </button>
          )}
        </div>

        <div className={`card stack sticky-panel ${step2 ? "" : "panel-waiting"}`}>
          {step2 && poNumber.trim() ? (
            <>
              <h2 className="section-title">
                <span className="step">3</span> {existing ? "Label" : "Review & save"}
              </h2>
              <QrLabel id={id} poNumber={poNumber.trim()} sub={locationName} actions={false} />
              <p className="muted small center" style={{ margin: 0 }}>
                Scanning this code opens the order and shows exactly where it&apos;s stored.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={onSave}
                disabled={saving || !firebaseConfigured}
              >
                <CheckIcon size={18} />
                {saving ? "Saving…" : existing ? "Save changes" : "Save order"}
              </button>
            </>
          ) : (
            <div className="label-placeholder">
              <span className="ghost-qr">
                <QrIcon size={40} />
              </span>
              <strong>Your QR label appears here</strong>
              <span className="small">
                Fill in the order, choose a location, then press
                <br />
                <b>Generate QR code &amp; PO number</b>.
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
