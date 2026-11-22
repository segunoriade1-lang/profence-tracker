"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { BoxIcon, ChevronRight, MapIcon, PinIcon, PlusIcon, SearchIcon, TrashIcon, XIcon } from "@/components/Icons";
import SetupNotice from "@/components/Setup";
import SiteMap, { type MapDot } from "@/components/SiteMap";
import {
  addZoneBack,
  ageLevel,
  SWEEP_DAYS,
  isReleased,
  deleteLocation,
  matchesSearch,
  planMapSync,
  removeFromMap,
  setOrderMapPos,
  syncMapLocations,
  useLocations,
  useOrders,
  type InventoryOrder,
} from "@/lib/data";
import { ZONE_BY_ID, ZONES } from "@/lib/siteMap";

const EMPTY = new Set<string>();

function MapView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { orders, loading: ordersLoading, error } = useOrders();
  const { locations, loading: locLoading } = useLocations();

  const selectedZone = params.get("zone");
  const [term, setTerm] = useState("");
  const [activeDot, setActiveDot] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  function selectZone(zoneId: string | null) {
    const sp = new URLSearchParams(params.toString());
    if (zoneId && zoneId !== selectedZone) sp.set("zone", zoneId);
    else sp.delete("zone");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // location id -> zone id
  const zoneOfLocation = useMemo(() => {
    const m = new Map<string, string>();
    locations.forEach((l) => l.zoneId && m.set(l.id, l.zoneId));
    return m;
  }, [locations]);

  // Picked-up POs are off the map.
  const stored = useMemo(() => orders.filter((o) => !isReleased(o)), [orders]);
  const matching = useMemo(
    () => (term.trim() ? stored.filter((o) => matchesSearch(o, term)) : stored),
    [stored, term]
  );

  // POs per zone (respecting the search)
  const byZone = useMemo(() => {
    const m: Record<string, InventoryOrder[]> = {};
    for (const o of matching) {
      const z = zoneOfLocation.get(o.locationId);
      if (z) (m[z] ??= []).push(o);
    }
    return m;
  }, [matching, zoneOfLocation]);

  const counts = useMemo(
    () => Object.fromEntries(Object.entries(byZone).map(([z, list]) => [z, list.length])),
    [byZone]
  );
  const highlightIds = term.trim() ? new Set(Object.keys(byZone)) : null;

  // Every PO (matching the search) as a pulsing dot inside its area.
  const dots: MapDot[] = useMemo(
    () =>
      matching.flatMap((o) => {
        const z = zoneOfLocation.get(o.locationId);
        return z ? [{ id: o.id, zoneId: z, label: o.poNumber, pos: o.mapPos ?? null, age: ageLevel(o) }] : [];
      }),
    [matching, zoneOfLocation]
  );

  function openZone(zoneId: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("zone", zoneId);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  async function onDotMove(id: string, x: number, y: number) {
    setActiveDot(id);
    setMoveError(null);
    try {
      await setOrderMapPos(id, x, y);
    } catch (e) {
      setMoveError(`Couldn't save the new spot: ${(e as Error).message}`);
    }
  }

  function onDotClick(id: string) {
    setActiveDot(id);
    const o = orders.find((x) => x.id === id);
    const z = o && zoneOfLocation.get(o.locationId);
    if (z && z !== selectedZone) openZone(z);
  }
  const offMap = matching.filter((o) => !zoneOfLocation.get(o.locationId));

  // Areas are on the map only while a location is linked to them.
  const visibleIds = useMemo(
    () => new Set(locations.map((l) => l.zoneId).filter(Boolean) as string[]),
    [locations]
  );
  const removedZones = ZONES.filter((z) => !visibleIds.has(z.id));
  const plan = planMapSync(locations);
  // First-time setup only: once any area is on the map, removed areas stay removed.
  const missing = visibleIds.size === 0 ? plan.create.length + plan.link.length : 0;
  const [busyZone, setBusyZone] = useState<string | null>(null);

  async function onRemoveFromMap(locationId: string, label: string) {
    if (!confirm(`Remove “${label}” from the map?\n\nThe location and its POs stay — it just won't be drawn on the map. You can add it back from “Removed areas”.`)) return;
    setBusyZone(label);
    try {
      await removeFromMap(locationId);
      selectZone(null);
      setSyncMsg(`Removed “${label}” from the map.`);
    } finally {
      setBusyZone(null);
    }
  }

  async function onDeleteArea(locationId: string, label: string, poCount: number) {
    const warn = poCount
      ? `Delete “${label}”?\n\n${poCount} PO${poCount === 1 ? " is" : "s are"} stored here. They'll keep the name “${label}” but won't appear on the map until you move them to another location.\n\nThis deletes the location and removes the area from the map.`
      : `Delete “${label}”?\n\nThis deletes the location and removes the area from the map. You can add the area back later from “Removed areas”.`;
    if (!confirm(warn)) return;
    setBusyZone(label);
    try {
      await deleteLocation(locationId);
      selectZone(null);
      setSyncMsg(`Deleted “${label}”.`);
    } finally {
      setBusyZone(null);
    }
  }

  async function onAddBack(zoneId: string) {
    const z = ZONE_BY_ID.get(zoneId);
    if (!z) return;
    setBusyZone(z.label);
    try {
      const r = await addZoneBack(z, locations);
      setSyncMsg("linked" in r ? `Added “${z.label}” back, linked to your “${r.linked}” location.` : `Added “${z.label}” back as a new location.`);
      selectZone(zoneId);
    } finally {
      setBusyZone(null);
    }
  }

  async function onSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await syncMapLocations(locations);
      setSyncMsg(`Created ${r.created} new location${r.created === 1 ? "" : "s"} and linked ${r.linked} existing one${r.linked === 1 ? "" : "s"} to the map.`);
    } catch (e) {
      setSyncMsg(`Couldn't update locations: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  const zone = selectedZone && visibleIds.has(selectedZone) ? ZONE_BY_ID.get(selectedZone) : undefined;
  const zoneLocation = zone ? locations.find((l) => l.zoneId === zone.id) : undefined;
  const zoneOrders = zone ? byZone[zone.id] ?? [] : [];
  const busiest = ZONES.filter((z) => counts[z.id]).sort((a, b) => counts[b.id] - counts[a.id]);

  return (
    <>
      <SetupNotice error={error} />
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <MapIcon size={14} /> Site map
          </div>
          <h1>Phoenix Fence yard</h1>
          <p className="muted">Tap an area to see the POs stored there. Search to light up where items are.</p>
        </div>
      </div>

      {!locLoading && missing > 0 && (
        <div className="notice row between" style={{ alignItems: "center" }}>
          <span>
            <strong>{missing} map area{missing === 1 ? "" : "s"}</strong> aren&apos;t set up as locations yet
            {plan.link.length > 0 && ` (${plan.link.length} will be linked to locations you already have)`}.
          </span>
          <button className="btn btn-primary" onClick={onSync} disabled={syncing}>
            {syncing ? "Setting up…" : "Set up map locations"}
          </button>
        </div>
      )}
      {syncMsg && <div className="success">{syncMsg}</div>}
      {moveError && <p className="error" style={{ marginBottom: 16 }}>{moveError}</p>}

      <div className="map-layout">
        <div className="card map-card">
          <SiteMap
            zoomable
            visibleIds={locLoading ? EMPTY : visibleIds}
            counts={counts}
            selectedId={zone ? zone.id : null}
            highlightIds={highlightIds}
            onSelect={(id) => selectZone(id)}
            dots={dots}
            activeDotId={activeDot}
            onDotMove={onDotMove}
            onDotClick={onDotClick}
          />
          <div className="map-legend">
            <span><i className="lg-building" /> Main building</span>
            <span><i className="lg-shed" /> Sheds &amp; ramp</span>
            <span><i className="lg-yard" /> Yard</span>
            <span><i className="lg-dot" /> PO · under {SWEEP_DAYS / 2} days</span>
            <span><i className="lg-dot lg-aging" /> {SWEEP_DAYS / 2}–{SWEEP_DAYS} days</span>
            <span><i className="lg-dot lg-stale" /> {SWEEP_DAYS}+ days · <Link href="/sweep">sweep</Link></span>
            <span className="muted">Drag a dot to its exact spot</span>
          </div>
        </div>

        <aside className="card stack map-panel">
          <div className="search-wrap">
            <SearchIcon size={18} />
            <input
              className="search"
              style={{ padding: "13px 14px 13px 46px", fontSize: "0.98rem" }}
              type="search"
              placeholder="Find a PO on the map…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="Search POs on the map"
            />
          </div>

          {zone ? (
            <>
              <div className="row between" style={{ flexWrap: "nowrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="zone-group-title">Selected area</div>
                  <h2 className="section-title" style={{ fontSize: "1.25rem" }}>
                    <PinIcon size={18} /> {zone.label}
                  </h2>
                  {zoneLocation && zoneLocation.name !== zone.label && (
                    <div className="muted small">Location name: {zoneLocation.name}</div>
                  )}
                </div>
                <button className="btn btn-ghost btn-icon" aria-label="Clear selection" onClick={() => selectZone(null)}>
                  <XIcon size={18} />
                </button>
              </div>
              {ordersLoading ? (
                <div className="skeleton" style={{ height: 60 }} />
              ) : zoneOrders.length === 0 ? (
                <p className="hint">
                  {term.trim() ? `No POs matching “${term}” here.` : "No POs stored here yet."}
                </p>
              ) : (
                <ul className="panel-list">
                  {zoneOrders.map((o) => (
                    <OrderItem key={o.id} order={o} active={activeDot === o.id} onHover={setActiveDot} />
                  ))}
                </ul>
              )}
              {zoneLocation && zoneOrders.length > 0 && (
                <Link href={`/?loc=${zoneLocation.id}`} className="btn">
                  Open in search <ChevronRight size={16} />
                </Link>
              )}
              {zoneLocation && (
                <>
                  <hr className="divider" />
                  <div className="zone-group-title">Manage this area</div>
                  <div className="area-actions">
                    <button
                      className="btn"
                      disabled={!!busyZone}
                      onClick={() => onRemoveFromMap(zoneLocation.id, zone.label)}
                    >
                      <XIcon size={15} /> Remove from map
                    </button>
                    <button
                      className="btn btn-danger"
                      disabled={!!busyZone}
                      onClick={() => onDeleteArea(zoneLocation.id, zoneLocation.name, (byZone[zone.id] ?? []).length)}
                    >
                      <TrashIcon size={15} /> Delete area
                    </button>
                  </div>
                  <p className="hint">
                    <b>Remove from map</b> keeps the location for picking and search. <b>Delete area</b> deletes the location too.
                  </p>
                </>
              )}
            </>
          ) : term.trim() ? (
            <>
              <div className="zone-group-title">
                {matching.length} PO{matching.length === 1 ? "" : "s"} match · {busiest.length} area{busiest.length === 1 ? "" : "s"}
              </div>
              {busiest.length === 0 && offMap.length === 0 && <p className="hint">Nothing matches “{term}”.</p>}
              <div>
                {busiest.map((z) => (
                  <div key={z.id} className="zone-group">
                    <button className="pill" style={{ alignSelf: "flex-start" }} onClick={() => selectZone(z.id)}>
                      <PinIcon size={14} /> {z.label} <span className="count-badge" style={{ marginLeft: 2 }}>{counts[z.id]}</span>
                    </button>
                    <ul className="panel-list">
                      {byZone[z.id].slice(0, 5).map((o) => (
                        <OrderItem key={o.id} order={o} active={activeDot === o.id} onHover={setActiveDot} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="zone-group-title">Busiest areas</div>
              {busiest.length === 0 ? (
                <p className="hint">No POs on the map yet. Tap an area to see what&apos;s there.</p>
              ) : (
                <div className="pills">
                  {busiest.map((z) => (
                    <button key={z.id} className="pill" onClick={() => selectZone(z.id)}>
                      <PinIcon size={14} /> {z.label}
                      <span className="count-badge" style={{ marginLeft: 2 }}>{counts[z.id]}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {!zone && !locLoading && removedZones.length > 0 && visibleIds.size > 0 && (
            <>
              <hr className="divider" />
              <div className="zone-group-title">Removed areas ({removedZones.length})</div>
              <div className="pills">
                {removedZones.map((z) => (
                  <button
                    key={z.id}
                    className="pill pill-ghost"
                    disabled={!!busyZone}
                    onClick={() => onAddBack(z.id)}
                    title={`Put ${z.label} back on the map`}
                  >
                    <PlusIcon size={14} /> {z.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {offMap.length > 0 && !zone && (
            <>
              <hr className="divider" />
              <div className="zone-group-title">Not on the map ({offMap.length})</div>
              <ul className="panel-list">
                {offMap.slice(0, 5).map((o) => (
                  <OrderItem key={o.id} order={o} active={activeDot === o.id} onHover={setActiveDot} />
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </>
  );
}

function OrderItem({
  order,
  active,
  onHover,
}: {
  order: InventoryOrder;
  active?: boolean;
  onHover?: (id: string) => void;
}) {
  return (
    <li onMouseEnter={() => onHover?.(order.id)} onFocus={() => onHover?.(order.id)}>
      <Link href={`/orders/${order.id}`} className={`panel-item ${active ? "is-active" : ""}`}>
        {order.photoThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="thumb" src={order.photoThumb} alt="" />
        ) : (
          <span className="thumb thumb-empty" aria-hidden>
            <BoxIcon size={18} />
          </span>
        )}
        <span className="order-main">
          <span className="po">{order.poNumber}</span>
          {order.itemName && <span className="order-desc">{order.itemName}</span>}
        </span>
        <ChevronRight className="chev" size={18} />
      </Link>
    </li>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 480 }} />}>
      <MapView />
    </Suspense>
  );
}
