// ── Shared application types ──────────────────────────────────────────

export interface Theme {
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  bg: string;
  bgAlt: string;
  headingFont: string;
  bodyFont: string;
  radius: string;
}

export type NavLink = { text: string; href: string };

// Loose typed content bag — fields vary per block type
export type BlockContent = Record<string, string | boolean | number | NavLink[]>;
export type BlockSettings = Record<string, string | boolean | number>;

export interface Block {
  id: string;
  type: string;
  content: BlockContent;
  settings: BlockSettings;
  /** Setting keys (e.g. "logoColor") explicitly unlinked from the global theme.
   *  Unlinked settings are skipped when a Look is applied. */
  unlinked?: string[];
}

export interface Page {
  id: string;
  path: string;      // e.g. "index.html" or "about.html" or "blog/index.html"
  title: string;
  isHome: boolean;
  description: string;
  blocks: Block[];
  dirty?: boolean;   // has unsaved changes (runtime only)
  /** Original <head> inner HTML preserved when converting raw HTML to blocks.
   *  When set, publish uses this instead of the theme-generated head so the
   *  user's custom CSS links, meta tags, etc. survive intact. */
  preservedHead?: string;
  /** AI-generated premium HTML for the whole page.
   *  When set, generatePageHTML returns this verbatim (no blocks needed). */
  rawHtml?: string;
  /** Inline <style> content extracted from <head> when converting raw HTML to blocks.
   *  Re-injected into <head> at publish time so the page renders identically. */
  customCss?: string;
}

export interface VisualProjectState {
  version: number;
  siteName: string;
  siteDesc: string;
  theme: Theme;
  pages: Page[];
}

export interface Tab {
  path: string;
  content: string;       // text content OR raw base64 for binary
  sha: string;
  dirty: boolean;
  language: string;
  isBinary?: boolean;    // true = content is raw base64
  isLocalImport?: boolean; // true = file imported from local device
}

export interface TreeItem {
  path: string;
  type: string;
  sha: string;
}

export interface AppConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  ollamaEnabled:    boolean;
  ollamaEndpoint:   string;
  ollamaModel:      string;
  browserLLMEnabled: boolean;
  browserLLMModel:   string;
  geminiApiKey: string;  // API key from aistudio.google.com/apikey
}

export interface AppState extends AppConfig {
  connected: boolean;
  tree: TreeItem[];
  openTabs: Tab[];
  activeTab: string | null;
  fileShas: Record<string, string>;
  branches: string[];
}

export type DeviceSize = 'desktop' | 'tablet' | 'mobile';
export type EditorMode = 'code' | 'visual';

/** Credentials for a GitHub API call — optional override for global state. */
export interface GitHubContext {
  token:  string;
  owner:  string;
  repo:   string;
  branch: string;
}
