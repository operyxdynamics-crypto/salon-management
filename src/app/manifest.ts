import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/workspace/home",
    name: "Operyx",
    short_name: "Operyx",
    description: "Salon operations automated.",
    start_url: "/workspace/home",
    scope: "/",
    display: "standalone",
    // minimal-ui is the fallback if a browser refuses standalone.
    display_override: ["standalone", "minimal-ui"],
    background_color: "#F7FAFC",
    // Matches the workspace top bar and the viewport themeColor in layout.tsx. Navy here
    // painted the Android status bar navy directly above a white header.
    theme_color: "#F6F7FB",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
    icons: [
      // Chrome wants a 192 for the install prompt and home screen; 512 is the splash source.
      { src: "/operyx-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/operyx-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Separate padded asset. Android crops maskable icons to a squircle, so artwork must
      // sit inside the inner 80% safe zone or its edges get shaved off. Reusing the plain
      // icon here meant the logo was being clipped on install.
      { src: "/operyx-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the installed icon to jump straight into a task, like a native app.
    shortcuts: [
      { name: "New appointment", short_name: "Book", url: "/workspace/bookings", icons: [{ src: "/operyx-icon-192.png", sizes: "192x192" }] },
      { name: "New sale", short_name: "Sale", url: "/workspace/billing", icons: [{ src: "/operyx-icon-192.png", sizes: "192x192" }] },
      { name: "Day close", short_name: "Close", url: "/workspace/day-close", icons: [{ src: "/operyx-icon-192.png", sizes: "192x192" }] },
    ],
  };
}
