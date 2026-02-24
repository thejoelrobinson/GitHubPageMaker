import { state } from './state';

// ── GitHub REST API wrapper ───────────────────────────────────────────

const FETCH_TIMEOUT_MS = 30_000;

interface GHErrorBody {
  message?: string;
}

export async function ghFetch<T = unknown>(
  path: string,
  options: Omit<RequestInit, 'body'> & { body?: object } = {},
): Promise<T> {
  const url = `https://api.github.com${path}`;
  const { body, ...rest } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      signal: controller.signal,
      headers: {
        Authorization:          `Bearer ${state.token}`,
        Accept:                 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type':         'application/json',
        ...(rest.headers ?? {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Request timed out (30s) — check your connection and try again');
    }
    throw e;
  }
  clearTimeout(timeoutId);

  if (!res.ok) {
    // Proactively surface rate-limit exhaustion with a reset time
    const remaining = res.headers.get('X-RateLimit-Remaining');
    const resetEpoch = res.headers.get('X-RateLimit-Reset');
    if (res.status === 403 && remaining === '0' && resetEpoch) {
      const resetTime = new Date(parseInt(resetEpoch, 10) * 1000).toLocaleTimeString();
      throw new Error(`GitHub API rate limit reached. Resets at ${resetTime}`);
    }
    const err = await res.json().catch(() => null) as GHErrorBody | null;
    throw new Error(err?.message ?? `${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

// ── Encoding helpers ──────────────────────────────────────────────────

/** UTF-8 safe encode to base64 (handles emoji and non-Latin characters correctly). */
export function encodeBase64(str: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}

/** Decode base64 from GitHub (strips whitespace added by the API). */
export function decodeBase64(b64: string): string {
  const bytes = Uint8Array.from(atob(b64.replace(/\s/g, '')), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ── High-level file operations ────────────────────────────────────────

export interface FileData {
  content: string;
  sha: string;
}

export async function readFile(path: string): Promise<FileData> {
  const data = await ghFetch<{ content: string; sha: string }>(
    `/repos/${state.owner}/${state.repo}/contents/${encodeURIComponent(path)}?ref=${state.branch}`,
  );
  return { content: decodeBase64(data.content), sha: data.sha };
}

export interface WriteResult {
  sha: string;
}

interface PutBody {
  message: string;
  content: string;
  branch: string;
  sha?: string;
}

export async function writeFile(
  path: string,
  content: string,
  message: string,
  sha?: string,
): Promise<WriteResult> {
  const body: PutBody & object = {
    message,
    content: encodeBase64(content),
    branch: state.branch,
  };
  if (sha) body.sha = sha;

  const res = await ghFetch<{ content: { sha: string } }>(
    `/repos/${state.owner}/${state.repo}/contents/${encodeURIComponent(path)}`,
    { method: 'PUT', body },
  );
  return { sha: (res.content as { sha: string }).sha };
}

export interface FetchTreeResult {
  entries: Array<{ path: string; type: string; sha: string }>;
  /** True when the repo exceeds GitHub's tree-API limit (~100 k nodes). */
  truncated: boolean;
}

export async function fetchTree(): Promise<FetchTreeResult> {
  const data = await ghFetch<{
    tree: Array<{ path: string; type: string; sha: string }>;
    truncated?: boolean;
  }>(
    `/repos/${state.owner}/${state.repo}/git/trees/${state.branch}?recursive=1`,
  );
  return { entries: data.tree ?? [], truncated: data.truncated === true };
}

export async function fetchBranches(): Promise<string[]> {
  const data = await ghFetch<Array<{ name: string }>>(
    `/repos/${state.owner}/${state.repo}/branches`,
  );
  return data.map(b => b.name);
}
