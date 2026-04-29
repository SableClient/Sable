import { describe, expect, it } from "vitest";
import { marked } from "marked";
import { matrixSpoilerExtension } from "./matrix-spoiler";
import { matrixMathExtension, matrixMathBlockExtension } from "./matrix-math";

function parse(input: string): string {
  const processor = marked.use({
    extensions: [
      matrixSpoilerExtension,
      matrixMathExtension,
      matrixMathBlockExtension,
    ],
  });
  return processor.parse(input) as string;
}

describe("matrixSpoilerExtension", () => {
  it("parses ||spoiler|| syntax", () => {
    expect(parse("Hello ||spoiler|| world")).toContain("data-mx-spoiler");
    expect(parse("Hello ||spoiler|| world")).toContain(">spoiler<");
  });

  it("does not parse text without spoiler markers", () => {
    expect(parse("No spoilers here")).not.toContain("data-mx-spoiler");
  });

  it("parses ||hidden|| without surrounding text", () => {
    const result = parse("||hidden||");
    expect(result).toContain("data-mx-spoiler");
    expect(result).toContain(">hidden<");
  });
});

describe("matrixMathExtension (inline)", () => {
  it("parses inline $...$ syntax", () => {
    expect(parse("$E = mc^2$")).toContain("data-mx-maths");
    expect(parse("$E = mc^2$")).toContain("E = mc^2");
  });

  it("parses inline math within text", () => {
    const result = parse("Math: $x$ value");
    expect(result).toContain("data-mx-maths");
    expect(result).toContain(">x<");
  });

  it("does not parse unmatched $", () => {
    expect(parse("No $ math here")).not.toContain("data-mx-maths");
  });
});

describe("matrixMathBlockExtension (block)", () => {
  it("parses block $$...$$ syntax", () => {
    const result = parse("$$\\frac{a}{b}$$");
    expect(result).toContain("data-mx-maths");
    expect(result).toContain("<div");
  });

  it("does not parse inline $ as block", () => {
    const result = parse("$x$");
    expect(result).not.toContain("<div");
    expect(result).toContain("data-mx-maths");
    expect(result).toContain("<span");
  });
});
