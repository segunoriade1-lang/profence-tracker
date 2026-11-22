"use client";

import { useState } from "react";
import { isReleased, releaseOrder, undoRelease, type InventoryOrder } from "@/lib/data";
import { BoxIcon, CheckIcon } from "./Icons";

const fmt = (d: Date) =>
  d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Top-of-page card: one tap to mark a PO as picked up, or see/undo a release. */
export default function ReleaseCard({ order }: { order: InventoryOrder }) {
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (isReleased(order)) {
    const when = order.releasedAt?.toDate?.();
    return (
      <div className="release-card is-released">
        <span className="release-icon">
          <CheckIcon size={22} />
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="release-title">Picked up</div>
          <div className="release-sub">
            {when ? fmt(when) : "Just now"}
            {order.releaseNote ? ` · ${order.releaseNote}` : ""}
          </div>
        </div>
        <button className="btn" disabled={busy} onClick={() => run(() => undoRelease(order.id))}>
          {busy ? "Undoing…" : "Undo"}
        </button>
        {error && <p className="error" style={{ flexBasis: "100%" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div className="release-card">
      <span className="release-icon">
        <BoxIcon size={22} />
      </span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="release-title">Giving this out?</div>
        <div className="release-sub">Mark it picked up so it comes off the map.</div>
      </div>
      <div className="release-actions">
        {!showNote && (
          <button type="button" className="btn btn-ghost" onClick={() => setShowNote(true)}>
            Add note
          </button>
        )}
        <button className="btn btn-primary" disabled={busy} onClick={() => run(() => releaseOrder(order.id, note))}>
          <CheckIcon size={17} /> {busy ? "Saving…" : "Mark as picked up"}
        </button>
      </div>
      {showNote && (
        <input
          className="release-note"
          autoFocus
          placeholder="Optional — who collected it, which job…"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run(() => releaseOrder(order.id, note))}
        />
      )}
      {error && <p className="error" style={{ flexBasis: "100%" }}>{error}</p>}
    </div>
  );
}
