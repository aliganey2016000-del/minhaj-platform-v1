/**
 * Escapes regex metacharacters so untrusted search input (a `?search=`
 * query param, typed by any user) is always used as a literal substring
 * match in a MongoDB $regex filter, never interpreted as regex syntax.
 * Unescaped input crashes the query outright on invalid syntax (e.g. a bare
 * "+" — "Regular expression is invalid: quantifier does not follow a
 * repeatable item" — from something as ordinary as a phone number) and, on
 * crafted input, can degrade into catastrophic backtracking.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
