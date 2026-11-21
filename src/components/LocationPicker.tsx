"use client";

import Link from "next/link";
import type { OfficeLocation } from "@/lib/data";
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
  return (
    <div className="pills" role="radiogroup" aria-label="Office location">
      {locations.map((loc) => {
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
  );
}
