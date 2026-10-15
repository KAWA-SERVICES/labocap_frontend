import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { sanitize } from "./sanitize";
import { RichTextEditor } from "@/components/ui/RichTextEditor";

describe("sanitize", () => {
  it("retire les gestionnaires d'événements et les scripts d'une signature SVG", () => {
    const propre = sanitize(
      '<svg onload="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)"><path d="M0 0" /></a></svg>',
      "svg",
    );
    expect(propre).not.toContain("onload");
    expect(propre).not.toContain("<script");
    expect(propre).not.toContain("javascript:");
    expect(propre).toContain("<path");
  });

  it("retire les scripts d'un compte rendu HTML", () => {
    expect(sanitize("<p>Diagnostic</p><script>alert(1)</script>")).toBe("<p>Diagnostic</p>");
  });
});

describe("RichTextEditor", () => {
  it("n'injecte jamais un <script> reçu dans value", () => {
    const { container } = render(
      <RichTextEditor value="<p>CR</p><script>alert(1)</script>" onChange={() => {}} />,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[contenteditable]")?.innerHTML).toContain("<p>CR</p>");
  });
});
