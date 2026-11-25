"use client";

import { useEffect, useRef, useState } from "react";
import {
  LANDMARKS,
  SITE_OUTLINE,
  VIEWBOX,
  ZONE_BY_ID,
  ZONES,
  bbox,
  clampToZone,
  resolveSpot,
  type Zone,
} from "@/lib/siteMap";

/** A PO drawn as a pulsing dot inside its area. */
export type MapDot = {
  id: string;
  zoneId: string;
  label: string;
  pos?: { x: number; y: number } | null;
  /** Colours the dot by how long it's been sitting there. */
  age?: "fresh" | "aging" | "stale";
};

const pts = (p: [number, number][]) => p.map(([x, y]) => `${x},${y}`).join(" ");

type Box = { x: number; y: number; w: number; h: number };
const PAD = 6;
const FULL: Box = { x: VIEWBOX.x - PAD, y: VIEWBOX.y - PAD, w: VIEWBOX.w + PAD * 2, h: VIEWBOX.h + PAD * 2 };
const MAIN_BUILDING: Box = { x: 262, y: 100, w: 480, h: 470 };

/** A view around one zone with surrounding context, in a landscape-ish frame (for the mini map). */
function focusBox(zoneId: string): Box {
  const z = ZONE_BY_ID.get(zoneId);
  if (!z) return FULL;
  const b = bbox(z.points);
  const w = Math.min(FULL.w, Math.max(b.w * 2.2, b.h * 1.6, 620));
  const h = Math.min(FULL.h, Math.max(b.h * 1.6, w * 0.62));
  const x = Math.min(FULL.x + FULL.w - w, Math.max(FULL.x, b.x + b.w / 2 - w / 2));
  const y = Math.min(FULL.y + FULL.h - h, Math.max(FULL.y, b.y + b.h / 2 - h / 2));
  return { x, y, w, h };
}

/** Picks font size, orientation and line breaks so the label fits inside the zone. */
function labelLayout(zone: Zone) {
  const b = bbox(zone.points);
  let cx = b.x + b.w / 2;
  let cy = b.y + b.h / 2;
  let w = b.w;
  let h = b.h;
  // For the L-shaped zones, anchor the label in the larger part.
  if (zone.id === "back-40") {
    cy = 932 + (1828 - 932) / 2;
    h = 1828 - 932;
  } else if (zone.id === "front-of-vinyl-shed") {
    cx = 1349;
    cy = 585 + (882 - 585) / 2;
    w = 98;
    h = 297;
  }
  const vertical = h > w * 1.4;
  const length = (vertical ? h : w) * 0.86;
  const thickness = vertical ? w : h;

  const one = Math.min(thickness * 0.42, length / (zone.label.length * 0.56), 34);
  let lines = [zone.label];
  let size = one;
  const words = zone.label.split(" ");
  if (words.length > 1) {
    // best split into two balanced lines
    let best = [zone.label, ""];
    let bestLen = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(" ");
      const c = words.slice(i).join(" ");
      const m = Math.max(a.length, c.length);
      if (m < bestLen) {
        bestLen = m;
        best = [a, c];
      }
    }
    const two = Math.min(thickness * 0.36, length / (bestLen * 0.56), 34);
    if (two > one * 1.15) {
      lines = best;
      size = two;
    }
  }
  return { cx, cy, vertical, size: Math.max(7, size), lines, b };
}

export default function SiteMap({
  counts = {},
  selectedId,
  highlightIds,
  onSelect,
  compact = false,
  zoomable = false,
  visibleIds,
  dots,
  activeDotId,
  onDotMove,
  onDotClick,
  names,
  className = "",
}: {
  /** POs to draw as pulsing dots. */
  dots?: MapDot[];
  /** The dot to emphasise (bigger, with its PO number shown). */
  activeDotId?: string | null;
  /** Makes dots draggable; called with the spot a dot was dropped at (kept inside its area). */
  onDotMove?: (id: string, x: number, y: number) => void;
  onDotClick?: (id: string) => void;
  /** Custom label per zone id (e.g. the linked location's name). */
  names?: Record<string, string>;
  /** Only these zones are drawn (areas removed from the map are left out). Omit to draw all. */
  visibleIds?: Set<string> | null;
  /** Number of POs per zone id. */
  counts?: Record<string, number>;
  selectedId?: string | null;
  /** When set, only these zones are emphasised (e.g. search matches). */
  highlightIds?: Set<string> | null;
  onSelect?: (zoneId: string) => void;
  compact?: boolean;
  zoomable?: boolean;
  className?: string;
}) {
  const interactive = Boolean(onSelect);
  const focusMode = Boolean(selectedId || highlightIds);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<Box>(() => (compact && selectedId ? focusBox(selectedId) : FULL));
  const drag = useRef<{ x: number; y: number; view: Box; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const zoomed = view.w < FULL.w - 1;

  // Size of the drawn map in screen pixels, so dots stay the same on-screen size at any zoom.
  const [px, setPx] = useState({ w: 600, h: 760 });
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPx({ w: el.clientWidth || 600, h: el.clientHeight || 760 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const unitsPerPx = Math.max(view.w / px.w, view.h / px.h);

  // Dot being dragged: its live position until it's dropped and saved.
  const [dragDot, setDragDot] = useState<{ id: string; x: number; y: number } | null>(null);
  const dotDrag = useRef<{ id: string; zone: Zone; moved: boolean; startX: number; startY: number } | null>(null);
  const [justDropped, setJustDropped] = useState<Record<string, { x: number; y: number }>>({});

  function toSvgPoint(clientX: number, clientY: number) {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const r = p.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  }

  function onDotPointerDown(e: React.PointerEvent<SVGGElement>, dot: MapDot, zone: Zone) {
    e.stopPropagation(); // don't start panning the map
    if (!onDotMove && !onDotClick) return;
    dotDrag.current = { id: dot.id, zone, moved: false, startX: e.clientX, startY: e.clientY };
    if (onDotMove) (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onDotPointerMove(e: React.PointerEvent<SVGGElement>) {
    const d = dotDrag.current;
    if (!d || !onDotMove) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    const p = toSvgPoint(e.clientX, e.clientY);
    if (!p) return;
    const c = clampToZone(p, d.zone, Math.min(4, unitsPerPx * 6));
    setDragDot({ id: d.id, x: c.x, y: c.y });
  }
  function onDotPointerUp(e: React.PointerEvent<SVGGElement>) {
    const d = dotDrag.current;
    dotDrag.current = null;
    if (!d) return;
    e.stopPropagation();
    if (d.moved && dragDot && dragDot.id === d.id && onDotMove) {
      setJustDropped((m) => ({ ...m, [d.id]: { x: dragDot.x, y: dragDot.y } }));
      onDotMove(d.id, dragDot.x, dragDot.y);
    } else if (!d.moved && onDotClick) {
      onDotClick(d.id);
    }
    setDragDot(null);
  }
  function onDotKeyDown(e: React.KeyboardEvent<SVGGElement>, dot: MapDot, zone: Zone, at: { x: number; y: number }) {
    const step = unitsPerPx * (e.shiftKey ? 20 : 5);
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key === "Enter" && onDotClick) {
      e.preventDefault();
      onDotClick(dot.id);
      return;
    }
    const dd = delta[e.key];
    if (!dd || !onDotMove) return;
    e.preventDefault();
    const c = clampToZone({ x: at.x + dd[0], y: at.y + dd[1] }, zone, Math.min(4, unitsPerPx * 6));
    setJustDropped((m) => ({ ...m, [dot.id]: c }));
    onDotMove(dot.id, c.x, c.y);
  }

  // Forget optimistic positions once the saved position comes back from the database.
  useEffect(() => {
    if (!dots) return;
    setJustDropped((m) => {
      let changed = false;
      const next = { ...m };
      for (const id of Object.keys(m)) {
        const d = dots.find((x) => x.id === id);
        if (!d || (d.pos && Math.abs(d.pos.x - m[id].x) < 0.2 && Math.abs(d.pos.y - m[id].y) < 0.2)) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : m;
    });
  }, [dots]);

  function clamp(v: Box): Box {
    const w = Math.min(FULL.w, Math.max(160, v.w));
    const h = (w / FULL.w) * FULL.h;
    const x = Math.min(FULL.x + FULL.w - w, Math.max(FULL.x, v.x));
    const y = Math.min(FULL.y + FULL.h - h, Math.max(FULL.y, v.y));
    return { x, y, w, h };
  }

  function zoomBy(factor: number, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    const w = view.w * factor;
    const h = view.h * factor;
    setView(clamp({ x: cx - (cx - view.x) * factor, y: cy - (cy - view.y) * factor, w, h }));
  }

  function zoomTo(box: Box) {
    // keep the map's aspect ratio, fit the box
    const ratio = FULL.h / FULL.w;
    let w = Math.max(box.w, box.h / ratio);
    w = Math.max(w * 1.15, 220);
    const h = w * ratio;
    setView(clamp({ x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h }));
  }

  // Mini map: re-focus when the zone becomes known (locations load after the order).
  useEffect(() => {
    if (compact) setView(selectedId ? focusBox(selectedId) : FULL);
  }, [compact, selectedId]);

  // When a zone is selected from outside (e.g. "Busiest areas"), bring it into view if zoomed.
  useEffect(() => {
    if (!zoomable || !selectedId || !zoomed) return;
    const z = ZONE_BY_ID.get(selectedId);
    if (!z) return;
    const b = bbox(z.points);
    const inView = b.x >= view.x && b.y >= view.y && b.x + b.w <= view.x + view.w && b.y + b.h <= view.y + view.h;
    if (!inView) zoomTo(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (!zoomable || !zoomed) return;
    drag.current = { x: e.clientX, y: e.clientY, view, moved: false };
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || !svgRef.current) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    if (!d.moved) svgRef.current.setPointerCapture(e.pointerId);
    d.moved = true;
    const scale = d.view.w / svgRef.current.clientWidth;
    setView(clamp({ ...d.view, x: d.view.x - dx * scale, y: d.view.y - dy * scale }));
  }
  function onPointerUp() {
    if (drag.current?.moved) {
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
    }
    drag.current = null;
  }

  function select(id: string) {
    if (suppressClick.current || !onSelect) return;
    onSelect(id);
  }

  const svg = (
    <svg
      ref={svgRef}
      className={`site-map ${compact ? "is-compact" : ""} ${zoomed ? "is-zoomed" : ""} ${className}`}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      role={interactive ? "group" : "img"}
      aria-label="Yard blueprint"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <pattern id="site-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" className="map-grid-line" />
        </pattern>
        <filter id="zone-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>

      <polygon points={pts(SITE_OUTLINE)} className="map-ground" />
      <polygon points={pts(SITE_OUTLINE)} fill="url(#site-grid)" />
      <polygon points={pts(SITE_OUTLINE)} className="map-boundary" />

      {LANDMARKS.map((l, i) => (
        <polygon key={i} points={pts(l.points)} className={`map-landmark map-landmark-${l.kind}`} />
      ))}

      {ZONES.filter((z) => !visibleIds || visibleIds.has(z.id)).map((z) => {
        const zone = names?.[z.id] ? { ...z, label: names[z.id] } : z;
        const count = counts[zone.id] ?? 0;
        const selected = selectedId === zone.id;
        const highlighted = highlightIds ? highlightIds.has(zone.id) : false;
        const dim = focusMode && !selected && !highlighted;
        const { cx, cy, vertical, size, lines, b } = labelLayout(zone);
        const showLabel = !compact || selected || view.w < 900;
        const fontSize = compact && selected ? Math.max(size, view.w / 34) : size;
        const cls = [
          "zone",
          `zone-${zone.kind}`,
          count > 0 ? "has-items" : "",
          selected ? "is-selected" : "",
          highlighted ? "is-highlighted" : "",
          dim ? "is-dim" : "",
        ].join(" ");
        // badge scales a little with zoom so it stays legible
        const badgeScale = Math.max(0.55, Math.min(1.6, view.w / FULL.w * 1.6));

        return (
          <g
            key={zone.id}
            className={cls}
            onClick={interactive ? () => select(zone.id) : undefined}
            onKeyDown={
              interactive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      select(zone.id);
                    }
                  }
                : undefined
            }
            tabIndex={interactive ? 0 : undefined}
            role={interactive ? "button" : undefined}
            aria-pressed={interactive ? selected : undefined}
            aria-label={`${zone.label}${count ? `, ${count} PO${count === 1 ? "" : "s"}` : ""}`}
          >
            {(selected || highlighted) && (
              <polygon points={pts(zone.points)} className="zone-glow" filter="url(#zone-glow)" />
            )}
            <polygon points={pts(zone.points)} className="zone-shape" />
            {showLabel && (
              <text
                x={cx}
                y={cy}
                className="zone-label"
                fontSize={fontSize}
                textAnchor="middle"
                dominantBaseline="central"
                transform={vertical ? `rotate(-90 ${cx} ${cy})` : undefined}
              >
                {lines.length === 1 ? (
                  zone.label
                ) : (
                  <>
                    <tspan x={cx} dy={-fontSize * 0.55}>{lines[0]}</tspan>
                    <tspan x={cx} dy={fontSize * 1.1}>{lines[1]}</tspan>
                  </>
                )}
              </text>
            )}
            {count > 0 && !compact && !dots && (
              <g className="zone-badge" transform={`translate(${b.x + b.w - 4} ${b.y + 4}) scale(${badgeScale})`}>
                <circle r={count > 99 ? 17 : 14} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={count > 99 ? 12 : 14}>
                  {count > 999 ? "999+" : count}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {dots && (
        <g className="po-dots">
          {dots.map((dot) => {
            const z0 = ZONE_BY_ID.get(dot.zoneId);
            const zone = z0 && names?.[z0.id] ? { ...z0, label: names[z0.id] } : z0;
            if (!zone || (visibleIds && !visibleIds.has(zone.id))) return null;
            const live = dragDot?.id === dot.id ? dragDot : justDropped[dot.id];
            const at = live ?? resolveSpot(dot.id, zone, dot.pos);
            const active = activeDotId === dot.id;
            const dragging = dragDot?.id === dot.id;
            const r = unitsPerPx * (active ? 7.5 : 5.5);
            const fs = unitsPerPx * 12;
            return (
              <g
                key={dot.id}
                className={`po-dot age-${dot.age ?? "fresh"} ${active ? "is-active" : ""} ${dragging ? "is-dragging" : ""} ${onDotMove ? "is-movable" : ""}`}
                transform={`translate(${at.x} ${at.y})`}
                onPointerDown={(e) => onDotPointerDown(e, dot, zone)}
                onPointerMove={onDotPointerMove}
                onPointerUp={onDotPointerUp}
                onPointerCancel={() => {
                  dotDrag.current = null;
                  setDragDot(null);
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => onDotKeyDown(e, dot, zone, at)}
                tabIndex={onDotMove || onDotClick ? 0 : undefined}
                role={onDotMove || onDotClick ? "button" : undefined}
                aria-label={`${dot.label} in ${zone.label}${onDotMove ? ". Drag or use arrow keys to move" : ""}`}
              >
                <title>{`${dot.label} · ${zone.label}`}</title>
                {/* bigger invisible hit area for fingers */}
                <circle className="po-dot-hit" r={unitsPerPx * 16} />
                <circle className="po-dot-pulse" r={r} />
                <circle className="po-dot-core" r={r} strokeWidth={unitsPerPx * 2} />
                {(active || dragging) && (
                  <g className="po-dot-tag" transform={`translate(0 ${-(r + unitsPerPx * 8)})`}>
                    <rect
                      x={-(dot.label.length * fs * 0.33 + unitsPerPx * 8)}
                      y={-fs * 1.25}
                      width={dot.label.length * fs * 0.66 + unitsPerPx * 16}
                      height={fs * 1.7}
                      rx={fs * 0.5}
                    />
                    <text textAnchor="middle" y={-fs * 0.4} fontSize={fs} dominantBaseline="central">
                      {dot.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );

  if (!zoomable) return svg;

  return (
    <div className="map-stage">
      {svg}
      <div className="map-controls" role="toolbar" aria-label="Blueprint zoom">
        <button type="button" className="map-ctl" onClick={() => zoomBy(0.6)} aria-label="Zoom in" title="Zoom in">
          +
        </button>
        <button type="button" className="map-ctl" onClick={() => zoomBy(1 / 0.6)} aria-label="Zoom out" title="Zoom out" disabled={!zoomed}>
          −
        </button>
        <button type="button" className="map-ctl map-ctl-text" onClick={() => zoomTo(MAIN_BUILDING)} title="Zoom to the main building">
          Building
        </button>
        {zoomed && (
          <button type="button" className="map-ctl map-ctl-text" onClick={() => setView(FULL)} title="Show the whole site">
            Whole site
          </button>
        )}
      </div>
      {zoomed && <div className="map-hint">Drag to move around</div>}
    </div>
  );
}
