import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  Menu,
  Sparkles,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { usePreferences } from "#/provider/PreferencesProvider";
import { WalletManager } from "./WalletManager";
import { TransactionJourneyActivityButton } from "./TransactionJourneyHost";
import { useImpersonationState } from "#/provider/ImpersonationProvider";

import mayaLogo from "../assets/logos/maya-logo.png";

const primaryLinks = [
  { to: "/", label: "Portfolio" },
  { to: "/swap", label: "Swap" },
  { to: "/liquidity", label: "Liquidity" },
] as const;

const toolLinks = [
  { to: "/pooled-nodes", label: "Pooled Nodes" },
  { to: "/cacao-pool", label: "CACAOPool" },
  { to: "/maya-token", label: "Maya Token" },
  { to: "/mayanames", label: "MAYANames" },
  { to: "/maya-masks", label: "Maya Masks" },
  { to: "/settings", label: "Settings" },
];

interface toolLink {
  readonly to: string;
  readonly label: string;
}

const desktopLinkClassName =
  "rounded-full px-4 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] transition-colors whitespace-nowrap hover:bg-[var(--halo-glow)] hover:text-[var(--cacao-neon)]";

const desktopLinkActiveClassName =
  "bg-[rgba(232,122,78,0.08)] text-[var(--cacao-neon)] shadow-[inset_0_0_0_1px_rgba(232,122,78,0.14)]";

function isPathActive(pathname: string, target: string) {
  if (target === "/") {
    return pathname === "/";
  }

  return pathname === target || pathname.startsWith(`${target}/`);
}

export default function Header() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const { isPowerUser, togglePowerUser } = usePreferences();
  const impersonation = useImpersonationState();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState(false);
  const [filteredToolLinks, setFilteredToolLinks] =
    useState<toolLink[]>(toolLinks);

  const toolsMenuId = useId();
  const utilityMenuId = useId();
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const utilityMenuRef = useRef<HTMLDivElement>(null);
  const toolsTriggerRef = useRef<HTMLButtonElement>(null);
  const utilityTriggerRef = useRef<HTMLButtonElement>(null);

  const isToolsRouteActive = filteredToolLinks.some((link) =>
    isPathActive(pathname, link.to),
  );

  const closeToolsMenu = (restoreFocus = true) => {
    setIsToolsMenuOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => toolsTriggerRef.current?.focus());
    }
  };

  const closeUtilityMenu = (restoreFocus = true) => {
    setIsUtilityMenuOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => utilityTriggerRef.current?.focus());
    }
  };

  const closeAllMenus = () => {
    setIsMobileMenuOpen(false);
    closeToolsMenu(false);
    closeUtilityMenu(false);
  };

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (
        isToolsMenuOpen &&
        toolsMenuRef.current &&
        !toolsMenuRef.current.contains(target)
      ) {
        closeToolsMenu(false);
      }

      if (
        isUtilityMenuOpen &&
        utilityMenuRef.current &&
        !utilityMenuRef.current.contains(target)
      ) {
        closeUtilityMenu(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      if (isUtilityMenuOpen) {
        event.preventDefault();
        closeUtilityMenu();
      }

      if (isToolsMenuOpen) {
        event.preventDefault();
        closeToolsMenu();
      }

      if (isMobileMenuOpen) {
        event.preventDefault();
        setIsMobileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen, isToolsMenuOpen, isUtilityMenuOpen]);

  return (
    <header className="glass-panel sticky top-4 z-50 mx-4 mt-4 mb-8 max-w-[1400px] rounded-[1.25rem] border border-[var(--line)] transition-all sm:mx-6 md:mx-auto">
      <nav className="px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3 lg:grid lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/"
              onClick={closeAllMenus}
              className="group flex min-w-0 items-center gap-3 no-underline"
            >
              <div className="rounded-xl border border-[var(--inset-glint)] bg-[var(--line)] p-2 transition-colors group-hover:bg-[var(--halo-glow)]">
                <img
                  src={mayaLogo}
                  alt="Maya Logo"
                  className="h-6 w-6 object-contain"
                />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="whitespace-nowrap text-lg leading-none font-bold tracking-tight">
                  Maya Zero
                </span>
                <span className="kicker hidden sm:block">Interface</span>
              </div>
            </Link>
          </div>

          <div className="hidden min-w-0 items-center justify-center px-4 lg:flex">
            <div className="flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-strong)]/90 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              {primaryLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={closeAllMenus}
                  activeOptions={{ exact: link.to === "/" }}
                  className={desktopLinkClassName}
                  activeProps={{ className: desktopLinkActiveClassName }}
                >
                  {link.label}
                </Link>
              ))}

              <div className="relative" ref={toolsMenuRef}>
                <button
                  ref={toolsTriggerRef}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isToolsMenuOpen}
                  aria-controls={toolsMenuId}
                  onClick={() => {
                    setIsToolsMenuOpen((current) => {
                      const next = !current;
                      if (next) {
                        closeUtilityMenu(false);
                      }
                      return next;
                    });
                  }}
                  className={`${desktopLinkClassName} inline-flex items-center gap-2 ${
                    isToolsRouteActive || isToolsMenuOpen
                      ? desktopLinkActiveClassName
                      : ""
                  }`}
                >
                  Tools
                  <ChevronDown
                    size={16}
                    className={`transition-transform ${
                      isToolsMenuOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isToolsMenuOpen ? (
                  <div
                    id={toolsMenuId}
                    role="menu"
                    aria-label="Tools"
                    className="absolute top-full left-1/2 z-[90] mt-3 flex w-64 -translate-x-1/2 flex-col gap-1 rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)]/95 p-3 shadow-2xl backdrop-blur-2xl"
                  >
                    {toolLinks.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        role="menuitem"
                        onClick={closeAllMenus}
                        className="rounded-xl px-4 py-3 text-sm font-semibold text-[var(--sea-ink-soft)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--cacao-neon)]"
                        activeProps={{
                          className:
                            "rounded-xl bg-[rgba(232,122,78,0.08)] px-4 py-3 text-sm font-semibold text-[var(--cacao-neon)] shadow-[inset_0_0_0_1px_rgba(232,122,78,0.14)]",
                        }}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            {impersonation.isViewOnly ? (
              <div className="hidden md:inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-amber-500">
                <span>Impersonation</span>
                <span className="text-[var(--sea-ink-soft)]">View Only</span>
              </div>
            ) : null}
            <TransactionJourneyActivityButton />
            <WalletManager />

            <div className="relative hidden lg:block" ref={utilityMenuRef}>
              <button
                ref={utilityTriggerRef}
                type="button"
                aria-label="Open interface controls"
                aria-haspopup="menu"
                aria-expanded={isUtilityMenuOpen}
                aria-controls={utilityMenuId}
                onClick={() => {
                  setIsUtilityMenuOpen((current) => {
                    const next = !current;
                    if (next) {
                      closeToolsMenu(false);
                    }
                    return next;
                  });
                }}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-all duration-300 ${
                  isUtilityMenuOpen
                    ? "border-[var(--maya-teal)] bg-[rgba(26,154,141,0.1)] text-[var(--maya-teal)] shadow-[0_0_12px_rgba(26,154,141,0.18)]"
                    : "border-[var(--line)] bg-[var(--surface-strong)] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                }`}
              >
                <SlidersHorizontal size={16} />
                <span className="hidden xl:inline">Display</span>
              </button>

              {isUtilityMenuOpen ? (
                <div
                  id={utilityMenuId}
                  role="menu"
                  aria-label="Interface controls"
                  className="absolute top-full right-0 z-[90] mt-3 flex w-64 flex-col gap-3 rounded-[1.25rem] border border-[var(--line)] bg-[var(--surface-strong)]/95 p-4 shadow-2xl backdrop-blur-2xl"
                >
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)]/70 px-4 py-3">
                    <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--sea-ink-soft)]">
                      Theme
                    </span>
                    <ThemeToggle />
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={togglePowerUser}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-all duration-300 ${
                      isPowerUser
                        ? "border-[var(--cacao-neon)] bg-[var(--halo-glow)] text-[var(--cacao-neon)] shadow-[0_0_12px_rgba(232,122,78,0.24)]"
                        : "border-[var(--line)] bg-[var(--surface)]/70 text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"
                    }`}
                    title="Toggle Pro Mode"
                  >
                    <span className="inline-flex items-center gap-2">
                      {isPowerUser ? (
                        <Zap size={16} className="fill-current" />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      Pro Mode
                    </span>
                    <span className="text-xs uppercase tracking-[0.18em]">
                      {isPowerUser ? "On" : "Off"}
                    </span>
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              aria-label={
                isMobileMenuOpen
                  ? "Close navigation menu"
                  : "Open navigation menu"
              }
              className="ml-1 rounded-xl p-2 text-[var(--sea-ink)] transition-colors hover:bg-[var(--surface-strong)] hover:text-[var(--maya-teal)] lg:hidden"
              onClick={() => {
                setIsMobileMenuOpen((current) => !current);
                closeToolsMenu(false);
                closeUtilityMenu(false);
              }}
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </nav>

      {isMobileMenuOpen ? (
        <div className="absolute top-full left-0 right-0 z-[85] mx-0 mt-2 flex flex-col gap-5 rounded-[1.25rem] border border-[var(--line)] bg-[var(--bg-base)]/95 p-4 shadow-2xl backdrop-blur-2xl animate-in slide-in-from-top-2 fade-in duration-200 lg:hidden">
          <div className="flex flex-col gap-1">
            <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)]">
              Workspaces
            </div>
            {primaryLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={closeAllMenus}
                activeOptions={{ exact: link.to === "/" }}
                className="rounded-xl px-4 py-3 text-lg font-bold text-[var(--sea-ink-soft)] transition-all hover:bg-[var(--surface)] hover:text-[var(--cacao-neon)]"
                activeProps={{
                  className:
                    "rounded-xl bg-[rgba(232,122,78,0.05)] px-4 py-3 text-lg font-bold text-[var(--cacao-neon)] shadow-inner",
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex flex-col gap-1 border-t border-[var(--line)] pt-4">
            <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)]">
              Tools
            </div>
            {toolLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={closeAllMenus}
                className="rounded-xl px-4 py-3 text-lg font-bold text-[var(--sea-ink-soft)] transition-all hover:bg-[var(--surface)] hover:text-[var(--cacao-neon)]"
                activeProps={{
                  className:
                    "rounded-xl bg-[rgba(232,122,78,0.05)] px-4 py-3 text-lg font-bold text-[var(--cacao-neon)] shadow-inner",
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4">
            {impersonation.isViewOnly ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-500">
                Impersonation mode is active. Navigation is view-only.
              </div>
            ) : null}
            <div className="px-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--sea-ink-soft)]">
              Interface
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)]/70 px-4 py-3">
              <span className="text-sm font-bold text-[var(--sea-ink)]">
                Theme & Display
              </span>
              <ThemeToggle />
            </div>

            <button
              type="button"
              onClick={togglePowerUser}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-300 ${
                isPowerUser
                  ? "border-[var(--cacao-neon)] bg-[var(--halo-glow)] text-[var(--cacao-neon)] shadow-[0_0_12px_rgba(232,122,78,0.24)]"
                  : "border-[var(--line)] bg-[var(--surface)]/70 text-[var(--sea-ink-soft)]"
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {isPowerUser ? (
                  <Zap size={16} className="fill-current" />
                ) : (
                  <Sparkles size={16} />
                )}
                Pro Mode
              </span>
              <span className="text-xs uppercase tracking-[0.18em]">
                {isPowerUser ? "On" : "Off"}
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
