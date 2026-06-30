import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Neel Bridal Studio",
    short_name: "Neel",
    description: "Book and manage bridal beauty services.",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f5f0",
    theme_color: "#203a36",
    orientation: "portrait-primary",
    icons: [
      { src: "/neel-bridal-studio-logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/neel-bridal-studio-logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
