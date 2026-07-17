import type { Metadata, Viewport } from "next";
import { Comfortaa, Inter } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
// Tokens first: globals.css still carries the legacy literal-hex styles, and must be able to
// override during the migration.
import "@/styles/tokens.css";
import "./globals.css";

const brand = Comfortaa({ variable: "--font-comfortaa", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const ui = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: {
    default: "Operyx | Salon operations automated",
    template: "%s | Operyx",
  },
  description: "Automate salon appointments, POS, invoices, inventory, staff, reports, and daily operations from one workspace.",
  applicationName: "Operyx",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Operyx",
  },
};

export const viewport: Viewport = {
  themeColor: "#F6F7FB",
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${brand.variable} ${ui.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>{children}<PwaRegister /></body>
    </html>
  );
}
