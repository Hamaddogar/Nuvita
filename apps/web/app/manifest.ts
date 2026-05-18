import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nuvita",
    short_name: "Nuvita",
    description: "Premium AI nutrition coaching and mobile meal tracking.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6fffc",
    theme_color: "#0f766e",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icons/maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
