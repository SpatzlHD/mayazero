import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { changelogEntries } from "#/content/changelog";
import {
  DISMISSED_CHANGELOG_ENTRY_STORAGE_KEY,
  HomeChangelogPreview,
  loadDismissedChangelogEntryId,
  persistDismissedChangelogEntryId,
  shouldShowHomeChangelogPreview,
} from "./index";

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

describe("home changelog preview", () => {
  it("renders the latest changelog entry and a link to the full changelog", () => {
    const tree = HomeChangelogPreview({
      entry: changelogEntries[0],
      onDismiss: () => {},
    });
    const previewLink = findElement(
      tree,
      (element) =>
        element.props.to === "/changelog" &&
        collectText(element.props.children).includes("View full changelog"),
    );

    expect(collectText(tree)).toContain("What's new");
    expect(collectText(tree)).toContain(changelogEntries[0].title);
    expect(collectText(tree)).toContain(changelogEntries[0].date);
    expect(collectText(tree)).toContain(changelogEntries[0].items[0]);
    expect(
      findElement(
        tree,
        (element) =>
          typeof element.props.link === "object" &&
          element.props.link !== null &&
          "href" in element.props.link &&
          element.props.link.href === changelogEntries[0].links?.[0].href,
      ),
    ).toBeTruthy();
    expect(previewLink).toBeTruthy();
    expect(
      findElement(
        tree,
        (element) =>
          element.type === "button" &&
          element.props["aria-label"] === "Dismiss what's new",
      ),
    ).toBeTruthy();
  });

  it("keeps the homepage preview compact by showing only the first two items", () => {
    const tree = HomeChangelogPreview({
      entry: {
        date: "April 12, 2026",
        title: "Compact preview",
        items: ["First", "Second", "Third"],
      },
    });
    const text = collectText(tree);

    expect(text).toContain("First");
    expect(text).toContain("Second");
    expect(text).not.toContain("Third");
  });

  it("shows the preview again when the latest entry id changes", () => {
    expect(
      shouldShowHomeChangelogPreview(changelogEntries[0], changelogEntries[0].id),
    ).toBe(false);
    expect(
      shouldShowHomeChangelogPreview(
        { ...changelogEntries[0], id: "2026-04-12-next-release" },
        changelogEntries[0].id,
      ),
    ).toBe(true);
  });
});

describe("home changelog preview storage", () => {
  it("loads and persists the dismissed latest entry id", () => {
    let storedValue: string | null = null;
    const storage = {
      getItem: (key: string) =>
        key === DISMISSED_CHANGELOG_ENTRY_STORAGE_KEY ? storedValue : null,
      setItem: (key: string, value: string) => {
        if (key === DISMISSED_CHANGELOG_ENTRY_STORAGE_KEY) {
          storedValue = value;
        }
      },
    };

    expect(loadDismissedChangelogEntryId(storage)).toBeNull();

    persistDismissedChangelogEntryId(storage, changelogEntries[0].id);

    expect(loadDismissedChangelogEntryId(storage)).toBe(changelogEntries[0].id);
  });
});
