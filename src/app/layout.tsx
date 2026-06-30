import type { Metadata, Viewport } from "next";
import { DM_Sans, Lora } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const sans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] });
const serif = Lora({ variable: "--font-lora", subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Neel Bridal Studio | Bridal salon management",
    template: "%s | Neel Bridal Studio",
  },
  description: "Discover, book, and manage bridal beauty services from one calm workspace.",
  applicationName: "Neel Bridal Studio",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Neel Bridal Studio",
  },
};

export const viewport: Viewport = {
  themeColor: "#203a36",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}<PwaRegister /></body>
    </html>
  );
}
