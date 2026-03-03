import type { AppConfig, AppState, EditorMode, DeviceSize, Page, Theme, VisualProjectState } from './types';

// ── App (code editor) state ───────────────────────────────────────────
export const state: AppState = {
  token: '',
  owner: '',
  repo: '',
  branch: 'main',
  connected: false,
  tree: [],
  openTabs: [],
  activeTab: null,
  fileShas: {},
  branches: [],
  ollamaEnabled:    false,
  ollamaEndpoint:   'http://localhost:11434',
  ollamaModel:      'llama3.2:3b',
  browserLLMEnabled: true,
  browserLLMModel:   'onnx-community/Qwen2.5-0.5B-Instruct',
};

// ── Visual editor state ───────────────────────────────────────────────
export const DEFAULT_THEME: Theme = {
  primary:     '#0f172a',
  accent:      '#6366f1',
  text:        '#1e293b',
  textMuted:   '#64748b',
  bg:          '#ffffff',
  bgAlt:       '#f8fafc',
  headingFont: 'Inter',
  bodyFont:    'Inter',
  radius:      '8',
};

export interface VisualEditorState {
  active: boolean;
  mode: EditorMode;
  pages: Page[];
  activePage: Page | null;
  theme: Theme;
  selectedBlockId: string | null;
  device: DeviceSize;
  dirty: boolean;
  siteName: string;
  siteDesc: string;
  pendingInsertAfterId: string | null;
  pendingMediaDrop: { path: string; source: 'repo' | 'os'; base64?: string; filename?: string } | null;
  /** Assets staged locally when not connected to GitHub; uploaded on next Publish. */
  pendingUploads: Array<{ path: string; base64: string; mediaType: string }>;
}

export const visual: VisualEditorState = {
  active: false,
  mode: 'visual',
  pages: [],
  activePage: null,
  theme: { ...DEFAULT_THEME },
  selectedBlockId: null,
  device: 'desktop',
  dirty: false,
  siteName: 'My Website',
  siteDesc: '',
  pendingInsertAfterId: null,
  pendingMediaDrop: null,
  pendingUploads: [],
};

// ── Persistence ───────────────────────────────────────────────────────
const CONFIG_KEY = 'wb_config';

export function saveConfig(): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({
    token:             state.token,
    owner:             state.owner,
    repo:              state.repo,
    branch:            state.branch,
    ollamaEnabled:     state.ollamaEnabled,
    ollamaEndpoint:    state.ollamaEndpoint,
    ollamaModel:       state.ollamaModel,
    browserLLMEnabled: state.browserLLMEnabled,
    browserLLMModel:   state.browserLLMModel,
  }));
}

export function loadConfig(): AppConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as Partial<AppConfig>;
    if (cfg.token && cfg.owner && cfg.repo) {
      return {
        token:          cfg.token,
        owner:          cfg.owner,
        repo:           cfg.repo,
        branch:             cfg.branch             ?? 'main',
        ollamaEnabled:      cfg.ollamaEnabled      ?? false,
        ollamaEndpoint:     cfg.ollamaEndpoint     ?? 'http://localhost:11434',
        ollamaModel:        cfg.ollamaModel        ?? 'llama3.2:3b',
        browserLLMEnabled:  cfg.browserLLMEnabled  ?? true,
        browserLLMModel:    cfg.browserLLMModel    ?? 'onnx-community/Qwen2.5-0.5B-Instruct',
      };
    }
  } catch { /* ignore */ }
  return null;
}

/** Load AI settings (Ollama + browser LLM) — safe to call even when no GitHub config exists. */
export function loadAISettings(): {
  ollamaEnabled: boolean; ollamaEndpoint: string; ollamaModel: string;
  browserLLMEnabled: boolean; browserLLMModel: string;
} {
  const defaults = {
    ollamaEnabled:    false,
    ollamaEndpoint:   'http://localhost:11434',
    ollamaModel:      'llama3.2:3b',
    browserLLMEnabled: true,
    browserLLMModel:   'onnx-community/Qwen2.5-0.5B-Instruct',
  };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return defaults;
    const cfg = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ollamaEnabled:    cfg.ollamaEnabled    ?? false,
      ollamaEndpoint:   cfg.ollamaEndpoint   ?? 'http://localhost:11434',
      ollamaModel:      cfg.ollamaModel      ?? 'llama3.2:3b',
      browserLLMEnabled: cfg.browserLLMEnabled ?? true,
      browserLLMModel:   cfg.browserLLMModel   ?? 'onnx-community/Qwen2.5-0.5B-Instruct',
    };
  } catch { return defaults; }
}

export function toVisualProjectState(): VisualProjectState {
  return {
    version: 1,
    siteName: visual.siteName,
    siteDesc: visual.siteDesc,
    theme: { ...visual.theme },
    pages: visual.pages.map(p => ({ ...p, dirty: undefined })),
  };
}

// ── Mode persistence ──────────────────────────────────────────────────
const MODE_KEY = 'wb_last_mode';

export function saveLastMode(mode: EditorMode): void {
  localStorage.setItem(MODE_KEY, mode);
}

export function loadLastMode(): EditorMode {
  const raw = localStorage.getItem(MODE_KEY);
  return (raw === 'code' || raw === 'visual') ? raw : 'visual';
}

// ── Local draft (Save without Publish) ───────────────────────────────
//
// A "draft" stores both the visual block state AND any in-progress code
// tab edits to localStorage, keyed by repo+branch so drafts from different
// repos never collide.  Publishing to GitHub is a separate explicit action.

interface LocalDraft {
  version: 2;
  timestamp: number;
  /** toVisualProjectState() snapshot */
  visualState: VisualProjectState & {
    /** Staged assets awaiting upload (serialized alongside visual state) */
    pendingUploads?: Array<{ path: string; base64: string; mediaType: string }>;
  };
  /** Dirty code-editor tabs */
  dirtyTabs: Array<{ path: string; content: string; sha: string }>;
}

function draftKey(): string {
  if (!state.owner || !state.repo) return 'wb_draft_local_v2';
  return `wb_draft_v2_${state.owner}_${state.repo}_${state.branch}`;
}

export function saveLocalDraft(): void {
  const visualState = {
    ...toVisualProjectState(),
    ...(visual.pendingUploads.length > 0 && { pendingUploads: visual.pendingUploads }),
  };
  const draft: LocalDraft = {
    version:      2,
    timestamp:    Date.now(),
    visualState,
    dirtyTabs:    state.openTabs
      .filter(t => t.dirty && !t.isBinary)
      .map(t => ({ path: t.path, content: t.content, sha: t.sha })),
  };
  localStorage.setItem(draftKey(), JSON.stringify(draft));
}

export function loadLocalDraft(): LocalDraft | null {
  try {
    const raw = localStorage.getItem(draftKey());
    if (!raw) return null;
    const d = JSON.parse(raw) as LocalDraft;
    return d.version === 2 ? d : null;
  } catch { return null; }
}

export function clearLocalDraft(): void {
  localStorage.removeItem(draftKey());
}

export function hasDraftNewer(remoteFetchTime: number): boolean {
  const d = loadLocalDraft();
  return !!d && d.timestamp > remoteFetchTime;
}

// ── State mutation helpers ────────────────────────────────────────────
// Use these instead of the scattered triple-mutation pattern:
//   visual.dirty = true;
//   if (visual.activePage) visual.activePage.dirty = true;
//   updateVisualSaveBtn();  ← called by canvas.markDirty for canvas mutations
// External callers (pages, index, connection) should use markVisualDirty().

export function markVisualDirty(): void {
  visual.dirty = true;
  if (visual.activePage) visual.activePage.dirty = true;
}

/** Reset all visual editor state to defaults — call on logout or new connection. */
export function resetVisualState(): void {
  visual.pages           = [];
  visual.activePage      = null;
  visual.selectedBlockId = null;
  visual.dirty           = false;
  visual.active          = false;
  visual.mode            = 'visual';
  visual.pendingUploads  = [];
}

export function applyVisualProjectState(data: VisualProjectState): void {
  visual.siteName = data.siteName ?? 'My Website';
  visual.siteDesc = data.siteDesc ?? '';
  visual.theme    = { ...DEFAULT_THEME, ...data.theme };
  visual.pages    = (data.pages ?? [])
    .filter((p): p is typeof p =>
      !!p &&
      typeof p === 'object' &&
      typeof (p as { path?: unknown }).path === 'string' &&
      ((p as { path: string }).path).length > 0 &&
      Array.isArray((p as { blocks?: unknown }).blocks),
    )
    .map(p => ({ ...p, dirty: false }));
}
