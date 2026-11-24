"use client";

import Link from "next/link";
import type { OfficeLocation } from "@/lib/data";
import { GROUP_LABEL, GROUP_ORDER, groupOf, type LocGroup } from "@/lib/siteMap";
import { CheckIcon, PinIcon } from "./Icons";


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

  const groups = new Map<LocGroup, OfficeLocation[]>();
  for (const loc of locations) {
    const g = groupOf(loc.zoneId);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(loc);
  }
  const showTitles = groups.size > 1;

  return (
    <div role="radiogroup" aria-label="Office location">
      {GROUP_ORDER.filter((k) => groups.has(k)).map((kind) => (
        <div key={kind} className="zone-group">
          {showTitles && (
            <div className="zone-group-title">{GROUP_LABEL[kind]}</div>
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
