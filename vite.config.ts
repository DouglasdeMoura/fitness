import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

import { clientNodeBuiltinExternalizationGate } from "./scripts/client-node-builtin-externalization-gate.ts";

export default defineConfig({
  plugins: [
    clientNodeBuiltinExternalizationGate(),
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
    }),
    viteReact(),
    nitro(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    // Env-driven so an e2e run can take its own port instead of colliding with
    // whatever dev server is already on 3000. Playwright passes PORT through
    // its webServer.env.
    port: Number(process.env.PORT ?? 3000),
  },
});
