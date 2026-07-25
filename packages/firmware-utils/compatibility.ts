/**
 * Firmware version patterns.
 *
 * A pattern is a version with `X` standing in for any single digit, so `3XX`
 * matches 300 through 399. Exact versions are patterns with no `X`.
 *
 * Patterns exist because a release's compatibility is knowledge that grows: we
 * expect to learn that more versions work, and want to say so without re-cutting
 * an archive. They live alongside the site's content for the same reason.
 */

/** True when `version` matches a single pattern. */
export function versionMatchesPattern(version: string | number, pattern: string): boolean {
  const value = String(version);
  if (value.length !== pattern.length) return false;
  return [...pattern].every((character, index) => {
    if (character === "X" || character === "x") return /[0-9]/.test(value[index]!);
    return character === value[index];
  });
}

/** True when `version` matches any of the patterns. */
export function versionMatchesAny(version: string | number, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => versionMatchesPattern(version, pattern));
}
