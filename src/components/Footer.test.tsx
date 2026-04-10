import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Footer from "./Footer";
import { BETA_DISCLAIMER_COPY } from "./BetaDisclaimer";

describe("Footer", () => {
  it("renders the beta disclaimer copy", () => {
    const html = renderToString(<Footer />);

    expect(html).toContain(BETA_DISCLAIMER_COPY);
  });
});
