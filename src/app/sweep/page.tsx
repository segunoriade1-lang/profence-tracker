"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { BoxIcon, CheckIcon, ChevronRight, PinIcon, SearchIcon, XIcon } from "@/components/Icons";
import SetupNotice from "@/components/Setup";
import {
  ageDays,
  confirmStillHere,
  isReleased,
  releaseOrder,
  SWEEP_DAYS,
  undoRelease,
  useLocations,
  useOrders,
  type InventoryOrder,
} from "@/lib/data";
import { ZONES } from "@/lib/siteMap";

const CHOICES = [7, SWEEP_DAYS, 30, 0]; // 0 = everything in stock

type Done = { id: string; po: string; action: "here" | "gone" };

function Sweep() {
  const params = useSearchParams();
  const pathname = usePathname();
  const days = (() => {
    const d = params.get("days");
    if (d === null) return SWEEP_DAYS;
    const n = parseInt(d, 10);
    return Number.isFinite(n) && n >= 0 ? n : SWEEP_DAYS;
  })();
  const { orders, loading, error } = useOrders();
  const { locations } = useLocations();
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<Done | null>(null);
  const [count, setCount] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  // Walking order: follow the map (building first, then sheds and yard), then anything off the map.
  const routeIndex = useMemo(() => {
    const zoneOrder = new Map(ZONES.map((z, i) => [z.id, i]));
    const m = new Map<string, number>();
    locations.forEach((l) => m.set(l.id, l.zoneId ? zoneOrder.get(l.zoneId) ?? 999 : 999));
    return m;
  }, [locations]);

  const due = useMemo(
    () =>
      orders
        .filter((o) => !isReleased(o) && ageDays(o) >= days)
        .sort((a, b) => {
          const r = (routeIndex.get(a.locationId) ?? 999) - (routeIndex.get(b.locationId) ?? 999);
          return r || ageDays(b) - ageDays(a);
        }),
    [orders, days, routeIndex]
  );

  const groups = useMemo(() => {
    const g: { name: string; items: InventoryOrder[] }[] = [];
    for (const o of due) {
      const name = o.locationName || "No location";
      const last = g[g.length - 1];
      if (last && last.name === name) last.items.push(o);
      else g.push({ name, items: [o] });
    }
    return g;
  }, [due]);

  async function act(o: InventoryOrder, action: "here" | "gone") {
    setBusy(o.id);
    setActionError(null);
    try {
      if (action === "here") await confirmStillHere(o.id);
      else await releaseOrder(o.id, "Cleared in sweep");
      setLast({ id: o.id, po: o.poNumber, action });
      setCount((c) => c + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function undo() {
    if (!last) return;
    // "Gone" can be undone; "Still here" just reset the clock, nothing to put back.
    if (last.action === "gone") await undoRelease(last.id);
    setLast(null);
    setCount((c) => Math.max(0, c - 1));
  }

  const href = (d: number) => (d === SWEEP_DAYS ? pathname : `${pathname}?days=${d}`);

  return (
    <>
      <SetupNotice error={error} />
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <SearchIcon size={14} /> Sweep
          </div>
          <h1>Is it still there?</h1>
          <p className="muted">
            Walk the yard and check these POs. Tap <b>Still here</b> or <b>Gone</b>. They&apos;re listed in walking
            order, building first.
          </p>
        </div>
      </div>

      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="seg" role="tablist" aria-label="How long it's been sitting">
          {CHOICES.map((d) => (
            <Link key={d} href={href(d)} className={days === d ? "on" : ""} role="tab" aria-selected={days === d} scroll={false}>
              {d === 0 ? "Everything" : `${d}+ days`}
            </Link>
          ))}
        </div>
        {!loading && (
          <span className="muted small">
            {due.length} to check{count > 0 ? ` · ${count} done this visit` : ""}
          </span>
        )}
      </div>

      {last && (
        <div className="success" style={{ justifyContent: "space-between" }}>
          <span>
            <CheckIcon size={16} style={{ verticalAlign: -3 }} /> {last.po} {last.action === "gone" ? "marked as gone" : "confirmed still here"}
          </span>
          {last.action === "gone" && (
            <button className="btn" onClick={undo}>
              Undo
            </button>
          )}
        </div>
      )}
      {actionError && <p className="error" style={{ marginBottom: 16 }}>{actionError}</p>}

      {loading ? (
        <div className="list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      ) : due.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <CheckIcon size={24} />
          </div>
          <strong>All clear</strong>
          <span>
            {days === 0
              ? "Nothing in stock right now."
              : `Nothing has been sitting ${days}+ days without a check.`}{" "}
            <Link href="/">Back to search</Link>
          </span>
        </div>
      ) : (
        <div className="stack" style={{ gap: 22 }}>
          {groups.map((g) => (
            <section key={g.name}>
              <div className="zone-group-title" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                <PinIcon size={13} /> {g.name} <span className="count-badge">{g.items.length}</span>
              </div>
              <ul className="list">
                {g.items.map((o) => {
                  const d = Math.floor(ageDays(o));
                  return (
                    <li key={o.id} className="sweep-row">
                      <Link href={`/orders/${o.id}`} className="sweep-main">
                        {o.photoThumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="thumb" src={o.photoThumb} alt="" />
                        ) : (
                          <span className="thumb thumb-empty" aria-hidden>
                            <BoxIcon size={20} />
                          </span>
                        )}
                        <span className="order-main">
                          <span className="po">{o.poNumber}</span>
                          {o.itemName && <span className="order-title">{o.itemName}</span>}
                          <span className={`sweep-age age-${d >= SWEEP_DAYS ? "stale" : d >= SWEEP_DAYS / 2 ? "aging" : "fresh"}`}>
                            {d === 0
                              ? o.lastConfirmedAt
                                ? "Checked today"
                                : "Added today"
                              : `${d} day${d === 1 ? "" : "s"} since ${o.lastConfirmedAt ? "last check" : "added"}`}
                          </span>
                        </span>
                        <ChevronRight className="chev" size={18} />
                      </Link>
                      <div className="sweep-actions">
                        <button className="btn" disabled={busy === o.id} onClick={() => act(o, "here")}>
                          <CheckIcon size={16} /> Still here
                        </button>
                        <button className="btn btn-danger" disabled={busy === o.id} onClick={() => act(o, "gone")}>
                          <XIcon size={16} /> Gone
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export default function SweepPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 320 }} />}>
      <Sweep />
    </Suspense>
  );
}
