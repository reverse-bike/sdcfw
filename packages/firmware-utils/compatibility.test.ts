import { expect, test } from "bun:test";
import { versionMatchesAny, versionMatchesPattern } from "./compatibility.js";

test("matches an exact version", () => {
  expect(versionMatchesPattern(310, "310")).toBe(true);
  expect(versionMatchesPattern(311, "310")).toBe(false);
});

test("treats X as any digit", () => {
  expect(versionMatchesPattern(310, "3XX")).toBe(true);
  expect(versionMatchesPattern(399, "3XX")).toBe(true);
  expect(versionMatchesPattern(400, "3XX")).toBe(false);
  expect(versionMatchesPattern(31, "3XX")).toBe(false);
  expect(versionMatchesPattern(3100, "3XX")).toBe(false);
});

test("matches string versions like the display reports", () => {
  expect(versionMatchesPattern("221122", "221122")).toBe(true);
  expect(versionMatchesPattern("221122", "22XXXX")).toBe(true);
  expect(versionMatchesPattern("6-221122-0", "3XX")).toBe(false);
});

test("does not treat a literal X position as a wildcard for non-digits", () => {
  expect(versionMatchesPattern("3-1", "3XX")).toBe(false);
});

test("matches any of several patterns", () => {
  expect(versionMatchesAny(311, ["310", "311"])).toBe(true);
  expect(versionMatchesAny(312, ["310", "311"])).toBe(false);
  expect(versionMatchesAny(312, ["3XX"])).toBe(true);
  expect(versionMatchesAny(312, [])).toBe(false);
});
