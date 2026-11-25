"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, BoxIcon, CheckIcon, ChevronRight, EditIcon, MapIcon, PinIcon, PlusIcon, SearchIcon, TrashIcon, XIcon } from "@/components/Icons";
import SetupNotice from "@/components/Setup";
import LocationsManager from "@/components/LocationsManager";
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
  renameLocation,
  setOrderMapPos,
  syncMapLocations,
  useLocations,
  useOrders,
  usePhoto,
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
  const view = params.get("view") === "list" ? "list" : "map";
  const [term, setTerm] = useState("");
  const [activeDot, setActiveDot] = useState<string | null>(null);
  // PO opened in full inside the area pop-up (null = showing the list).
  const [detailId, setDetailId] = useState<string | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  function selectZone(zoneId: string | null) {
    setDetailId(null);
    setEditingName(null);
    setNameError(null);
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
  const zoneNames = useMemo(() => {
    const m: Record<string, string> = {};
    locations.forEach((l) => l.zoneId && l.name && (m[l.zoneId] = l.name));
    return m;
  }, [locations]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  async function onRename(e: React.FormEvent, locationId: string) {
    e.preventDefault();
    const name = (editingName ?? "").trim();
    if (!name) return;
    setSavingName(true);
    setNameError(null);
    try {
      await renameLocation(locationId, name);
      setEditingName(null);
    } catch (err) {
      setNameError(`Couldn't rename: ${(err as Error).message}`);
    } finally {
      setSavingName(false);
    }
  }

  const removedZones = ZONES.filter((z) => !visibleIds.has(z.id));
  const plan = planMapSync(locations);
  // First-time setup only: once any area is on the map, removed areas stay removed.
  const missing = visibleIds.size === 0 ? plan.create.length + plan.link.length : 0;
  const [busyZone, setBusyZone] = useState<string | null>(null);

  async function onRemoveFromMap(locationId: string, label: string) {
    if (!confirm(`Remove “${label}” from the blueprint?\n\nThe location and its POs stay — it just won't be drawn on the blueprint. You can add it back from “Removed areas”.`)) return;
    setBusyZone(label);
    try {
      await removeFromMap(locationId);
      selectZone(null);
      setSyncMsg(`Removed “${label}” from the blueprint.`);
    } finally {
      setBusyZone(null);
    }
  }

  async function onDeleteArea(locationId: string, label: string, poCount: number) {
    const warn = poCount
      ? `Delete “${label}”?\n\n${poCount} PO${poCount === 1 ? " is" : "s are"} stored here. They'll keep the name “${label}” but won't appear on the blueprint until you move them to another location.\n\nThis deletes the location and removes the area from the blueprint.`
      : `Delete “${label}”?\n\nThis deletes the location and removes the area from the blueprint. You can add the area back later from “Removed areas”.`;
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
      setSyncMsg(`Created ${r.created} new location${r.created === 1 ? "" : "s"} and linked ${r.linked} existing one${r.linked === 1 ? "" : "s"} to the blueprint.`);
    } catch (e) {
      setSyncMsg(`Couldn't update locations: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  const zone = selectedZone && visibleIds.has(selectedZone) ? ZONE_BY_ID.get(selectedZone) : undefined;
  const zoneLocation = zone ? locations.find((l) => l.zoneId === zone.id) : undefined;
  const zoneOrders = zone ? byZone[zone.id] ?? [] : [];
  const detailOrder = detailId ? zoneOrders.find((o) => o.id === detailId) : undefined;
  const busiest = ZONES.filter((z) => counts[z.id]).sort((a, b) => counts[b.id] - counts[a.id]);

  // In the pop-up, the first PO on the list starts highlighted (unless a dot in this area was just tapped).
  useEffect(() => {
    if (!zone || zoneOrders.length === 0) return;
    if (!activeDot || !zoneOrders.some((o) => o.id === activeDot)) setActiveDot(zoneOrders[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone?.id, zoneOrders]);

  // Area pop-up: Esc closes it, and the page behind doesn't scroll.
  useEffect(() => {
    if (!zone) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || editingName !== null) return;
      if (detailId) setDetailId(null);
      else selectZone(null);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone?.id, editingName, detailId]);

  return (
    <>
      <SetupNotice error={error} />
      <div className="page-head">
        <div>
          <h1>Phoenix Fence yard</h1>
          <p className="muted">
            {view === "list"
              ? "Every place items can be stored: yard areas, bays, offices, shelves and bins."
              : "Tap an area to see the POs stored there. Find a PO to light up where it is."}
          </p>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="View" style={{ marginBottom: 18 }}>
        <Link href="/map" className={view === "map" ? "on" : ""} role="tab" aria-selected={view === "map"} scroll={false}>
          Blueprint
        </Link>
        <Link href="/map?view=list" className={view === "list" ? "on" : ""} role="tab" aria-selected={view === "list"} scroll={false}>
          Locations list <span className="count-badge">{locations.length}</span>
        </Link>
      </div>

      {view === "list" ? (
        <LocationsManager />
      ) : (
      <>

      {!locLoading && missing > 0 && (
        <div className="notice row between" style={{ alignItems: "center" }}>
          <span>
            <strong>{missing} blueprint area{missing === 1 ? "" : "s"}</strong> aren&apos;t set up as locations yet
            {plan.link.length > 0 && ` (${plan.link.length} will be linked to locations you already have)`}.
          </span>
          <button className="btn btn-primary" onClick={onSync} disabled={syncing}>
            {syncing ? "Setting up…" : "Set up blueprint areas"}
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
            names={zoneNames}
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
              placeholder="Find a PO on the blueprint…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              aria-label="Find POs on the blueprint"
            />
          </div>

          {term.trim() ? (
            <>
              <div className="zone-group-title">
                {matching.length} PO{matching.length === 1 ? "" : "s"} match · {busiest.length} area{busiest.length === 1 ? "" : "s"}
              </div>
              {busiest.length === 0 && offMap.length === 0 && <p className="hint">Nothing matches “{term}”.</p>}
              <div>
                {busiest.map((z) => (
                  <div key={z.id} className="zone-group">
                    <button className="pill" style={{ alignSelf: "flex-start" }} onClick={() => selectZone(z.id)}>
                      <PinIcon size={14} /> {zoneNames[z.id] ?? z.label} <span className="count-badge" style={{ marginLeft: 2 }}>{counts[z.id]}</span>
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
                <p className="hint">No POs on the blueprint yet. Tap an area to see what&apos;s there.</p>
              ) : (
                <div className="pills">
                  {busiest.map((z) => (
                    <button key={z.id} className="pill" onClick={() => selectZone(z.id)}>
                      <PinIcon size={14} /> {zoneNames[z.id] ?? z.label}
                      <span className="count-badge" style={{ marginLeft: 2 }}>{counts[z.id]}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {!locLoading && removedZones.length > 0 && visibleIds.size > 0 && (
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
                    title={`Put ${z.label} back on the blueprint`}
                  >
                    <PlusIcon size={14} /> {z.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {offMap.length > 0 && (
            <>
              <hr className="divider" />
              <div className="zone-group-title">Not on the blueprint ({offMap.length})</div>
              <ul className="panel-list">
                {offMap.slice(0, 5).map((o) => (
                  <OrderItem key={o.id} order={o} active={activeDot === o.id} onHover={setActiveDot} />
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>

      {zone && (
        <div className="sheet-backdrop" onClick={() => selectZone(null)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={zoneLocation?.name || zone.label}
            onClick={(e) => e.stopPropagation()}
          >
              <div className="sheet-head">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="zone-group-title">Selected area</div>
                  {zoneLocation && editingName !== null ? (
                    <form className="row" onSubmit={(e) => onRename(e, zoneLocation.id)} style={{ flexWrap: "nowrap", marginTop: 4 }}>
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && setEditingName(null)}
                        aria-label="Location name"
                        style={{ padding: "8px 10px", minWidth: 0, flex: 1 }}
                        disabled={savingName}
                      />
                      <button className="btn btn-primary btn-icon" aria-label="Save name" disabled={savingName || !editingName.trim()}>
                        <CheckIcon size={16} />
                      </button>
                      <button type="button" className="btn btn-icon" aria-label="Cancel" onClick={() => setEditingName(null)}>
                        <XIcon size={16} />
                      </button>
                    </form>
                  ) : (
                    <h2 className="section-title" style={{ fontSize: "1.25rem" }}>
                      <PinIcon size={18} /> {zoneLocation?.name || zone.label}
                      {zoneLocation && (
                        <button
                          className="btn btn-ghost btn-icon"
                          aria-label="Edit name"
                          title="Edit name"
                          onClick={() => setEditingName(zoneLocation.name || zone.label)}
                        >
                          <EditIcon size={16} />
                        </button>
                      )}
                    </h2>
                  )}
                  {nameError && <p className="error small">{nameError}</p>}
                </div>
                <button className="sheet-close" aria-label="Close area" onClick={() => selectZone(null)}>
                  <XIcon size={22} />
                </button>
              </div>
            <div className="sheet-body stack">
              {detailOrder ? (
                <OrderDetail order={detailOrder} areaName={zoneLocation?.name || zone.label} onBack={() => setDetailId(null)} />
              ) : (
              <>
                {ordersLoading ? (
                  <div className="skeleton" style={{ height: 60 }} />
                ) : zoneOrders.length === 0 ? (
                  <p className="hint">
                    {term.trim() ? `No POs matching “${term}” here.` : "No POs stored here yet."}
                  </p>
                ) : (
                  <ul className="panel-list" role="listbox" aria-label="POs in this area">
                    {zoneOrders.map((o) => (
                      <OrderItem
                        key={o.id}
                        order={o}
                        active={activeDot === o.id}
                        onSelect={() => setActiveDot(o.id)}
                        onOpen={() => {
                          setActiveDot(o.id);
                          setDetailId(o.id);
                        }}
                      />
                    ))}
                  </ul>
                )}
                {zoneOrders.length > 1 && <p className="hint" style={{ margin: 0 }}>Tap a PO to find it on the blueprint · tap it again for details</p>}
                {zoneLocation && (
                  <div className="area-actions" style={zoneOrders.length ? undefined : { gridTemplateColumns: "1fr" }}>
                    <Link href={`/orders/new?loc=${zoneLocation.id}`} className="btn btn-primary">
                      <PlusIcon size={16} /> Add order here
                    </Link>
                    {zoneOrders.length > 0 && (
                      <button
                        className="btn"
                        disabled={!activeDot || !zoneOrders.some((o) => o.id === activeDot)}
                        onClick={() => setDetailId(activeDot)}
                      >
                        View details <ChevronRight size={16} />
                      </button>
                    )}
                  </div>
                )}
                {zoneLocation && (
                  <>
                    <hr className="divider" />
                    <div className="zone-group-title">Manage this area</div>
                    <div className="area-actions">
                      <button
                        className="btn"
                        disabled={!!busyZone}
                        onClick={() => onRemoveFromMap(zoneLocation.id, zoneLocation.name || zone.label)}
                      >
                        <XIcon size={15} /> Remove from blueprint
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
                      <b>Remove from blueprint</b> keeps the location so you can still store POs there. <b>Delete area</b> deletes the location too.
                    </p>
                  </>
                )}
              </>
              )}
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </>
  );
}

function OrderItem({
  order,
  active,
  onHover,
  onSelect,
  onOpen,
}: {
  order: InventoryOrder;
  active?: boolean;
  onHover?: (id: string) => void;
  /** In the area pop-up: a tap highlights the PO instead of leaving the page. */
  onSelect?: () => void;
  /** Double-click / second tap on the highlighted PO opens its details. */
  onOpen?: () => void;
}) {
  const content = (
    <>
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
      {active && onSelect ? <CheckIcon className="chev" size={18} /> : <ChevronRight className="chev" size={18} />}
    </>
  );
  if (onSelect) {
    return (
      <li role="option" aria-selected={!!active}>
        <button
          type="button"
          className={`panel-item panel-item-btn ${active ? "is-active" : ""}`}
          onClick={() => (active && onOpen ? onOpen() : onSelect())}
          onDoubleClick={onOpen}
        >
          {content}
        </button>
      </li>
    );
  }
  return (
    <li onMouseEnter={() => onHover?.(order.id)} onFocus={() => onHover?.(order.id)}>
      <Link href={`/orders/${order.id}`} className={`panel-item ${active ? "is-active" : ""}`}>
        {content}
      </Link>
    </li>
  );
}

/** A PO's details shown inside the area pop-up, with a way back to the list. */
function OrderDetail({ order, areaName, onBack }: { order: InventoryOrder; areaName: string; onBack: () => void }) {
  const photo = usePhoto(order.id, order.hasPhoto);
  const created = order.createdAt?.toDate?.();
  return (
    <div className="stack">
      <button type="button" className="back-link sheet-back" onClick={onBack}>
        <ArrowLeft size={16} /> Back to {areaName}
      </button>
      <dl className="detail-list">
        <div className="detail-item">
          <dt>Purchase order</dt>
          <dd className="po po-lg">{order.poNumber}</dd>
        </div>
        {order.itemName && (
          <div className="detail-item">
            <dt>Item</dt>
            <dd style={{ fontWeight: 500, fontSize: "1rem" }}>{order.itemName}</dd>
          </div>
        )}
        {order.description && (
          <div className="detail-item">
            <dt>Description</dt>
            <dd className="prewrap">{order.description}</dd>
          </div>
        )}
        {order.hasPhoto && (photo || order.photoThumb) && (
          <div className="detail-item">
            <dt>Photo</dt>
            <dd>
              <div className="photo-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo ?? order.photoThumb ?? ""} alt="Order photo" />
              </div>
            </dd>
          </div>
        )}
        {created && (
          <div className="detail-item">
            <dt>Added</dt>
            <dd className="muted">
              {created.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </dd>
          </div>
        )}
      </dl>
      <div className="area-actions">
        <button type="button" className="btn" onClick={onBack}>
          <ArrowLeft size={16} /> Back to list
        </button>
        <Link href={`/orders/${order.id}`} className="btn btn-primary">
          Edit, move or pick up <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 480 }} />}>
      <MapView />
    </Suspense>
  );
}
