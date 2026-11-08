import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  // The 3D room grew into the world: old links land there.
  redirects: {
    "/room": "/world",
  },
  vite: {
    plugins: [tailwindcss()],
    // Discover the lazy scene's dependencies before the first browser import.
    optimizeDeps: {
      include: [
        "three",
        "three/examples/jsm/loaders/GLTFLoader.js",
        "three/examples/jsm/environments/RoomEnvironment.js",
        "@react-three/fiber",
        "@react-three/drei",
        "meshoptimizer/decoder",
      ],
    },
  },
  integrations: [mdx(), react()],
});
