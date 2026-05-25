import { Analytics } from "@vercel/analytics/react";
import { useSettings } from "#/provider/SettingsProvider";
import { OpenPanelScreenTracker } from "./OpenPanelScreenTracker";
import {
  isAnalyticsEnabledInBrowser,
  sanitizeAnalyticsBeforeSend,
} from "./runtime";

export function AppAnalytics() {
  const settings = useSettings();

  if (!isAnalyticsEnabledInBrowser() || settings.analyticsDisabled) {
    return null;
  }

  return (
    <>
      <Analytics beforeSend={sanitizeAnalyticsBeforeSend} />
      <OpenPanelScreenTracker />
    </>
  );
}
