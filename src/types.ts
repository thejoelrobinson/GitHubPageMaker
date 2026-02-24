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
  content: string;
  sha: string;
  dirty: boolean;
  language: string;
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
