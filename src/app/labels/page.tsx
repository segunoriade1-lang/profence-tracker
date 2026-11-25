"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, PrintIcon, XIcon } from "@/components/Icons";
import SetupNotice from "@/components/Setup";
import { useOrders } from "@/lib/data";
import { LAYOUTS, loadSelection, PAPERS, saveSelection, type PaperKey } from "@/lib/labelSelection";
import { makeLabel } from "@/lib/qr";

const PREFS_KEY = "pt-label-sheet-prefs";

function LabelSheet() {
  const params = useSearchParams();
  const { orders, loading, error } = useOrders();

  // Which orders: from the link (?ids=a,b,c), or the list selection.
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const fromUrl = (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    setIds(fromUrl.length ? fromUrl : loadSelection());
    setReady(true);
  }, [params]);

  // Layout preferences are remembered between visits.
  const [perPage, setPerPage] = useState<number>(6);
  const [paper, setPaper] = useState<PaperKey>("letter");
  const [cutLines, setCutLines] = useState(true);
  const [skip, setSkip] = useState(0);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      if (LAYOUTS.some((l) => l.perPage === p.perPage)) setPerPage(p.perPage);
      if (p.paper in PAPERS) setPaper(p.paper);
      if (typeof p.cutLines === "boolean") setCutLines(p.cutLines);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ perPage, paper, cutLines }));
    } catch {}
  }, [perPage, paper, cutLines]);

  const layout = LAYOUTS.find((l) => l.perPage === perPage) ?? LAYOUTS[2];
  const sheet = PAPERS[paper];
  const safeSkip = Math.min(skip, layout.perPage - 1);

  const picked = useMemo(() => {
    const byId = new Map(orders.map((o) => [o.id, o]));
    return ids.map((id) => byId.get(id)).filter((o): o is NonNullable<typeof o> => Boolean(o));
  }, [ids, orders]);
  const missing = loading ? 0 : ids.length - picked.length;

  // Draw each label image once.
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    picked.forEach((o) => {
      const key = `${o.id}|${o.poNumber}|${o.locationName}`;
      if (images[key]) return;
      makeLabel(o.id, o.poNumber, o.locationName).then((url) => {
        if (alive) setImages((m) => ({ ...m, [key]: url }));
      });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);

  // Blank spots first (to reuse a part-used sticker sheet), then the labels.
  const cells: (typeof picked[number] | null)[] = [...Array(safeSkip).fill(null), ...picked];
  const pages: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += layout.perPage) pages.push(cells.slice(i, i + layout.perPage));

  const allDrawn = picked.every((o) => images[`${o.id}|${o.poNumber}|${o.locationName}`]);

  function remove(id: string) {
    const next = ids.filter((x) => x !== id);
    setIds(next);
    saveSelection(next);
    const sp = new URLSearchParams(params.toString());
    if (next.length) sp.set("ids", next.join(","));
    else sp.delete("ids");
    window.history.replaceState(null, "", sp.toString() ? `?${sp}` : window.location.pathname);
  }

  return (
    <>
      <SetupNotice error={error} />
      {/* Paper size and margins for the browser's print dialog */}
      <style>{`@media print { @page { size: ${sheet.css}; margin: 0; } }`}</style>

      <div className="print-controls">
        <Link href="/" className="back-link">
          <ArrowLeft size={16} /> Back to orders
        </Link>
        <div className="list-head" style={{ marginTop: 8 }}>
          <div>
            <h1 className="h2" style={{ fontSize: "1.375rem" }}>Print QR labels</h1>
            <div className="muted small">
              {picked.length} label{picked.length === 1 ? "" : "s"} · {pages.length} page{pages.length === 1 ? "" : "s"}
            </div>
          </div>
          <button className="btn btn-primary" disabled={!picked.length || !allDrawn} onClick={() => window.print()}>
            <PrintIcon size={17} /> {allDrawn ? `Print ${pages.length} page${pages.length === 1 ? "" : "s"}` : "Preparing…"}
          </button>
        </div>

        <div className="card sheet-options">
          <div className="opt">
            <span className="opt-label">Labels per page</span>
            <div className="pills pills-sm">
              {LAYOUTS.map((l) => (
                <button
                  key={l.perPage}
                  className={`pill ${l.perPage === perPage ? "pill-on" : ""}`}
                  onClick={() => setPerPage(l.perPage)}
                  title={`${l.cols} across × ${l.rows} down`}
                >
                  {l.perPage}
                </button>
              ))}
            </div>
          </div>
          <div className="opt">
            <span className="opt-label">Paper</span>
            <div className="pills pills-sm">
              {(Object.keys(PAPERS) as PaperKey[]).map((k) => (
                <button key={k} className={`pill ${k === paper ? "pill-on" : ""}`} onClick={() => setPaper(k)}>
                  {PAPERS[k].name}
                </button>
              ))}
            </div>
          </div>
          <div className="opt">
            <label className="opt-label" htmlFor="skip">Leave first spots blank</label>
            <select id="skip" className="select-sm" value={safeSkip} onChange={(e) => setSkip(Number(e.target.value))}>
              {Array.from({ length: layout.perPage }, (_, i) => (
                <option key={i} value={i}>
                  {i === 0 ? "None" : i}
                </option>
              ))}
            </select>
          </div>
          <label className="opt opt-check">
            <input type="checkbox" checked={cutLines} onChange={(e) => setCutLines(e.target.checked)} />
            <span>Dashed cut lines</span>
          </label>
        </div>

        {missing > 0 && (
          <p className="muted small">
            {missing} selected order{missing === 1 ? " was" : "s were"} not found (maybe deleted) and left out.
          </p>
        )}
      </div>

      {!ready || loading ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : picked.length === 0 ? (
        <div className="empty">
          <strong>No labels selected</strong>
          <span>
            On the <Link href="/">orders list</Link>, tap “Select labels”, pick the orders, then “Print labels”.
          </span>
        </div>
      ) : (
        <div className="sheets">
          {pages.map((cellsOnPage, p) => (
            <div
              key={p}
              className="sheet"
              style={
                {
                  "--sheet-w": sheet.w,
                  "--sheet-h": sheet.h,
                  aspectRatio: `${sheet.ratio}`,
                  gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
                } as React.CSSProperties
              }
            >
              {Array.from({ length: layout.perPage }, (_, i) => {
                const o = cellsOnPage[i];
                const src = o ? images[`${o.id}|${o.poNumber}|${o.locationName}`] : null;
                return (
                  <div key={i} className={`sheet-cell ${cutLines ? "has-cut" : ""}`}>
                    {o &&
                      (src ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={src} alt={`QR label ${o.poNumber}`} />
                          <button className="sheet-remove" onClick={() => remove(o.id)} title={`Remove ${o.poNumber}`}>
                            <XIcon size={14} />
                          </button>
                        </>
                      ) : (
                        <span className="muted small">…</span>
                      ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function LabelsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <LabelSheet />
    </Suspense>
  );
}
