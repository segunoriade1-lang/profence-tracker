"use client";

import { ChevronLeft, ChevronRight } from "./Icons";

/** Page numbers to show, with "…" gaps, e.g. 1 … 4 5 6 … 20 */
function pageList(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((p) => pages.add(p));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((p) => pages.add(p));
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export default function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pager" aria-label="Pages">
      <button className="btn" onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft size={16} /> Prev
      </button>
      <div className="pager-pages">
        {pageList(page, totalPages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="pager-gap" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={p}
              className={`pager-num ${p === page ? "pager-on" : ""}`}
              aria-current={p === page ? "page" : undefined}
              aria-label={`Page ${p}`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          )
        )}
      </div>
      <button className="btn" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        Next <ChevronRight size={16} />
      </button>
    </nav>
  );
}
