"use client";

import { useState } from "react";
import { CheckIcon, EditIcon, MapIcon, PinIcon, PlusIcon, TrashIcon, XIcon } from "@/components/Icons";
import SetupNotice from "@/components/Setup";
import { addLocations, deleteLocation, renameLocation, useLocations, useOrders } from "@/lib/data";

export default function LocationsPage() {
  const { locations, loading, error } = useLocations();
  const { orders } = useOrders();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const names = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const existing = new Set(locations.map((l) => l.name.toLowerCase()));
  const toAdd = names.filter((n) => !existing.has(n.toLowerCase()));

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!toAdd.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const n = await addLocations(toAdd);
      setText("");
      setMsg({ ok: true, text: `Added ${n} location${n === 1 ? "" : "s"}.` });
    } catch (err) {
      setMsg({ ok: false, text: `Couldn't save: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function onRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || !editing.name.trim()) return;
    await renameLocation(editing.id, editing.name);
    setEditing(null);
  }

  async function onDelete(id: string, name: string) {
    const used = orders.filter((o) => o.locationId === id).length;
    const warn = used
      ? `${used} order${used === 1 ? " is" : "s are"} stored in “${name}”. They'll keep the name but the location will be gone from the list. Delete anyway?`
      : `Delete “${name}”?`;
    if (confirm(warn)) await deleteLocation(id);
  }

  return (
    <>
      <SetupNotice error={error} />
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <MapIcon size={14} /> Office map
          </div>
          <h1>Office locations</h1>
          <p className="muted">Every place items can be stored — shelves, bays, rooms, cabinets, bins.</p>
        </div>
      </div>

      <form className="card add-card" onSubmit={onAdd}>
        <h2 className="section-title">
          <span className="step">
            <PlusIcon size={15} />
          </span>
          Add locations
        </h2>
        <textarea
          id="locs"
          rows={3}
          aria-label="New locations"
          placeholder={"One per line, or separated by commas — e.g.\nShelf A, Shelf B, Back storeroom"}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {names.length > 0 && (
          <div className="chip-preview" aria-live="polite">
            {names.map((n, i) => (
              <span key={`${n}-${i}`} className={existing.has(n.toLowerCase()) ? "dupe" : ""} title={existing.has(n.toLowerCase()) ? "Already exists" : undefined}>
                <PinIcon size={12} /> {n}
              </span>
            ))}
          </div>
        )}
        <div className="row between">
          <span className="hint">
            {names.length > 0
              ? `${toAdd.length} new${names.length !== toAdd.length ? ` · ${names.length - toAdd.length} already exist` : ""}`
              : "Tip: paste a whole list at once."}
          </span>
          <button className="btn btn-primary" disabled={busy || !toAdd.length}>
            <PlusIcon size={16} /> {busy ? "Saving…" : toAdd.length > 1 ? `Add ${toAdd.length} locations` : "Add location"}
          </button>
        </div>
        {msg && <p className={msg.ok ? "success" : "error"} style={{ margin: 0 }}>{msg.ok && <CheckIcon size={16} />} {msg.text}</p>}
      </form>

      <div className="list-head">
        <h2 className="h2">
          All locations <span className="count-badge">{locations.length}</span>
        </h2>
      </div>

      {loading ? (
        <div className="loc-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 76 }} />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <MapIcon size={24} />
          </div>
          <strong>No locations yet</strong>
          <span>Add the places in your office where items are kept.</span>
        </div>
      ) : (
        <div className="loc-grid">
          {locations.map((l) => {
            const count = orders.filter((o) => o.locationId === l.id).length;
            return (
              <div key={l.id} className="loc-card">
                <span className="loc-icon">
                  <PinIcon size={20} />
                </span>
                {editing?.id === l.id ? (
                  <form className="row grow" onSubmit={onRename} style={{ flexWrap: "nowrap" }}>
                    <input
                      autoFocus
                      value={editing.name}
                      onChange={(e) => setEditing({ id: l.id, name: e.target.value })}
                      aria-label="Location name"
                      style={{ padding: "8px 10px" }}
                    />
                    <button className="btn btn-primary btn-icon" aria-label="Save name">
                      <CheckIcon size={16} />
                    </button>
                    <button type="button" className="btn btn-icon" aria-label="Cancel" onClick={() => setEditing(null)}>
                      <XIcon size={16} />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="loc-name">{l.name}</div>
                      <div className="loc-count">
                        {count} item{count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="loc-actions">
                      <button className="btn btn-ghost" aria-label={`Rename ${l.name}`} title="Rename" onClick={() => setEditing({ id: l.id, name: l.name })}>
                        <EditIcon size={16} />
                      </button>
                      <button className="btn btn-ghost btn-danger" aria-label={`Delete ${l.name}`} title="Delete" onClick={() => onDelete(l.id, l.name)}>
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
