import { getMayaChainIdentity } from "./maya-asset-catalog";

export const SEO_SITE_NAME = "MayaZero";
export const SEO_THEME_COLOR = "#0f172a";
export const SEO_FAVICON_PATH = "/maya-logo.png";
export const SEO_MANIFEST_PATH = "/manifest.json";
export const SEO_DEFAULT_DESCRIPTION =
  "MayaZero is a Maya Protocol workstation for portfolio tracking, cross-chain swaps, liquidity management, and vault setup.";

type SeoConfig = {
  description?: string;
  title?: string;
};

export function buildPageTitle(title?: string): string {
  return title ? `${title} | ${SEO_SITE_NAME}` : SEO_SITE_NAME;
}

export function buildRootSeoHead() {
  return {
    links: [
      { rel: "icon", type: "image/png", href: SEO_FAVICON_PATH },
      { rel: "apple-touch-icon", href: SEO_FAVICON_PATH },
      { rel: "manifest", href: SEO_MANIFEST_PATH },
    ],
    meta: [
      { title: buildPageTitle() },
      { name: "description", content: SEO_DEFAULT_DESCRIPTION },
      { name: "robots", content: "index,follow" },
      { name: "theme-color", content: SEO_THEME_COLOR },
    ],
  };
}

export function buildPageSeoHead(config: SeoConfig) {
  return {
    meta: [
      { title: buildPageTitle(config.title) },
      {
        name: "description",
        content: config.description ?? SEO_DEFAULT_DESCRIPTION,
      },
    ],
  };
}

export function getChainSeoContent(chainKey: string): Required<SeoConfig> {
  const chain = getMayaChainIdentity(chainKey);

  return {
    title: `${chain.name} Portfolio`,
    description: `Track ${chain.name} balances, supported assets, and vault connectivity in MayaZero.`,
  };
}
