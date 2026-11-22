/**
 * Top-down site plan, traced from the annotated aerial sketch.
 * Coordinates are in the sketch's pixel space; the SVG viewBox crops to the site.
 */

export type ZoneKind = "building" | "yard" | "shed";

export type Zone = {
  id: string;
  label: string;
  kind: ZoneKind;
  /** Polygon points [x, y][] (rectangles are given as 4 corners). */
  points: [number, number][];
  /** Other names an existing location might already use for this area. */
  aliases?: string[];
};

const rect = (x1: number, y1: number, x2: number, y2: number): [number, number][] => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
];

export const VIEWBOX = { x: 274, y: 100, w: 1356, h: 1728 };

/** L-shaped property boundary. */
export const SITE_OUTLINE: [number, number][] = [
  [274, 100],
  [1630, 100],
  [1630, 1828],
  [1090, 1828],
  [1090, 752],
  [274, 752],
];

/** Unlabelled structures drawn for orientation only. */
export const LANDMARKS: { points: [number, number][]; kind: "building" | "structure" }[] = [
  { points: rect(279, 117, 636, 463), kind: "building" }, // main building footprint
  { points: rect(378, 468, 620, 545), kind: "structure" }, // storage building south of main
  { points: rect(902, 112, 1020, 162), kind: "structure" }, // north yard shed
];

export const ZONES: Zone[] = [
  // ---- Main building ----
  { id: "amys-office", label: "Amy's Office", kind: "building", points: rect(279, 117, 344, 186) },
  { id: "fittings-bay", label: "Fittings Bay", kind: "building", points: rect(479, 117, 636, 226) },
  { id: "fabrication-bay", label: "Fabrication Bay", kind: "building", points: rect(479, 236, 636, 344) },
  { id: "lockup", label: "Lockup", kind: "building", points: rect(431, 279, 476, 348) },
  { id: "boardroom", label: "Boardroom", kind: "building", points: rect(365, 311, 428, 380), aliases: ["board room"] },
  { id: "emmanuel-office", label: "Emmanuel Office", kind: "building", points: rect(279, 357, 350, 386), aliases: ["emmanuel's office"] },
  { id: "jeffs-office", label: "Jeff's Office", kind: "building", points: rect(279, 390, 350, 460) },
  { id: "marks-office", label: "Mark's Office", kind: "building", points: rect(352, 390, 430, 460) },
  { id: "welding-bay", label: "Welding Bay", kind: "building", points: rect(479, 354, 636, 463), aliases: ["welders bay", "welder's bay"] },

  // ---- Yard ----
  { id: "front-of-fittings-bay", label: "Front of Fittings Bay", kind: "yard", points: rect(643, 117, 726, 211) },
  { id: "customer-area", label: "Customer Area", kind: "yard", points: rect(849, 351, 961, 375) },
  { id: "cantilever-area", label: "Cantilever Area", kind: "yard", points: rect(857, 489, 1037, 563), aliases: ["cantillever area"] },
  { id: "staging-area", label: "Staging Area", kind: "yard", points: rect(1063, 392, 1185, 642) },
  { id: "red-ramp", label: "Red Ramp", kind: "shed", points: rect(1189, 503, 1210, 638) },
  { id: "front-of-red-ramp", label: "Front of Red Ramp", kind: "yard", points: rect(1212, 503, 1230, 642) },
  {
    id: "front-of-vinyl-shed",
    label: "Front of Vinyl Shed",
    kind: "yard",
    points: [
      [1300, 478],
      [1345, 478],
      [1345, 585],
      [1398, 585],
      [1398, 882],
      [1300, 882],
    ],
    aliases: ["front of vinyls shed"],
  },
  { id: "vinyl-shed", label: "Vinyl Shed", kind: "shed", points: rect(1481, 532, 1603, 700), aliases: ["vinyls shed"] },
  { id: "dinmas-mesh-area", label: "Dinma's Mesh Area", kind: "yard", points: rect(1484, 735, 1605, 922), aliases: ["dinmas mesh area", "dinma's area"] },
  {
    id: "back-40",
    label: "Back 40",
    kind: "yard",
    points: [
      [1090, 740],
      [1252, 740],
      [1252, 932],
      [1630, 932],
      [1630, 1828],
      [1090, 1828],
    ],
  },
];

export const ZONE_BY_ID = new Map(ZONES.map((z) => [z.id, z]));

export function bbox(points: [number, number][]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ");

/* ---------- Geometry for PO dots ---------- */

type Pt = { x: number; y: number };

export function pointInPolygon(p: Pt, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function nearestOnSegment(p: Pt, a: [number, number], b: [number, number]): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / len));
  return { x: a[0] + t * dx, y: a[1] + t * dy };
}

/** Keeps a point inside a zone: unchanged if inside, else the nearest spot just inside the edge. */
export function clampToZone(p: Pt, zone: Zone, inset = 2): Pt {
  if (pointInPolygon(p, zone.points)) return p;
  let best: Pt = p;
  let bestD = Infinity;
  const pts = zone.points;
  for (let i = 0; i < pts.length; i++) {
    const q = nearestOnSegment(p, pts[i], pts[(i + 1) % pts.length]);
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  // nudge inward toward the bbox centre so the dot sits inside, not on the line
  const b = bbox(pts);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const len = Math.hypot(cx - best.x, cy - best.y) || 1;
  const step = Math.min(inset, len);
  const nudged = { x: best.x + ((cx - best.x) / len) * step, y: best.y + ((cy - best.y) / len) * step };
  return pointInPolygon(nudged, pts) ? nudged : best;
}

/** Stable pseudo-random spot inside a zone for a PO that hasn't been placed yet. */
export function defaultSpot(seed: string, zone: Zone): Pt {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const b = bbox(zone.points);
  const mx = Math.min(10, b.w * 0.2);
  const my = Math.min(10, b.h * 0.2);
  for (let i = 0; i < 40; i++) {
    const p = { x: b.x + mx + rand() * (b.w - 2 * mx), y: b.y + my + rand() * (b.h - 2 * my) };
    if (pointInPolygon(p, zone.points)) return p;
  }
  return clampToZone({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, zone);
}

/** Where a PO's dot goes: its saved spot if still inside its area, otherwise an auto spot. */
export function resolveSpot(id: string, zone: Zone, saved?: Pt | null): Pt {
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && pointInPolygon(saved, zone.points)) return saved;
  return defaultSpot(id, zone);
}

/** How well a location name refers to this zone: 2 = exact label, 1 = alias, 0 = no match. */
export function zoneNameScore(name: string, zone: Zone) {
  const n = norm(name);
  if (n === norm(zone.label)) return 2;
  return (zone.aliases ?? []).some((a) => norm(a) === n) ? 1 : 0;
}

export const KIND_LABEL: Record<ZoneKind, string> = {
  building: "Main building",
  shed: "Sheds & ramps",
  yard: "Yard",
};
