"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { QrIcon } from "./Icons";

/** Big floating "Scan" button on phones (hidden on the scan page itself). */
export default function ScanFab() {
  const pathname = usePathname();
  if (pathname?.startsWith("/scan")) return null;
  return (
    <Link href="/scan" className="scan-fab" aria-label="Scan a QR label">
      <QrIcon size={20} /> Scan
    </Link>
  );
}
