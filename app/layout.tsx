import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/shell";

export const metadata: Metadata = {
  title: "SCOUT — India Opportunity Intelligence",
  description:
    "Prompt-based data intelligence: describe what data you need, SCOUT plans, collects, validates and monitors it with per-field provenance.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
