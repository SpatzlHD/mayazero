export function rewriteWalletCoreWasmUrl(url: string): string {
  const [pathname, search = ""] = url.split("?", 2);
  if (
    !pathname ||
    !/^\/[^/]+\/wallet-core\.wasm$/.test(pathname) ||
    pathname.startsWith("/assets/")
  ) {
    return url;
  }

  return `/wallet-core.wasm${search ? `?${search}` : ""}`;
}
