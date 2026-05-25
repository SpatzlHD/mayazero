import { beforeEach, describe, expect, it, vi } from "vitest";
import { ANALYTICS_ROUTE_CHAIN } from "./runtime";

const { openPanelCtor, trackMock, screenViewMock } = vi.hoisted(() => ({
  openPanelCtor: vi.fn(),
  trackMock: vi.fn(),
  screenViewMock: vi.fn(),
}));

const { isAnalyticsEnabledInBrowser, isAnalyticsOptOutEnabled } = vi.hoisted(
  () => ({
    isAnalyticsEnabledInBrowser: vi.fn(() => true),
    isAnalyticsOptOutEnabled: vi.fn(() => false),
  }),
);

vi.mock("@openpanel/web", () => ({
  OpenPanel: class {
    track = trackMock;

    screenView = screenViewMock;

    constructor(options: unknown) {
      openPanelCtor(options);
    }
  },
}));

vi.mock("./runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("./runtime")>();
  return {
    ...original,
    isAnalyticsEnabledInBrowser,
    isAnalyticsOptOutEnabled,
  };
});

describe("openpanel helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    openPanelCtor.mockClear();
    trackMock.mockClear();
    screenViewMock.mockClear();
    isAnalyticsEnabledInBrowser.mockReturnValue(true);
    isAnalyticsOptOutEnabled.mockReturnValue(false);
  });

  it("does not initialize without a client id", async () => {
    vi.stubEnv("VITE_OPENPANEL_CLIENT_ID", "");
    const { getOpenPanelClient } = await import("./openpanel");

    expect(getOpenPanelClient()).toBeNull();
    expect(openPanelCtor).not.toHaveBeenCalled();
  });

  it("respects runtime privacy gates via the OpenPanel filter", async () => {
    vi.stubEnv("VITE_OPENPANEL_CLIENT_ID", "test-client-id");

    const { getOpenPanelClient, resetOpenPanelClientForTests } =
      await import("./openpanel");

    getOpenPanelClient();
    const filter = openPanelCtor.mock.calls[0]?.[0]?.filter as
      | (() => boolean)
      | undefined;

    expect(typeof filter).toBe("function");
    expect(filter?.()).toBe(true);

    isAnalyticsOptOutEnabled.mockReturnValue(true);
    resetOpenPanelClientForTests();
    getOpenPanelClient();
    const optOutFilter = openPanelCtor.mock.calls.at(-1)?.[0]?.filter as
      | (() => boolean)
      | undefined;

    expect(optOutFilter?.()).toBe(false);
  });

  it("tracks sanitized screen views for chain detail routes", async () => {
    vi.stubEnv("VITE_OPENPANEL_CLIENT_ID", "test-client-id");

    const { trackOpenPanelScreenView } = await import("./openpanel");

    trackOpenPanelScreenView("/chains/ethereum?foo=bar#send");

    expect(screenViewMock).toHaveBeenCalledWith(ANALYTICS_ROUTE_CHAIN);
  });
});
