import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { rewriteWalletCoreWasmUrl } from "./src/lib/wallet-core-wasm-redirect";

type ApiRouteEntry = {
  modulePath: string;
  routeSegments: string[];
};

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

function collectApiRouteEntries(apiRoot: string): ApiRouteEntry[] {
  const entries: ApiRouteEntry[] = [];

  function walk(currentDir: string) {
    for (const dirent of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, dirent.name);

      if (dirent.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      if (
        !dirent.isFile() ||
        !dirent.name.endsWith(".ts") ||
        dirent.name.endsWith(".test.ts")
      ) {
        continue;
      }

      const relativePath = path.relative(apiRoot, absolutePath);
      const routePath = relativePath.replace(/\.ts$/, "");
      const routeSegments = routePath
        .split(path.sep)
        .filter(Boolean)
        .map((segment) => segment.trim());

      entries.push({
        modulePath: `/${path.join("api", routePath).replace(/\\/g, "/")}.ts`,
        routeSegments,
      });
    }
  }

  walk(apiRoot);

  return entries.sort((left, right) => {
    const leftStaticCount = left.routeSegments.filter(
      (segment) => !segment.startsWith("["),
    ).length;
    const rightStaticCount = right.routeSegments.filter(
      (segment) => !segment.startsWith("["),
    ).length;

    if (leftStaticCount !== rightStaticCount) {
      return rightStaticCount - leftStaticCount;
    }

    return right.routeSegments.length - left.routeSegments.length;
  });
}

function matchesApiRoute(
  routeSegments: string[],
  requestSegments: string[],
): boolean {
  if (routeSegments.length !== requestSegments.length) {
    return false;
  }

  return routeSegments.every((segment, index) => {
    if (segment.startsWith("[") && segment.endsWith("]")) {
      return requestSegments[index] !== "";
    }

    return segment === requestSegments[index];
  });
}

function apiRouteDevPlugin() {
  const apiRoot = path.resolve(__dirname, "api");

  return {
    name: "api-route-dev-middleware",
    configureServer(server: {
      middlewares: {
        use: (
          handler: (
            req: {
              url?: string;
              method?: string;
              headers?: Record<string, string | string[] | undefined>;
            },
            res: {
              statusCode?: number;
              setHeader: (name: string, value: string) => void;
              end: (body?: Uint8Array | string) => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
      ssrLoadModule: (url: string) => Promise<Record<string, unknown>>;
    }) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? "";
        const pathname = rawUrl.split("?", 1)[0] ?? "";

        if (!pathname.startsWith("/api/") && pathname !== "/api") {
          next();
          return;
        }

        const requestSegments = pathname
          .replace(/^\/api\/?/, "")
          .split("/")
          .filter(Boolean)
          .map((segment) => decodeURIComponent(segment));

        const routeEntries = collectApiRouteEntries(apiRoot);

        const matchedRoute = routeEntries.find((entry) =>
          matchesApiRoute(entry.routeSegments, requestSegments),
        );

        if (!matchedRoute) {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ error: "API route not found." }));
          return;
        }

        try {
          const mod = await server.ssrLoadModule(matchedRoute.modulePath);
          const normalizedMethod = (req.method ?? "GET").toUpperCase();
          const handler =
            normalizedMethod === "GET"
              ? typeof mod.GET === "function"
                ? (mod.GET as (request: Request) => Promise<Response>)
                : null
              : normalizedMethod === "POST"
                ? typeof mod.POST === "function"
                  ? (mod.POST as (request: Request) => Promise<Response>)
                  : null
                : null;

          if (!handler) {
            const allowedMethods = ["GET", "POST"].filter(
              (method) => typeof mod[method] === "function",
            );
            res.statusCode = allowedMethods.length > 0 ? 405 : 500;
            res.setHeader("content-type", "application/json; charset=utf-8");
            if (allowedMethods.length > 0) {
              res.setHeader("allow", allowedMethods.join(", "));
            }
            res.end(
              JSON.stringify({
                error:
                  allowedMethods.length > 0
                    ? `Method ${normalizedMethod} is not defined for ${pathname}.`
                    : `No API handlers are defined for ${pathname}.`,
              }),
            );
            return;
          }

          const origin = req.headers?.host
            ? `http://${req.headers.host}`
            : "http://localhost:3000";
          const requestBody =
            normalizedMethod === "POST"
              ? await new Promise<Uint8Array | undefined>((resolve, reject) => {
                  const chunks: Buffer[] = [];
                  req.on("data", (chunk) => {
                    chunks.push(
                      Buffer.isBuffer(chunk)
                        ? chunk
                        : Buffer.from(String(chunk)),
                    );
                  });
                  req.on("end", () => {
                    resolve(
                      chunks.length > 0 ? Buffer.concat(chunks) : undefined,
                    );
                  });
                  req.on("error", reject);
                })
              : undefined;
          const request = new Request(new URL(rawUrl, origin), {
            method: normalizedMethod,
            headers: new Headers(
              Object.entries(req.headers ?? {}).flatMap(([key, value]) => {
                if (Array.isArray(value)) {
                  return value.map((item) => [key, item]);
                }
                return value == null ? [] : [[key, value]];
              }),
            ),
            ...(requestBody ? { body: requestBody } : {}),
          });

          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to execute local API route.",
            }),
          );
        }
      });
    },
  };
}

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }

  return {
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
      apiRouteDevPlugin(),
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
    server: {
      watch: {
        ignored: ["**/cms/**"],
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
  };
});

export default config;
