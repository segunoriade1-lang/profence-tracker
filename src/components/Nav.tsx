"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapIcon, QrIcon, SearchIcon } from "./Icons";

const links = [
  { href: "/", label: "Search", icon: SearchIcon, match: (p: string) => p === "/" || p.startsWith("/orders/") },
  { href: "/map", label: "Map", icon: MapIcon, match: (p: string) => p.startsWith("/map") || p.startsWith("/locations") },
  { href: "/scan", label: "Scan", icon: QrIcon, match: (p: string) => p.startsWith("/scan"), cls: "nav-scan" },
];

export default function Nav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="nav" aria-label="Main">
      {links.map(({ href, label, icon: Icon, match, ...rest }) => {
        const active = match(pathname);
        return (
          <Link key={href} href={href} className={`nav-link ${"cls" in rest ? rest.cls : ""} ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon size={17} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
