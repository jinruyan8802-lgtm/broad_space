"use client";

import { usePathname } from "next/navigation";
import NavBar from "./NavBar";

export default function NavBarWrapper() {
  const pathname = usePathname();
  const active = pathname === "/dashboard" ? "dashboard" : pathname === "/graph" ? "graph" : pathname === "/signal" ? "signal" : pathname === "/trend" ? "trend" : "feed";
  return <NavBar active={active} />;
}