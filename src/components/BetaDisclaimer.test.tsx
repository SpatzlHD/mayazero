import type { ReactElement, ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  BETA_DISCLAIMER_COPY,
  BETA_DISCLAIMER_STORAGE_KEY,
  BetaDisclaimerDialog,
  persistBetaDisclaimerAcceptance,
  shouldShowBetaDisclaimer,
} from "./BetaDisclaimer";

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

function findElementByType(
  node: ReactNode,
  type: string,
): ReactElement<{ children?: ReactNode; onClick?: () => void }> | null {
  if (node == null || typeof node === "boolean") {
    return null;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByType(child, type);
      if (match) return match;
    }
    return null;
  }
  if (typeof node === "object" && "type" in node && "props" in node) {
    const element = node as ReactElement<{ children?: ReactNode; onClick?: () => void }>;
    if (element.type === type) {
      return element;
    }
    return findElementByType(element.props.children, type);
  }
  return null;
}

describe("BetaDisclaimer helpers", () => {
  it("shows the disclaimer when no acceptance is stored", () => {
    const storage = {
      getItem: () => null,
    };

    expect(shouldShowBetaDisclaimer(storage)).toBe(true);
  });

  it("hides the disclaimer when acceptance is already stored", () => {
    const storage = {
      getItem: () => "true",
    };

    expect(shouldShowBetaDisclaimer(storage)).toBe(false);
  });

  it("writes the acceptance flag to storage", () => {
    let storedKey = "";
    let storedValue = "";

    persistBetaDisclaimerAcceptance({
      setItem: (key, value) => {
        storedKey = key;
        storedValue = value;
      },
    });

    expect(storedKey).toBe(BETA_DISCLAIMER_STORAGE_KEY);
    expect(storedValue).toBe("true");
  });
});

describe("BetaDisclaimer component", () => {
  it("renders the disclaimer dialog copy", () => {
    const html = renderToString(
      <BetaDisclaimerDialog onAcknowledge={() => {}} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain(BETA_DISCLAIMER_COPY);
    expect(html).toContain("I Understand");
  });

  it("wires the acknowledge button to the supplied handler", () => {
    const onAcknowledge = vi.fn();
    const tree = BetaDisclaimerDialog({ onAcknowledge });
    const button = findElementByType(tree, "button");

    expect(button).toBeTruthy();
    expect(collectText(button?.props.children ?? "")).toContain("I Understand");

    button?.props.onClick?.();

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });
});
