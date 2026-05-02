import { Link } from "@tanstack/react-router";
import { BETA_DISCLAIMER_COPY } from "./BetaDisclaimer";

export default function Footer() {
  const year = new Date().getFullYear();
  const contentSiteUrl =
    import.meta.env.VITE_CONTENT_SITE_URL?.trim() || "http://localhost:3001";

  return (
    <footer className="site-footer mt-20 px-4 pb-14 pt-10 text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-xl">
          <p className="island-kicker m-0">Maya Zero</p>
          <p className="brand-wordmark mt-3 text-2xl text-[var(--sea-ink)]">
            One workspace for portfolio tracking, swaps, MAYANames, and
            CACAOPool activity on Maya Protocol.
          </p>
        </div>
        <div className="grid gap-2 text-sm">
          <p className="m-0">&copy; {year} Maya Zero.</p>
          <p className="m-0">
            Connect a vault, inspect balances, and move through protocol flows
            without losing wallet context.
          </p>
          <p className="footer-legal-note m-0 text-xs leading-6">
            {BETA_DISCLAIMER_COPY}
          </p>
        </div>
      </div>
      <div className="page-wrap mt-8 flex flex-wrap items-center gap-4 border-t border-[var(--line)] pt-6">
        <Link to="/changelog" className="nav-link">
          Changelog
        </Link>
        <a href={`${contentSiteUrl}/blog`} target="_blank" rel="noreferrer" className="nav-link">
          Blog
        </a>
        <a
          href={`${contentSiteUrl}/knowledge-base`}
          target="_blank"
          rel="noreferrer"
          className="nav-link"
        >
          Knowledge Base
        </a>
        <a
          href="https://docs.mayaprotocol.com"
          target="_blank"
          rel="noreferrer"
          className="nav-link"
        >
          Maya Protocol Docs
        </a>
        <a
          href="https://github.com/SpatzlHD/mayazero"
          target="_blank"
          rel="noreferrer"
          className="nav-link"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
