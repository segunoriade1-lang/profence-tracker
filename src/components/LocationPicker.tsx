"use client";

import Link from "next/link";
import type { OfficeLocation } from "@/lib/data";
import { KIND_LABEL, ZONE_BY_ID, type ZoneKind } from "@/lib/siteMap";
import { CheckIcon, PinIcon } from "./Icons";

const ORDER: (ZoneKind | "other")[] = ["building", "shed", "yard", "other"];

export default function LocationPicker({
  locations,
  value,
  onChange,
}: {
  locations: OfficeLocation[];
  value: string;
  onChange: (loc: OfficeLocation) => void;
}) {
  if (!locations.length) {
    return (
      <p className="hint">
        No office locations yet. <Link href="/locations">Add your office locations</Link> first.
      </p>
    );
  }

  const groups = new Map<ZoneKind | "other", OfficeLocation[]>();
  for (const loc of locations) {
    const kind = (loc.zoneId && ZONE_BY_ID.get(loc.zoneId)?.kind) || "other";
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind)!.push(loc);
  }
  const showTitles = groups.size > 1;

  return (
    <div role="radiogroup" aria-label="Office location">
      {ORDER.filter((k) => groups.has(k)).map((kind) => (
        <div key={kind} className="zone-group">
          {showTitles && (
            <div className="zone-group-title">{kind === "other" ? "Other" : KIND_LABEL[kind]}</div>
          )}
          <div className="pills">
            {groups.get(kind)!.map((loc) => {
              const on = value === loc.id;
              return (
                <button
                  type="button"
                  key={loc.id}
                  role="radio"
                  aria-checked={on}
                  className={`pill ${on ? "pill-on" : ""}`}
                  onClick={() => onChange(loc)}
                >
                  {on ? <CheckIcon size={15} /> : <PinIcon size={15} />}
                  {loc.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
