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

// ---------- Scroll position ----------

const SCROLL_KEY = "offcuts-browse-scroll";
let lastScroll: { search: string; y: number } | null = null;

/** Pass as Link state to return to the saved scroll position. */
export const RESTORE_SCROLL = { restoreScroll: true };

export function saveBrowseScroll(search: string, y: number): void {
  lastScroll = { search, y };
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(lastScroll));
  } catch {
    // Storage can be blocked. The value in memory still works until a reload.
  }
}

/** Returns the saved scroll position when it belongs to the same filters. */
export function readBrowseScroll(search: string): number | null {
  let saved = lastScroll;
  try {
    saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) ?? "null") ?? lastScroll;
  } catch {
    // Use the value in memory.
  }
  return saved && saved.search === search && typeof saved.y === "number" ? saved.y : null;
}
