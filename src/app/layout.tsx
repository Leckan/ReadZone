import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ReadFlow AI — Your reading, in flow",
  description: "A personal space to read PDFs and EPUBs, listen along, and keep the passages that matter.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
