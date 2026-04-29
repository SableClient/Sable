import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "./htmlToMarkdown";

describe("htmlToMarkdown", () => {
  it("converts headings", () => {
    expect(htmlToMarkdown("<h1>Hello</h1>")).toContain("# Hello");
    expect(htmlToMarkdown("<h2>World</h2>")).toContain("## World");
  });

  it("converts bold text", () => {
    expect(htmlToMarkdown("<strong>bold</strong>")).toContain("**bold**");
    expect(htmlToMarkdown("<b>bold</b>")).toContain("**bold**");
  });

  it("converts italic text", () => {
    expect(htmlToMarkdown("<em>italic</em>")).toContain("*italic*");
    expect(htmlToMarkdown("<i>italic</i>")).toContain("*italic*");
  });

  it("converts strikethrough", () => {
    expect(htmlToMarkdown("<s>deleted</s>")).toContain("~~deleted~~");
    expect(htmlToMarkdown("<del>deleted</del>")).toContain("~~deleted~~");
  });

  it("converts inline code", () => {
    expect(htmlToMarkdown("<code>code</code>")).toContain("`code`");
  });

  it("converts code blocks", () => {
    expect(
      htmlToMarkdown(
        '<pre><code class="language-rust">fn main() {}</code></pre>',
      ),
    ).toContain("```rust");
  });

  it("converts links", () => {
    expect(htmlToMarkdown('<a href="https://example.com">link</a>')).toContain(
      "[link](https://example.com)",
    );
  });

  it("converts spoiler spans", () => {
    expect(htmlToMarkdown("<span data-mx-spoiler>hidden</span>")).toContain(
      "||hidden||",
    );
  });

  it("converts inline math spans", () => {
    expect(
      htmlToMarkdown('<span data-mx-maths="E = mc^2">E = mc^2</span>'),
    ).toContain("$E = mc^2$");
  });

  it("converts block math divs", () => {
    expect(
      htmlToMarkdown('<div data-mx-maths="\\frac{a}{b}">frac</div>'),
    ).toContain("$$\\frac{a}{b}$$");
  });

  it("converts blockquotes", () => {
    const result = htmlToMarkdown("<blockquote>Quote text</blockquote>");
    expect(result).toContain(">");
    expect(result).toContain("Quote text");
  });

  it("converts unordered lists", () => {
    const result = htmlToMarkdown("<ul><li>Item 1</li><li>Item 2</li></ul>");
    expect(result).toContain("-");
    expect(result).toContain("Item 1");
  });

  it("converts ordered lists", () => {
    const result = htmlToMarkdown("<ol><li>Item 1</li><li>Item 2</li></ol>");
    expect(result).toContain("1.");
    expect(result).toContain("Item 1");
  });

  it("preserves data-md attributes for round-trip", () => {
    const result = htmlToMarkdown('<strong data-md="**">bold</strong>');
    expect(result).toContain("**bold**");
  });

  it("escapes markdown special characters in text", () => {
    const result = htmlToMarkdown("<p>Hello *world*</p>");
    expect(result).toContain("\\*");
  });
});
