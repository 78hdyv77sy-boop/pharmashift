import type { MetadataRoute } from "next";

// Macht PharmaShift am Handy "installierbar": eigenes Symbol am
// Home-Bildschirm, eigener Name, startet im Vollbild ohne Browser-Leiste.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PharmaShift",
    short_name: "PharmaShift",
    description: "Dienstplan & Team-Chat für die Apotheke",
    start_url: "/admin/dashboard",
    display: "standalone",
    background_color: "#f8faf7",
    theme_color: "#2a664f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
