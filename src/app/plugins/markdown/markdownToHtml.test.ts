import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./markdownToHtml";

describe("markdownToHtml", () => {
  it("converts headings", () => {
    const result = markdownToHtml("# Hello World");
    expect(result).toContain("<h1");
    expect(result).toContain("Hello World");
  });

  it("converts bold text", () => {
    const result = markdownToHtml("**bold**");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("converts italic text", () => {
    const result = markdownToHtml("*italic*");
    expect(result).toContain("<em>italic</em>");
  });

  it("converts inline code", () => {
    const result = markdownToHtml("`code`");
    expect(result).toContain("<code>code</code>");
  });

  it("converts links", () => {
    const result = markdownToHtml("[link](https://example.com)");
    expect(result).toContain('<a href="https://example.com"');
  });

  it("converts spoiler syntax", () => {
    const result = markdownToHtml("||spoiler||");
    expect(result).toContain("data-mx-spoiler");
    expect(result).toContain("spoiler");
  });

  it("converts inline math syntax", () => {
    const result = markdownToHtml("$E = mc^2$");
    expect(result).toContain("data-mx-maths");
    expect(result).toContain("E = mc^2");
  });

  it("converts block math syntax", () => {
    const result = markdownToHtml("$$\\frac{a}{b}$$");
    expect(result).toContain("data-mx-maths");
    expect(result).toContain("<div");
  });

  it("does not parse k. as a list", () => {
    const result = markdownToHtml("k. Hello world");
    expect(result).not.toContain("<li>");
    expect(result).not.toContain("<ol>");
    expect(result).not.toContain("<ul>");
  });

  it("handles text without markdown", () => {
    const result = markdownToHtml("Plain text without any formatting");
    expect(result).toContain("Plain text");
  });

  it("handles multiline content", () => {
    const result = markdownToHtml("Line 1\nLine 2\nLine 3");
    expect(result).toContain("Line 1");
    expect(result).toContain("Line 2");
  });

  it("handles escaped markdown characters", () => {
    const result = markdownToHtml("This is \\*not bold\\*");
    expect(result).not.toContain("<strong>");
    expect(result).toContain("not bold");
  });
});
