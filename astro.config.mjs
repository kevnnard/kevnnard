import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
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
