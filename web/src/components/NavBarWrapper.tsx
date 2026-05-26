"use client";

import { usePathname } from "next/navigation";
import NavBar from "./NavBar";

export default function NavBarWrapper() {
  const pathname = usePathname();
  const active = pathname === "/dashboard" ? "dashboard" : pathname === "/graph" ? "graph" : "feed";
  return <NavBar active={active} />;
}
