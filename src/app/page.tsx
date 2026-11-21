"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BoxIcon, ChevronRight, MapIcon, PinIcon, PlusIcon, SearchIcon } from "@/components/Icons";
import Pagination from "@/components/Pagination";
import SetupNotice from "@/components/Setup";
import { matchesSearch, useLocations, useOrders } from "@/lib/data";

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
  const requestedPage = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const listTop = useRef<HTMLDivElement>(null);

  function setQuery(next: { q?: string; loc?: string; page?: number }) {
    const sp = new URLSearchParams(params.toString());
    const set = (k: string, v: string | undefined) => (v ? sp.set(k, v) : sp.delete(k));
    if ("q" in next) set("q", next.q?.trim() || undefined);
    if ("loc" in next) set("loc", next.loc || undefined);
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

  const results = useMemo(
    () =>
      orders.filter(
        (o) => (!locationId || o.locationId === locationId) && matchesSearch(o, term)
      ),
    [orders, term, locationId]
  );

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * PAGE_SIZE;
  const pageItems = results.slice(start, start + PAGE_SIZE);

  function goToPage(p: number) {
    setQuery({ page: p });
    listTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const filtering = Boolean(term.trim() || locationId);

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
        {locations.length > 0 && (
          <div className="pills pills-sm">
            <button
              className={`pill ${!locationId ? "pill-on" : ""}`}
              onClick={() => setQuery({ q: term, loc: "" })}
            >
              All locations
            </button>
            {locations.map((l) => (
              <button
                key={l.id}
                className={`pill ${locationId === l.id ? "pill-on" : ""}`}
                onClick={() => setQuery({ q: term, loc: locationId === l.id ? "" : l.id })}
              >
                <PinIcon size={14} />
                {l.name}
              </button>
            ))}
          </div>
        )}
        {!loading && orders.length > 0 && (
          <div className="stats">
            <span className="stat">
              <BoxIcon size={15} /> <b>{orders.length}</b> order{orders.length === 1 ? "" : "s"}
            </span>
            <span className="stat">
              <MapIcon size={15} /> <b>{locations.length}</b> location{locations.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </section>

      <div className="list-head" ref={listTop} style={{ scrollMarginTop: 90 }}>
        <div>
          <h2 className="h2">
            {filtering
              ? `${results.length} result${results.length === 1 ? "" : "s"}`
              : "All orders"}
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
                Add your <Link href="/locations">office locations</Link>, then{" "}
                <Link href="/orders/new">create your first inventory order</Link>.
              </span>
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
                  <span className="loc-chip">
                    <PinIcon size={14} />
                    {o.locationName || "No location"}
                  </span>
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
