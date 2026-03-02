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
    const msg = err?.message ?? `${res.status} ${res.statusText}`;
    // Provide actionable guidance for SHA conflicts (concurrent edits)
    if (res.status === 409 || msg.toLowerCase().includes('fast forward')) {
      throw new Error(`${msg} — pull the latest changes and try again`);
    }
    throw new Error(msg);
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

/** Encode a repo path for the GitHub Contents API: encode each segment but preserve '/' separators. */
export function encodeRepoPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * File extensions that are text/Unicode-safe and should be decoded with
 * TextDecoder so the code editor sees proper Unicode strings.
 * Everything else is treated as binary and decoded with atob() so the
 * Service Worker can reconstruct exact bytes via charCodeAt().
 */
const TEXT_EXTS = new Set([
  'html','htm','css','scss','sass','less',
  'js','mjs','cjs','jsx','ts','tsx',
  'json','jsonc','json5',
  'md','mdx','txt','text',
  'yaml','yml','toml','ini','env',
  'xml','rss','atom',
  'sh','bash','zsh','fish',
  'py','rb','go','rs','java','php','c','cpp','h','swift','kt',
  'csv','tsv',
  'graphql','gql',
  'vue','svelte','astro',
]);

export function isTextPath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTS.has(ext);
}

export interface FileDataRaw {
  content: string;
  sha: string;
  isText: boolean;
}

/**
 * Read a file from the repo, handling both inline base64 (≤1 MB) and the
 * download_url fallback for larger files.  Returns the decoded content string.
 */
export async function readFileRaw(path: string): Promise<FileDataRaw> {
  const data = await ghFetch<{
    content?: string;
    sha: string;
    download_url?: string;
  }>(
    `/repos/${state.owner}/${state.repo}/contents/${encodeRepoPath(path)}?ref=${state.branch}`,
  );

  const isText = isTextPath(path);

  // Normal path: inline base64 (files ≤ 1 MB)
  if (data.content) {
    const raw = data.content.replace(/\s/g, '');
    const content = isText ? decodeBase64(raw) : atob(raw);
    return { content, sha: data.sha, isText };
  }

  // Large file: fetch raw bytes from download_url
  if (data.download_url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(data.download_url, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${state.token}` },
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`download_url failed: ${res.status}`);
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      if (isText) {
        return { content: new TextDecoder().decode(bytes), sha: data.sha, isText };
      }
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return { content: binary, sha: data.sha, isText };
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  }

  throw new Error(`No content available for ${path}`);
}

export async function readFile(path: string): Promise<FileData> {
  const { content, sha } = await readFileRaw(path);
  return { content, sha };
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
    `/repos/${state.owner}/${state.repo}/contents/${encodeRepoPath(path)}`,
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

/**
 * Upload a binary file (image, etc.) to the repository.
 * The content should be raw base64 — NOT btoa-encoded again.
 * GitHub's Contents API accepts raw base64 for binary files.
 */
export async function uploadFile(
  path: string,
  base64Content: string,
  message: string,
  existingSha?: string,
): Promise<{ sha: string }> {
  interface UploadBody { message: string; content: string; branch: string; sha?: string; }
  const body: UploadBody = { message, content: base64Content, branch: state.branch };
  if (existingSha) body.sha = existingSha;

  const res = await ghFetch<{ content: { sha: string } }>(
    `/repos/${state.owner}/${state.repo}/contents/${encodeRepoPath(path)}`,
    { method: 'PUT', body },
  );
  state.fileShas[path] = res.content.sha;
  return { sha: res.content.sha };
}

export async function fetchBranches(): Promise<string[]> {
  const data = await ghFetch<Array<{ name: string }>>(
    `/repos/${state.owner}/${state.repo}/branches`,
  );
  return data.map(b => b.name);
}

export async function getAuthenticatedUser(): Promise<{ login: string }> {
  return ghFetch<{ login: string }>('/user');
}

export async function createRepo(
  name: string,
  description: string,
  isPrivate: boolean,
): Promise<{ defaultBranch: string }> {
  const res = await ghFetch<{ default_branch: string }>(
    '/user/repos',
    { method: 'POST', body: { name, description, private: isPrivate, auto_init: true } },
  );
  return { defaultBranch: res.default_branch };
}
