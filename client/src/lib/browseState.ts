// Remembers the list page address (search, filters, sort) for this browser tab,
// so "All snippets" links return to the same filtered list.
const KEY = "offcuts-browse";
let last = "/";

function safe(href: string | null): string | null {
  // Only accept a path on this site, such as "/?tags=dax".
  return href === "/" || href?.startsWith("/?") ? href : null;
}

export function rememberBrowse(search: string): void {
  last = search ? `/?${search}` : "/";
  try {
    sessionStorage.setItem(KEY, last);
  } catch {
    // Storage can be blocked. The value in memory still works until a reload.
  }
}

export function browseHref(): string {
  try {
    return safe(sessionStorage.getItem(KEY)) ?? last;
  } catch {
    return last;
  }
}
