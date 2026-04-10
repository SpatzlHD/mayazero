import { describe, expect, it } from "vitest";
import { rewriteWalletCoreWasmUrl } from "./wallet-core-wasm-redirect";

describe("rewriteWalletCoreWasmUrl", () => {
  it("rewrites nested wallet-core wasm requests to the root asset", () => {
    expect(rewriteWalletCoreWasmUrl("/chains/wallet-core.wasm")).toBe(
      "/wallet-core.wasm",
    );
    expect(
      rewriteWalletCoreWasmUrl("/chains/wallet-core.wasm?import"),
    ).toBe("/wallet-core.wasm?import");
  });

  it("leaves unrelated requests unchanged", () => {
    expect(rewriteWalletCoreWasmUrl("/wallet-core.wasm")).toBe(
      "/wallet-core.wasm",
    );
    expect(rewriteWalletCoreWasmUrl("/chains/eth")).toBe("/chains/eth");
    expect(rewriteWalletCoreWasmUrl("/assets/wallet-core.wasm")).toBe(
      "/assets/wallet-core.wasm",
    );
  });
});
