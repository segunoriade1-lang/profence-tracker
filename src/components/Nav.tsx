"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapIcon, PlusIcon, SearchIcon } from "./Icons";

const links = [
  { href: "/", label: "Search", icon: SearchIcon, match: (p: string) => p === "/" || (p.startsWith("/orders/") && p !== "/orders/new") },
  { href: "/orders/new", label: "New order", icon: PlusIcon, match: (p: string) => p === "/orders/new" },
  { href: "/locations", label: "Locations", icon: MapIcon, match: (p: string) => p.startsWith("/locations") },
];

export default function Nav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="nav" aria-label="Main">
      {links.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname);
        return (
          <Link key={href} href={href} className={`nav-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
            <Icon size={17} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
