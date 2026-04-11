import { Link } from "@tanstack/react-router";
import { Sparkles, Zap, Menu, X } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { usePreferences } from "#/provider/PreferencesProvider";
import { WalletManager } from "./WalletManager";
import { TransactionJourneyActivityButton } from "./TransactionJourneyHost";
import { useState } from "react";

// Import Maya Protocol actual logo
import mayaLogo from "../assets/logos/maya-logo.png";

export default function Header() {
  const { isPowerUser, togglePowerUser } = usePreferences();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMenu = () => setIsMobileMenuOpen(false);

  // Link definitions for DRY
  const navLinks = [
    { to: "/", label: "Portfolio" },
    { to: "/swap", label: "Swap terminal" },
    { to: "/mayanames", label: "MAYANames" },
    { to: "/maya-masks", label: "Maya Masks" },
    { to: "/cacao-pool", label: "CACAOPool" },
    { to: "/liquidity", label: "LP studio" },
    { to: "/settings", label: "Settings" },
  ];

  return (
    <header className="glass-panel sticky top-4 z-50 mx-4 sm:mx-6 md:mx-auto max-w-[1400px] mb-8 border border-[var(--line)] xl:border-b-0 rounded-[1.25rem] xl:rounded-b-none mt-4 transition-all">
      <nav className="px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-3 md:gap-4">
          {/* Brand */}
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/"
              onClick={closeMenu}
              className="flex min-w-0 items-center gap-3 no-underline group"
            >
              <div className="bg-[var(--line)] p-2 rounded-xl border border-[var(--inset-glint)] group-hover:bg-[var(--halo-glow)] transition-colors">
                <img
                  src={mayaLogo}
                  alt="Maya Logo"
                  className="w-6 h-6 object-contain"
                />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="font-bold text-lg leading-none tracking-tight whitespace-nowrap">
                  Maya Zero
                </span>
                <span className="kicker hidden sm:block">Interface</span>
              </div>
            </Link>
          </div>

          {/* Center Links (Desktop) */}
          <div className="hidden xl:flex items-center gap-8 font-semibold text-sm">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="text-[var(--sea-ink-soft)] hover:text-[var(--cacao-neon)] transition-colors whitespace-nowrap"
                activeProps={{ className: "text-[var(--cacao-neon)]" }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <TransactionJourneyActivityButton />
            <WalletManager />

            <button
              onClick={togglePowerUser}
              className={`hidden sm:flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-300 ${isPowerUser ? "border-[var(--cacao-neon)] bg-[var(--halo-glow)] text-[var(--cacao-neon)] shadow-[0_0_12px_rgba(232,122,78,0.3)]" : "border-[var(--line)] bg-[var(--bg-base)] text-[var(--sea-ink-soft)] hover:text-[var(--sea-ink)]"}`}
              title="Toggle Pro Mode"
            >
              {isPowerUser ? (
                <Zap size={14} className="fill-current" />
              ) : (
                <Sparkles size={14} />
              )}
              <span className="hidden xl:inline">Pro Mode</span>
            </button>

            <div className="hidden xl:block h-4 w-px bg-[var(--line)]" />

            <div className="hidden sm:block">
              <ThemeToggle />
            </div>

            <button
              className="md:hidden p-2 text-[var(--sea-ink)] hover:text-[var(--maya-teal)] hover:bg-[var(--surface-strong)] rounded-xl ml-1 transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        <div className="hidden md:flex xl:hidden mt-4 pt-4 border-t border-[var(--line)] gap-2 overflow-x-auto">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="shrink-0 rounded-full border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-2 text-sm font-semibold text-[var(--sea-ink-soft)] hover:text-[var(--cacao-neon)] hover:border-[var(--cacao-neon)]/30 transition-colors whitespace-nowrap"
              activeProps={{
                className:
                  "shrink-0 rounded-full border border-[var(--cacao-neon)]/40 bg-[rgba(232,122,78,0.08)] px-4 py-2 text-sm font-semibold text-[var(--cacao-neon)] whitespace-nowrap",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* Mobile Navigation Dropdown */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 mt-2 mx-0 bg-[var(--bg-base)]/95 backdrop-blur-2xl border border-[var(--line)] rounded-[1.25rem] shadow-2xl p-4 flex flex-col gap-2 animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="flex flex-col gap-1 pb-4 border-b border-[var(--line)]">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={closeMenu}
                className="px-4 py-3 rounded-xl font-bold text-lg text-[var(--sea-ink-soft)] hover:text-[var(--cacao-neon)] hover:bg-[var(--surface)] transition-all"
                activeProps={{
                  className:
                    "text-[var(--cacao-neon)] bg-[rgba(232,122,78,0.05)] shadow-inner",
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Mobile-only tools that get hidden mostly */}
          <div className="flex items-center justify-between p-4 sm:hidden">
            <span className="font-bold text-[var(--sea-ink)] text-sm flex items-center gap-2">
              Theme & Display
            </span>
            <ThemeToggle />
          </div>

          <div className="flex justify-between items-center p-4 pt-1 sm:hidden">
            <span className="font-bold text-[var(--sea-ink)] text-sm flex items-center gap-2">
              Pro Mode Toggle
            </span>
            <button
              onClick={togglePowerUser}
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-300 ${isPowerUser ? "border-[var(--cacao-neon)] bg-[var(--halo-glow)] text-[var(--cacao-neon)] shadow-[0_0_12px_rgba(232,122,78,0.3)]" : "border-[var(--line)] bg-[var(--chip-bg)] text-[var(--sea-ink-soft)]"}`}
            >
              {isPowerUser ? (
                <Zap size={14} className="fill-current" />
              ) : (
                <Sparkles size={14} />
              )}
              {isPowerUser ? "Enabled" : "Disabled"}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
