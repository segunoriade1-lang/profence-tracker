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
