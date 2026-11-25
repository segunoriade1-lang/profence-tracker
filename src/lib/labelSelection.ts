"use client";

/** Orders picked for printing a sheet of QR labels, kept for this browser tab. */
const KEY = "pt-label-selection";

export function loadSelection(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveSelection(ids: string[]) {
  try {
    if (ids.length) sessionStorage.setItem(KEY, JSON.stringify(ids));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — selection just won't survive a reload */
  }
}

/** Labels-per-page layouts for the print sheet (columns × rows). */
export const LAYOUTS = [
  { perPage: 2, cols: 1, rows: 2 },
  { perPage: 4, cols: 2, rows: 2 },
  { perPage: 6, cols: 2, rows: 3 },
  { perPage: 8, cols: 2, rows: 4 },
  { perPage: 12, cols: 3, rows: 4 },
  { perPage: 20, cols: 4, rows: 5 },
] as const;

export const PAPERS = {
  letter: { name: "Letter", w: "8.5in", h: "11in", ratio: 8.5 / 11, css: "letter" },
  a4: { name: "A4", w: "210mm", h: "297mm", ratio: 210 / 297, css: "A4" },
} as const;
export type PaperKey = keyof typeof PAPERS;
