/* @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let currentPath = "/";
let isPowerUser = false;
const togglePowerUser = vi.fn(() => {
  isPowerUser = !isPowerUser;
});

vi.mock("@tanstack/react-router", () => {
  const isActivePath = (
    pathname: string,
    target: string,
    exact?: boolean,
  ) => {
    if (target === "/") {
      return pathname === "/";
    }

    if (exact) {
      return pathname === target;
    }

    return pathname === target || pathname.startsWith(`${target}/`);
  };

  return {
    Link: ({
      to,
      className,
      activeProps,
      activeOptions,
      children,
      onClick,
      ...props
    }: {
      to: string;
      className?: string;
      activeProps?: { className?: string };
      activeOptions?: { exact?: boolean };
      children: React.ReactNode;
      onClick?: () => void;
    }) => {
      const active = isActivePath(currentPath, to, activeOptions?.exact);

      return (
        <a
          href={to}
          className={[className, active ? activeProps?.className : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={onClick}
          {...props}
        >
          {children}
        </a>
      );
    },
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: currentPath } }),
  };
});

vi.mock("#/provider/PreferencesProvider", () => ({
  usePreferences: () => ({
    isPowerUser,
    togglePowerUser,
  }),
}));

vi.mock("#/provider/ImpersonationProvider", () => ({
  useImpersonationState: () => ({
    isViewOnly: false,
  }),
}));

vi.mock("#/generated/hypertune.react", () => ({
  useHypertune: () => ({
    beta: () => true,
  }),
}));

vi.mock("./ThemeToggle", () => ({
  default: () => <button type="button">Theme Toggle</button>,
}));

vi.mock("./WalletManager", () => ({
  WalletManager: () => <button type="button">Wallet</button>,
}));

vi.mock("./TransactionJourneyHost", () => ({
  TransactionJourneyActivityButton: () => (
    <button type="button">Activity</button>
  ),
}));

import Header from "./Header";

describe("Header", () => {
  beforeEach(() => {
    currentPath = "/";
    isPowerUser = false;
    togglePowerUser.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the primary desktop workspaces", () => {
    render(<Header />);

    expect(screen.getAllByText("Portfolio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Swap").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Liquidity").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Tools" })).toBeTruthy();
  });

  it("shows grouped routes inside the desktop tools menu", () => {
    render(<Header />);

    fireEvent.click(screen.getByRole("button", { name: "Tools" }));

    expect(screen.getByRole("menu", { name: "Tools" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Pooled Nodes" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "CACAOPool" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Maya Token" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "MAYANames" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Maya Masks" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeTruthy();
  });

  it("marks the tools trigger active for grouped routes", () => {
    currentPath = "/settings";
    render(<Header />);

    expect(screen.getByRole("button", { name: "Tools" }).className).toContain(
      "text-[var(--cacao-neon)]",
    );
  });

  it("shows theme and pro mode inside the utility overflow", () => {
    render(<Header />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open interface controls" }),
    );

    expect(screen.getByRole("menu", { name: "Interface controls" })).toBeTruthy();
    expect(screen.getByText("Theme Toggle")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /Pro Mode/i })).toBeTruthy();
  });

  it("closes desktop menus with escape and restores focus to the trigger", async () => {
    render(<Header />);

    const toolsTrigger = screen.getByRole("button", { name: "Tools" });
    fireEvent.click(toolsTrigger);

    const settingsItem = screen.getByRole("menuitem", { name: "Settings" });
    settingsItem.focus();
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Tools" })).toBeNull();
      expect(document.activeElement).toBe(toolsTrigger);
    });
  });

  it("closes desktop menus when clicking outside", async () => {
    render(<Header />);

    fireEvent.click(screen.getByRole("button", { name: "Tools" }));
    expect(screen.getByRole("menu", { name: "Tools" })).toBeTruthy();

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Tools" })).toBeNull();
    });
  });

  it("renders the regrouped mobile drawer destinations and utility controls", () => {
    render(<Header />);

    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );

    expect(screen.getByText("Workspaces")).toBeTruthy();
    expect(screen.getAllByText("Tools").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Interface").length).toBeGreaterThan(0);
    expect(screen.getByText("Pooled Nodes")).toBeTruthy();
    expect(screen.getByText("Maya Token")).toBeTruthy();
    expect(screen.getByText("Theme & Display")).toBeTruthy();
    expect(screen.getAllByText("Pro Mode").length).toBeGreaterThan(0);
  });
});
