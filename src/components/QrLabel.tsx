"use client";

import { useEffect, useState } from "react";
import { downloadDataUrl, makeLabel, printLabel } from "@/lib/qr";
import { DownloadIcon, PrintIcon } from "./Icons";

export default function QrLabel({
  id,
  poNumber,
  sub,
  actions = true,
}: {
  id: string;
  poNumber: string;
  sub?: string;
  actions?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    makeLabel(id, poNumber, sub).then((url) => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [id, poNumber, sub]);

  const fileName = `QR-${poNumber.replace(/[^\w-]+/g, "_") || id}.png`;

  return (
    <div className="label">
      <div className="label-card" key={src ?? "loading"}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={`QR code for ${poNumber}`} />
        ) : (
          <span className="muted small">Generating…</span>
        )}
      </div>
      {actions && src && (
        <div className="label-actions">
          <button className="btn" onClick={() => downloadDataUrl(src, fileName)}>
            <DownloadIcon size={16} /> Download
          </button>
          <button className="btn" onClick={() => printLabel(src, poNumber)}>
            <PrintIcon size={16} /> Print
          </button>
        </div>
      )}
    </div>
  );
}
