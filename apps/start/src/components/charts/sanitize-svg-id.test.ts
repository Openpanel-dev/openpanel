import { describe, expect, it } from "vitest";
import { sanitizeSvgId } from "./sanitize-svg-id";

describe("sanitizeSvgId", () => {
  it("strips React useId colons so Safari can resolve url(#id)", () => {
    expect(sanitizeSvgId(":r1:")).toBe("r1");
  });

  it("strips guillemet wrappers from older React 19 ids", () => {
    expect(sanitizeSvgId("«r0»")).toBe("r0");
  });

  it("keeps underscore-style React 19.2 ids", () => {
    expect(sanitizeSvgId("_r_0_")).toBe("_r_0_");
  });

  it("prefixes when the cleaned id would start with a digit", () => {
    expect(sanitizeSvgId("123")).toBe("svg-123");
  });
});
