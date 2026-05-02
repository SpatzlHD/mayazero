import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import Footer from "./Footer";
import { BETA_DISCLAIMER_COPY } from "./BetaDisclaimer";

function collectText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join("");
  }
  if (typeof node === "object" && "props" in node) {
    const element = node as ReactElement<{ children?: ReactNode }>;
    return collectText(element.props.children);
  }
  return "";
}

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | undefined {
  if (node == null || typeof node === "boolean") {
    return undefined;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) {
        return match;
      }
    }
    return undefined;
  }
  if (typeof node === "object" && "type" in node && "props" in node) {
    const element = node as ReactElement<Record<string, unknown> & { children?: ReactNode }>;

    if (predicate(element)) {
      return element;
    }

    return findElement(element.props.children, predicate);
  }
  return undefined;
}

describe("Footer", () => {
  it("renders the beta disclaimer copy", () => {
    const tree = Footer();

    expect(collectText(tree)).toContain(BETA_DISCLAIMER_COPY);
  });

  it("includes an internal changelog link", () => {
    const tree = Footer();
    const changelogLink = findElement(
      tree,
      (element) =>
        element.props.to === "/changelog" &&
        collectText(element.props.children).includes("Changelog"),
    );

    expect(changelogLink).toBeTruthy();
  });

  it("includes external content site links", () => {
    const tree = Footer();
    const blogLink = findElement(
      tree,
      (element) =>
        element.props.href === "http://localhost:3001/blog" &&
        collectText(element.props.children).includes("Blog"),
    );
    const kbLink = findElement(
      tree,
      (element) =>
        element.props.href === "http://localhost:3001/knowledge-base" &&
        collectText(element.props.children).includes("Knowledge Base"),
    );

    expect(blogLink).toBeTruthy();
    expect(kbLink).toBeTruthy();
  });
});
