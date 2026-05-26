import NavBarWrapper from "@/components/NavBarWrapper";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BroadSpace",
  description: "Daily tech knowledge broadening tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <NavBarWrapper />
        {children}
      </body>
    </html>
  );
}
