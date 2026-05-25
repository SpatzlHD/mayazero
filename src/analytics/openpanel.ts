import { OpenPanel } from "@openpanel/web";
import {
  isAnalyticsEnabledInBrowser,
  isAnalyticsOptOutEnabled,
  sanitizeAnalyticsUrl,
} from "./runtime";

type OpenPanelProperties = Record<string, string | number | boolean | null>;

let openPanelClient: OpenPanel | null | undefined;

function getClientId(): string | undefined {
  return import.meta.env.VITE_OPENPANEL_CLIENT_ID?.trim() || undefined;
}

function shouldTrackAnalytics(): boolean {
  return isAnalyticsEnabledInBrowser() && !isAnalyticsOptOutEnabled();
}

export function getOpenPanelClient(): OpenPanel | null {
  const clientId = getClientId();
  if (!clientId) {
    return null;
  }

  if (openPanelClient === undefined) {
    openPanelClient = new OpenPanel({
      clientId,
      trackScreenViews: false,
      trackOutgoingLinks: true,
      trackAttributes: false,
      trackHashChanges: false,

      filter: () => shouldTrackAnalytics(),
    });
  }

  return openPanelClient;
}

export function trackOpenPanelEvent(
  name: string,
  properties: Record<string, string | boolean | number>,
): void {
  if (!shouldTrackAnalytics()) {
    return;
  }

  const client = getOpenPanelClient();
  if (!client) {
    return;
  }

  client.track(name, properties as OpenPanelProperties);
}

export function trackOpenPanelScreenView(pathname: string): void {
  if (!shouldTrackAnalytics()) {
    return;
  }

  const client = getOpenPanelClient();
  if (!client) {
    return;
  }

  client.screenView(sanitizeAnalyticsUrl(pathname));
}

export function resetOpenPanelClientForTests(): void {
  openPanelClient = undefined;
}
