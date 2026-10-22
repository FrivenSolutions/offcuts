export interface Fragment {
  id?: number;
  title: string;
  comment: string;
  code: string;
}

interface SnippetBase {
  id: number;
  title: string;
  description: string;
  source: string;
  language: string;
  isPublic: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SnippetSummary extends SnippetBase {
  fragmentTitles: string[];
  preview: string;
  previewTruncated: boolean;
}

export interface Snippet extends SnippetBase {
  fragments: Fragment[];
}

export interface SnippetInput {
  title: string;
  description: string;
  source: string;
  language: string;
  isPublic: boolean;
  tags: string[];
  fragments: Fragment[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface AuthStatus {
  setupRequired: boolean;
  stage: "enroll" | "totp" | "full" | null;
  username?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-Offcuts": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

/** Shows a URL as a link. Shows other text as plain text. */
export function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}
