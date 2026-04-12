export function isDevModeEnabled(isDev: boolean, search: string): boolean {
  return isDev || new URLSearchParams(search).get("dev") === "true";
}
