import { describe, expect, it } from "vitest";
import { getMayaChainIdentity } from "./maya-asset-catalog";
import {
  SEO_DEFAULT_DESCRIPTION,
  buildPageSeoHead,
  buildPageTitle,
  buildRootSeoHead,
  getChainSeoContent,
} from "./seo";

describe("seo", () => {
  it("builds branded page titles", () => {
    expect(buildPageTitle("Portfolio")).toBe("Portfolio | MayaZero");
    expect(buildPageTitle()).toBe("MayaZero");
  });

  it("builds page metadata with a route-specific description", () => {
    expect(
      buildPageSeoHead({
        title: "Swap",
        description: "Cross-chain swap terminal.",
      }),
    ).toEqual({
      meta: [
        { title: "Swap | MayaZero" },
        { name: "description", content: "Cross-chain swap terminal." },
      ],
    });
  });

  it("provides fallback root metadata", () => {
    expect(buildRootSeoHead()).toMatchObject({
      links: expect.arrayContaining([
        expect.objectContaining({ rel: "icon", href: "/maya-logo.png" }),
      ]),
      meta: expect.arrayContaining([
        { title: "MayaZero" },
        { name: "description", content: SEO_DEFAULT_DESCRIPTION },
      ]),
    });
  });

  it("resolves known chain metadata for seo", () => {
    expect(getMayaChainIdentity("ethereum")).toMatchObject({
      key: "ethereum",
      name: "Ethereum",
      ticker: "ETH",
    });
    expect(getChainSeoContent("ethereum")).toEqual({
      title: "Ethereum Portfolio",
      description:
        "Track Ethereum balances, supported assets, and vault connectivity in MayaZero.",
    });
  });

  it("falls back cleanly for unknown chain keys", () => {
    expect(getMayaChainIdentity("foo-bar")).toMatchObject({
      key: "foo-bar",
      name: "Foo Bar",
      ticker: "FOO-BAR",
    });
    expect(getChainSeoContent("foo-bar")).toEqual({
      title: "Foo Bar Portfolio",
      description:
        "Track Foo Bar balances, supported assets, and vault connectivity in MayaZero.",
    });
  });
});
