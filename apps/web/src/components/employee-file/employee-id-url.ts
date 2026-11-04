/**
 * The external id in a URL (step E1).
 *
 * The URL key is the **external id**, never a snapshot UUID: a snapshot id
 * changes every period, so a bookmark would rot monthly.
 *
 * Real registers carry ids like `EMP/0012` and `0012 A`. An unencoded slash
 * silently becomes a second path segment — which breaks Next's route matching
 * *and* the sidebar's `"/" + pathname.split("/")[1]` active-state match, so the
 * nav item stops highlighting on exactly the ids that look most like a bug
 * somewhere else.
 *
 * Plain `.ts` on purpose: `apps/web/tsconfig.json` sets `jsx: "preserve"`, so a
 * vitest module importing this from a `.tsx` file would be left with unparsed
 * JSX at runtime. The two real-world shapes above have a unit test.
 */

/** For a `<Link href>`. One segment, whatever the id contains. */
export function employeeFileHref(externalId: string, search?: string): string {
  const query = search && search.length > 0 ? `?${search.replace(/^\?/, "")}` : "";
  return `/employees/${encodeURIComponent(externalId)}${query}`;
}

/**
 * The id back out of a route param.
 *
 * Next decodes dynamic segments itself, so this is a second, defensive decode
 * for the case where it has not: `decodeURIComponent` is a no-op on an id with
 * no escape sequences, and an id containing a bare `%` makes it throw rather
 * than mangle, so the raw value is returned instead of a corrupted one.
 */
export function decodeEmployeeId(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}
