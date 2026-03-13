import type { Metadata } from "next";
import "./globals.css";
import { Toast } from "@/components/Toast";
import { GlobalShortcutsDialog } from "@/components/GlobalShortcutsDialog";

export const metadata: Metadata = {
  title: "Openflows - AI Image Workflow",
  description: "Node-based image annotation and generation workflow using Nano Banana Pro",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toast />
        <GlobalShortcutsDialog />
      </body>
    </html>
  );
}
