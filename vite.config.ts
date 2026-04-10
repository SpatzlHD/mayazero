import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { rewriteWalletCoreWasmUrl } from "./src/lib/wallet-core-wasm-redirect";

function walletCoreWasmRedirectPlugin() {
  const rewriteRequest = (
    req: { url?: string },
    _res: unknown,
    next: () => void,
  ) => {
    if (req.url) {
      req.url = rewriteWalletCoreWasmUrl(req.url);
    }
    next();
  };

  return {
    name: "wallet-core-wasm-redirect",
    configureServer(server: { middlewares: { use: typeof rewriteRequest } }) {
      server.middlewares.use(rewriteRequest);
    },
    configurePreviewServer(server: {
      middlewares: { use: typeof rewriteRequest };
    }) {
      server.middlewares.use(rewriteRequest);
    },
  };
}

const config = defineConfig(({ mode }) => ({
  plugins: [
    wasm(),
    topLevelAwait(),
    nodePolyfills({
      // Explicitly include these to fix "process/buffer is not defined"
      include: ["buffer", "process", "util", "stream", "crypto", "events"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    devtools(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    walletCoreWasmRedirectPlugin(),
  ],
  optimizeDeps: {
    exclude: ["@vultisig/sdk"],
    include: [
      "jayson",
      "bn.js",
      "eventemitter3",
      "ripemd160",
      "rpc-websockets",
      "@solana/buffer-layout",
      "@solana/web3.js",
      "@trustwallet/wallet-core",
      "buffer",
      "ripple-binary-codec",
      "@cosmjs/proto-signing",
      "@cosmjs/stargate",
    ],
  },
  build: {
    target: "esnext",
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/node_modules/],
    },
  },
  define: {
    global: "globalThis",
    "process.env": {},
    ...(mode === "test"
      ? {}
      : {
          "process.version": JSON.stringify("v18.0.0"),
        }),
  },
}));

export default config;
