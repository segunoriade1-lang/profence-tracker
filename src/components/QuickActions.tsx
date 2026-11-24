"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ageLevel,
  isReleased,
  moveOrder,
  placementOf,
  releaseOrder,
  restorePlacement,
  setOrderMapPos,
  undoRelease,
  type InventoryOrder,
  type OfficeLocation,
  type Placement,
} from "@/lib/data";
import { BoxIcon, CheckIcon, ChevronRight, MapIcon, PinIcon, XIcon } from "./Icons";
import LocationPicker from "./LocationPicker";
import SiteMap from "./SiteMap";

const fmt = (d: Date) =>
  d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

type Last =
  | { kind: "released" }
  | { kind: "unreleased"; note: string | null }
  | { kind: "moved"; to: string; before: Placement };

/**
 * Everything you'd do with a PO right after scanning it:
 * mark picked up / undo, move it to another location, and pin its exact spot.
 */
export default function QuickActions({
  order,
  locations,
  showHeader = false,
  showMap = false,
  startMoving = false,
}: {
  order: InventoryOrder;
  locations: OfficeLocation[];
  /** PO number, item and photo (for the scanner, where the page doesn't show them). */
  showHeader?: boolean;
  /** Mini map with the draggable dot. */
  showMap?: boolean;
  startMoving?: boolean;
}) {
  const released = isReleased(order);
  const [moving, setMoving] = useState(startMoving);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<Last | null>(null);
  const [spotSaved, setSpotSaved] = useState(false);

  const zoneId = locations.find((l) => l.id === order.locationId)?.zoneId ?? null;
  const visible = new Set(locations.map((l) => l.zoneId).filter(Boolean) as string[]);

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

  const pickUp = () =>
    run(async () => {
      await releaseOrder(order.id, note);
      setLast({ kind: "released" });
      setShowNote(false);
      setNote("");
      setMoving(false);
    });

  const unPickUp = () =>
    run(async () => {
      const prevNote = order.releaseNote ?? null;
      await undoRelease(order.id);
      setLast({ kind: "unreleased", note: prevNote });
    });

  const moveTo = (loc: OfficeLocation) => {
    if (loc.id === order.locationId && !released) {
      setMoving(false);
      return;
    }
    const before = placementOf(order);
    run(async () => {
      await moveOrder(order.id, loc);
      setLast({ kind: "moved", to: loc.name, before });
      setMoving(false);
      setSpotSaved(false);
    });
  };

  const undoLast = () =>
    run(async () => {
      if (!last) return;
      if (last.kind === "released") await undoRelease(order.id);
      else if (last.kind === "unreleased") await releaseOrder(order.id, last.note ?? "");
      else await restorePlacement(order.id, last.before);
      setLast(null);
    });

  const when = order.releasedAt?.toDate?.();

  return (
    <div className={`qa ${released ? "is-released" : ""}`}>
      {showHeader && (
        <div className="qa-head">
          {order.photoThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="thumb" src={order.photoThumb} alt="" />
          ) : (
            <span className="thumb thumb-empty" aria-hidden>
              <BoxIcon size={20} />
            </span>
          )}
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="po po-lg" style={{ fontSize: "1.35rem" }}>{order.poNumber}</div>
            {order.itemName && <div className="order-title">{order.itemName}</div>}
          </div>
          <Link href={`/orders/${order.id}`} className="btn btn-ghost" aria-label="Open full order page">
            Details <ChevronRight size={16} />
          </Link>
        </div>
      )}

      <div className="qa-status">
        <span className={`qa-status-icon ${released ? "ok" : ""}`}>
          {released ? <CheckIcon size={20} /> : <PinIcon size={20} />}
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          {released ? (
            <>
              <div className="qa-status-title">Picked up</div>
              <div className="qa-status-sub">
                {when ? fmt(when) : "Just now"}
                {order.releaseNote ? ` · ${order.releaseNote}` : ""} · was at {order.locationName}
              </div>
            </>
          ) : (
            <>
              <div className="qa-status-label">Stored at</div>
              <div className="qa-status-title big">{order.locationName || "No location"}</div>
            </>
          )}
        </div>
      </div>

      {last && (
        <div className="qa-toast" role="status">
          <CheckIcon size={16} />
          <span className="grow">
            {last.kind === "released" && "Marked as picked up"}
            {last.kind === "unreleased" && "Back in stock"}
            {last.kind === "moved" && `Moved to ${last.to}`}
          </span>
          <button className="btn btn-ghost" onClick={undoLast} disabled={busy}>
            Undo
          </button>
        </div>
      )}

      <div className="qa-actions">
        {released ? (
          <button className="btn btn-primary btn-lg" onClick={unPickUp} disabled={busy}>
            <XIcon size={18} /> Not picked up — put back
          </button>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={pickUp} disabled={busy}>
            <CheckIcon size={18} /> {busy ? "Saving…" : "Mark as picked up"}
          </button>
        )}
        <button
          className={`btn btn-lg ${moving ? "is-on" : ""}`}
          onClick={() => setMoving((m) => !m)}
          disabled={busy}
          aria-expanded={moving}
        >
          <MapIcon size={18} /> {released ? "Back in stock at…" : "Change location"}
        </button>
      </div>

      {!released && !moving && (
        <div className="qa-note-row">
          {showNote ? (
            <input
              autoFocus
              placeholder="Pickup note (optional) — who collected it, which job…"
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pickUp()}
            />
          ) : (
            <button type="button" className="link-btn" onClick={() => setShowNote(true)}>
              + Add a pickup note
            </button>
          )}
        </div>
      )}

      {moving && (
        <div className="qa-move">
          <div className="zone-group-title">
            {released ? "Where is it now?" : "Move to — tap a location"}
          </div>
          <LocationPicker locations={locations} value={released ? "" : order.locationId} onChange={moveTo} />
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {showMap && !released && zoneId && (
        <div className="qa-map">
          <SiteMap
            compact
            selectedId={zoneId}
            visibleIds={visible}
            dots={[{ id: order.id, zoneId, label: order.poNumber, pos: order.mapPos ?? null, age: ageLevel(order) }]}
            activeDotId={order.id}
            onDotMove={async (id, x, y) => {
              setSpotSaved(false);
              try {
                await setOrderMapPos(id, x, y);
                setSpotSaved(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
          <p className="hint">
            {spotSaved
              ? "Spot saved."
              : last?.kind === "moved" || !order.mapPos
                ? "Drag the dot to the exact spot it was dropped."
                : "Drag the dot if it's moved within this area."}
          </p>
        </div>
      )}
    </div>
  );
}
