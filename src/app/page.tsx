"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BoxIcon, CheckIcon, ChevronRight, MapIcon, PinIcon, PlusIcon, SearchIcon, XIcon } from "@/components/Icons";
import Pagination from "@/components/Pagination";
import { GROUP_ORDER, groupOf, type LocGroup } from "@/lib/siteMap";
import SetupNotice from "@/components/Setup";
import { ageDays, isReleased, matchesSearch, SWEEP_DAYS, useLocations, useOrders } from "@/lib/data";

const PAGE_SIZE = 30;

function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { orders, loading, error } = useOrders();
  const { locations } = useLocations();

  // Search, filter and page live in the URL so Back from an order returns here.
  const [term, setTerm] = useState(params.get("q") ?? "");
  const locationId = params.get("loc") ?? "";
  // "In stock" (default) or "Released" (picked up) tab
  const showReleased = params.get("view") === "released";
  const grpParam = params.get("grp") as LocGroup | null;
  const requestedPage = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const listTop = useRef<HTMLDivElement>(null);

  function setQuery(next: { q?: string; loc?: string; grp?: string; page?: number }) {
    const sp = new URLSearchParams(params.toString());
    const set = (k: string, v: string | undefined) => (v ? sp.set(k, v) : sp.delete(k));
    if ("q" in next) set("q", next.q?.trim() || undefined);
    if ("loc" in next) set("loc", next.loc || undefined);
    if ("grp" in next) set("grp", next.grp || undefined);
    set("page", next.page && next.page > 1 ? String(next.page) : undefined);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Update the URL shortly after typing stops (and go back to page 1).
  useEffect(() => {
    if (term.trim() === (params.get("q") ?? "")) return;
    const t = setTimeout(() => setQuery({ q: term, loc: locationId }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const inStock = useMemo(() => orders.filter((o) => !isReleased(o)), [orders]);
  const released = useMemo(
    () =>
      orders
        .filter(isReleased)
        .sort((a, b) => (b.releasedAt?.toMillis?.() ?? Date.now()) - (a.releasedAt?.toMillis?.() ?? Date.now())),
    [orders]
  );
  const dueCount = inStock.filter((o) => ageDays(o) >= SWEEP_DAYS).length;

  // location id -> Yard / Bays / Offices / Other
  const groupOfLoc = useMemo(() => {
    const m = new Map<string, LocGroup>();
    locations.forEach((l) => m.set(l.id, groupOf(l.zoneId)));
    return m;
  }, [locations]);
  const grpOfOrder = (o: { locationId: string }) => groupOfLoc.get(o.locationId) ?? "other";
  // A location picked elsewhere (e.g. from the map) opens its group too.
  const activeGroup: LocGroup | "" =
    grpParam && GROUP_ORDER.includes(grpParam) ? grpParam : locationId ? groupOfLoc.get(locationId) ?? "" : "";

  const listBase = showReleased ? released : inStock;
  const results = useMemo(
    () =>
      listBase.filter(
        (o) =>
          (locationId ? o.locationId === locationId : !activeGroup || grpOfOrder(o) === activeGroup) &&
          matchesSearch(o, term)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listBase, term, locationId, activeGroup, groupOfLoc]
  );

  function tabHref(view: "stock" | "released") {
    const sp = new URLSearchParams(params.toString());
    sp.delete("page");
    if (view === "released") sp.set("view", "released");
    else sp.delete("view");
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = results.slice(start, start + PAGE_SIZE);

  function goToPage(p: number) {
    setQuery({ page: p });
    listTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const filtering = Boolean(term.trim() || locationId || activeGroup);

  return (
    <>
      <SetupNotice error={error} />

      <section className="hero">
        <div className="eyebrow">
          <SearchIcon size={14} /> Inventory finder
        </div>
        <h1>Where did we put it?</h1>
        <p className="lead">Search any PO number, item, note or location — find it in seconds.</p>
        <div className="search-wrap">
          <SearchIcon size={20} />
          <input
            className="search"
            type="search"
            autoFocus
            placeholder="Search PO-10432, fence posts, Red Ramp…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            aria-label="Search orders"
          />
        </div>
        {locationId && (
          <div className="pills pills-sm" style={{ marginTop: 12 }}>
            <button className="pill pill-on" onClick={() => setQuery({ q: term, grp: "", loc: "" })} title="Show all locations">
              <PinIcon size={14} />
              {locations.find((l) => l.id === locationId)?.name ?? "Location"}
              <XIcon size={13} />
            </button>
          </div>
        )}
        {!loading && orders.length > 0 && (
          <div className="stats">
            <span className="stat">
              <BoxIcon size={15} /> <b>{inStock.length}</b> in stock
            </span>
            {dueCount > 0 ? (
              <Link href="/sweep" className="stat stat-link is-due">
                <SearchIcon size={15} /> <b>{dueCount}</b> due for a sweep <ChevronRight size={14} />
              </Link>
            ) : (
              <Link href="/sweep" className="stat stat-link">
                <CheckIcon size={15} /> Sweep up to date
              </Link>
            )}
            <span className="stat">
              <MapIcon size={15} /> <b>{locations.length}</b> location{locations.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </section>

      <div className="list-head" ref={listTop} style={{ scrollMarginTop: 90 }}>
        <div>
          <div className="seg" role="tablist" aria-label="Order status" style={{ marginBottom: 8 }}>
            <Link href={tabHref("stock")} className={!showReleased ? "on" : ""} role="tab" aria-selected={!showReleased} scroll={false}>
              In stock <span className="count-badge">{inStock.length}</span>
            </Link>
            <Link href={tabHref("released")} className={showReleased ? "on" : ""} role="tab" aria-selected={showReleased} scroll={false}>
              Released <span className="count-badge">{released.length}</span>
            </Link>
          </div>
          <h2 className="h2">
            {filtering
              ? `${results.length} result${results.length === 1 ? "" : "s"}`
              : showReleased
                ? "Picked up, newest first"
                : "All orders in stock"}
          </h2>
          {results.length > PAGE_SIZE && (
            <div className="muted small">
              Showing {start + 1}–{start + pageItems.length} of {results.length}
            </div>
          )}
        </div>
        <Link href="/orders/new" className="btn btn-primary">
          <PlusIcon size={17} /> New inventory order
        </Link>
      </div>

      {loading ? (
        <div className="list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            {orders.length === 0 ? <BoxIcon size={24} /> : <SearchIcon size={24} />}
          </div>
          {orders.length === 0 ? (
            <>
              <strong>No orders yet</strong>
              <span>
                Add your <Link href="/map?view=list">office locations</Link>, then{" "}
                <Link href="/orders/new">create your first inventory order</Link>.
              </span>
            </>
          ) : showReleased && released.length === 0 ? (
            <>
              <strong>Nothing picked up yet</strong>
              <span>When a PO is given out, open it (or scan its QR) and tap “Mark as picked up”.</span>
            </>
          ) : !showReleased && inStock.length === 0 ? (
            <>
              <strong>Nothing in stock</strong>
              <span>Every PO has been picked up. <Link href="/orders/new">Add a new one</Link>.</span>
            </>
          ) : (
            <>
              <strong>No matches</strong>
              <span>Try a different PO number, word or location.</span>
            </>
          )}
        </div>
      ) : (
        <>
          <ul className="list">
            {pageItems.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="order-row">
                  {o.photoThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="thumb" src={o.photoThumb} alt="" />
                  ) : (
                    <div className="thumb thumb-empty" aria-hidden>
                      <BoxIcon size={22} />
                    </div>
                  )}
                  <div className="order-main">
                    <div className="po">{o.poNumber}</div>
                    {o.itemName && <div className="order-title">{o.itemName}</div>}
                    {o.description && <div className="order-desc">{o.description}</div>}
                  </div>
                  {isReleased(o) ? (
                    <span className="released-chip" title={`Was at ${o.locationName}`}>
                      <CheckIcon size={14} />
                      Picked up{o.releasedAt?.toDate ? ` ${o.releasedAt.toDate().toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                    </span>
                  ) : (
                    <span className="loc-chip">
                      <PinIcon size={14} />
                      {o.locationName || "No location"}
                    </span>
                  )}
                  <ChevronRight className="chev" size={20} />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} totalPages={totalPages} onChange={goToPage} />
        </>
      )}
    </>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <Home />
    </Suspense>
  );
}
