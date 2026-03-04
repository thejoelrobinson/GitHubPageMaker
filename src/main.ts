import './monaco-env'; // Must be first — sets MonacoEnvironment before any monaco import
import './styles.css';
import { state, visual, loadConfig, loadLocalDraft, saveLastMode, loadLastMode, saveConfig, loadAISettings } from './state';
import { registerPreviewSW } from './preview-sw-client';
import { performLocalSave } from './draft';
import { revertToBlocks } from './visual/canvas';
import { switchSidebarPanel } from './visual/index';
import { fetchTree } from './github';
import { cacheTreeShas } from './utils';
import { notify } from './ui/notifications';
import {
  initMonaco, refreshTree,
  collapseAll, openCommitModal, pushChanges, searchFiles, pullRepo, newFile,
} from './code-editor';
import {
  enterVisualMode, enterCodeMode,
  openVisualCommitModal, pushVisualChanges,
} from './visual/index';
import { confirmAddPage, showAddPageForm } from './visual/pages';
import { closeSectionPicker } from './visual/canvas';
import { debounce } from './utils';
import { cancelSync } from './repo-cache';
import {
  connectRepo, createAndConnectRepo, logout, openLogoutModal,
  showWelcomeOverlay, hideWelcomeOverlay, showConnectedUI, runBackgroundSync,
  startLocally,
} from './connection';
import { openBranchPicker, renderBranchList } from './branch-picker';
import { closeModal, switchModalTab, openSettings } from './modal';
import { detectOllama } from './visual/llm-validator';
import { initBrowserLLM, resetBrowserLLM, DEFAULT_BROWSER_MODEL, type BrowserLLMProgress } from './visual/browser-llm';
import { verifyGeminiKey } from './visual/cloud-llm';
import { updateAiChip } from './visual/asset-wizard';

// ── Panel switching — delegates to the shared switchSidebarPanel ───────

function togglePanel(name: string): void {
  switchSidebarPanel(name as 'pages' | 'explorer' | 'search' | 'css' | 'blocks');
}

// ── Init ───────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  initMonaco();
  bindEventListeners();

  const cfg = loadConfig();
  if (cfg) {
    state.token          = cfg.token;
    state.owner          = cfg.owner;
    state.repo           = cfg.repo;
    state.branch         = cfg.branch;
    state.ollamaEnabled  = cfg.ollamaEnabled  ?? false;
    state.ollamaEndpoint = cfg.ollamaEndpoint ?? 'http://localhost:11434';
    state.ollamaModel    = cfg.ollamaModel    ?? 'llama3.2:3b';
    state.geminiApiKey = cfg.geminiApiKey ?? '';
    try {
      const { entries: treeEntries, truncated: treeT } = await fetchTree();
      state.tree = treeEntries.filter(f => f.type === 'blob');
      if (treeT) notify('File tree is incomplete — repo exceeds GitHub\'s limit. Some files may not appear.', 'warning');
      cacheTreeShas(state.tree, state.fileShas);
      state.connected = true;
      showConnectedUI();
      hideWelcomeOverlay();

      // Background sync — only downloads files whose SHA changed since last session
      runBackgroundSync();

      const lastMode = loadLastMode();
      if (lastMode === 'code') {
        enterCodeMode();
      } else {
        await enterVisualMode();
      }
    } catch (e) {
      console.warn('Auto-connect failed:', e);
      showWelcomeOverlay({ staleRepo: `${cfg.owner}/${cfg.repo}` });
    }
  } else {
    // No GitHub config — still load AI settings if previously saved
    const aiCfg = loadAISettings();
    state.ollamaEnabled     = aiCfg.ollamaEnabled;
    state.ollamaEndpoint    = aiCfg.ollamaEndpoint;
    state.ollamaModel       = aiCfg.ollamaModel;
    state.browserLLMEnabled = aiCfg.browserLLMEnabled;
    state.browserLLMModel   = aiCfg.browserLLMModel;
    state.geminiApiKey = aiCfg.geminiApiKey;

    // Check for a local draft from a previous no-GitHub session
    const localDraft = loadLocalDraft();
    const hasLocalWork = localDraft && (localDraft.visualState.pages ?? []).some(
      (p: { blocks?: unknown[] }) => (p.blocks?.length ?? 0) > 0,
    );
    if (hasLocalWork) {
      // Auto-resume local session without showing the welcome overlay
      hideWelcomeOverlay();
      await enterVisualMode();
    } else {
      showWelcomeOverlay();
    }
  }
}

// ── Event listeners ────────────────────────────────────────────────────

function bindEventListeners(): void {
  // Settings
  document.getElementById('connect-btn')?.addEventListener('click', connectRepo);
  document.getElementById('create-repo-btn')?.addEventListener('click', createAndConnectRepo);
  document.getElementById('tab-connect')?.addEventListener('click', () => switchModalTab('connect'));
  document.getElementById('tab-create')?.addEventListener('click', () => switchModalTab('create'));
  document.getElementById('tab-ai')?.addEventListener('click', () => switchModalTab('ai'));

  document.getElementById('btn-save-ai-settings')?.addEventListener('click', () => {
    const prevModel = state.browserLLMModel;
    // Gemini
    state.geminiApiKey = (document.getElementById('input-gemini-api-key') as HTMLInputElement).value.trim();
    // Browser LLM
    state.browserLLMEnabled = (document.getElementById('input-browser-llm-enabled') as HTMLInputElement).checked;
    state.browserLLMModel   = (document.getElementById('input-browser-llm-model')   as HTMLSelectElement).value || DEFAULT_BROWSER_MODEL;
    // Ollama
    state.ollamaEnabled  = (document.getElementById('input-ollama-enabled')  as HTMLInputElement).checked;
    state.ollamaEndpoint = (document.getElementById('input-ollama-endpoint') as HTMLInputElement).value.trim() || 'http://localhost:11434';
    state.ollamaModel    = (document.getElementById('input-ollama-model')    as HTMLInputElement).value.trim() || 'llama3.2:3b';
    saveConfig();
    closeModal('settings-modal');
    notify('AI settings saved', 'success');
    updateAiChip();
    // Re-download browser LLM if model changed
    if (state.browserLLMEnabled) {
      if (state.browserLLMModel !== prevModel) resetBrowserLLM();
      initBrowserLLM(state.browserLLMModel, updateAIModelStatus)
        .catch(() => { /* handled */ });
    }
  });

  document.getElementById('btn-verify-gemini')?.addEventListener('click', async () => {
    const key      = (document.getElementById('input-gemini-api-key') as HTMLInputElement).value.trim();
    const statusEl = document.getElementById('gemini-verify-status');
    if (!key) { if (statusEl) statusEl.textContent = 'Paste your API key first'; return; }
    if (statusEl) statusEl.textContent = 'Verifying…';
    const result = await verifyGeminiKey(key);
    if (statusEl) statusEl.textContent = result.message;
    if (result.ok) updateAiChip();
  });

  document.getElementById('btn-test-ollama')?.addEventListener('click', async () => {
    const endpoint = (document.getElementById('input-ollama-endpoint') as HTMLInputElement).value.trim() || 'http://localhost:11434';
    const statusEl = document.getElementById('ollama-probe-status');
    if (statusEl) statusEl.textContent = 'Testing…';
    const result = await detectOllama(endpoint);
    if (statusEl) {
      statusEl.textContent = result.available
        ? `✓ Connected — models: ${result.models.slice(0, 4).join(', ') || '(none pulled yet)'}`
        : '✗ Could not connect. Is Ollama running with OLLAMA_ORIGINS=* ?';
    }
  });
  document.getElementById('repo-select')?.addEventListener('click', () => openSettings());
  document.getElementById('overlay-connect-btn')?.addEventListener('click', () => openSettings('connect'));
  document.getElementById('overlay-create-btn')?.addEventListener('click', () => openSettings('create'));
  document.getElementById('overlay-import-btn')?.addEventListener('click', () => startLocally('import'));
  document.getElementById('overlay-template-btn')?.addEventListener('click', () => startLocally('template'));
  document.getElementById('overlay-blank-btn')?.addEventListener('click', () => startLocally('blank'));

  // Mode toggle — async because enterVisualMode may fetch from GitHub
  document.getElementById('mode-vis-btn')?.addEventListener('click', async () => {
    if (visual.mode !== 'visual') {
      await enterVisualMode();
      saveLastMode('visual');
    }
  });
  document.getElementById('mode-code-btn')?.addEventListener('click', () => {
    if (visual.mode !== 'code') {
      enterCodeMode();
      saveLastMode('code');
    }
  });

  // markUnsaved for code mode is wired in code-editor.ts via onDidChangeModelContent

  // Titlebar action buttons
  document.getElementById('pull-btn')?.addEventListener('click', pullRepo);
  document.getElementById('action-download-btn')?.addEventListener('click', () => {
    import('./download').then(m => m.downloadSiteZip());
  });
  document.getElementById('action-save-btn')?.addEventListener('click', performLocalSave);
  document.getElementById('action-push-btn')?.addEventListener('click', () => {
    if (visual.mode === 'code') openCommitModal();
    else openVisualCommitModal();
  });
  document.getElementById('branch-badge')?.addEventListener('click', openBranchPicker);
  document.getElementById('status-branch')?.addEventListener('click', openBranchPicker);

  // Push/commit confirm
  document.getElementById('push-btn')?.addEventListener('click', pushChanges);
  document.getElementById('vis-push-btn')?.addEventListener('click', pushVisualChanges);
  document.getElementById('commit-message')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') pushChanges();
  });
  document.getElementById('vis-commit-msg')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') pushVisualChanges();
  });

  // File tree
  document.getElementById('btn-refresh-tree')?.addEventListener('click', refreshTree);
  document.getElementById('btn-collapse-tree')?.addEventListener('click', collapseAll);

  // Activity bar (code mode only)
  document.getElementById('act-explorer')?.addEventListener('click', () => togglePanel('explorer'));
  document.getElementById('act-search')?.addEventListener('click',   () => togglePanel('search'));
  document.getElementById('act-settings')?.addEventListener('click', () => openSettings());
  document.getElementById('act-logout')?.addEventListener('click', openLogoutModal);
  document.getElementById('confirm-logout-btn')?.addEventListener('click', logout);
  // Visual sidebar footer buttons (visual mode only — mirror the activity bar functions)
  document.getElementById('vis-settings-btn')?.addEventListener('click', () => openSettings());
  document.getElementById('vis-logout-btn')?.addEventListener('click', openLogoutModal);
  document.getElementById('vis-pages-tab')?.addEventListener('click', () => switchSidebarPanel('pages'));
  document.getElementById('vis-files-tab')?.addEventListener('click', () => switchSidebarPanel('explorer'));
  document.getElementById('vis-blocks-tab')?.addEventListener('click', () => switchSidebarPanel('blocks'));

  // Search — debounced
  const debouncedSearch = debounce((q: unknown) => searchFiles(q as string), 200);
  document.getElementById('search-input')?.addEventListener('input', e => {
    debouncedSearch((e.target as HTMLInputElement).value);
  });

  // Branch filter
  document.getElementById('branch-search')?.addEventListener('input', e => {
    const q = (e.target as HTMLInputElement).value.toLowerCase();
    renderBranchList(state.branches.filter(b => b.toLowerCase().includes(q)));
  });

  // Visual editor section/page management
  document.getElementById('vis-add-section-btn')?.addEventListener('click', () => {
    import('./visual/canvas').then(({ openSectionPicker }) => openSectionPicker(null));
  });
  document.getElementById('btn-confirm-add-page')?.addEventListener('click', confirmAddPage);
  document.getElementById('btn-add-page-blank')?.addEventListener('click', showAddPageForm);
  document.getElementById('btn-add-page-template')?.addEventListener('click', () => {
    closeModal('add-page-modal');
    import('./visual/index').then(({ switchSidebarPanel: _ }) => {});
    import('./visual/templates').then(({ showTemplateGallery }) => showTemplateGallery());
  });
  document.getElementById('btn-add-page-assets')?.addEventListener('click', () => {
    closeModal('add-page-modal');
    import('./visual/asset-wizard').then(({ openAssetWizard }) => openAssetWizard());
  });
  document.getElementById('btn-close-picker')?.addEventListener('click', closeSectionPicker);
  document.getElementById('btn-revert-to-blocks')?.addEventListener('click', () => {
    if (confirm('Discard all manual HTML edits to this page and restore the visual block editor?\n\nThis cannot be undone.')) {
      revertToBlocks();
    }
  });

  // New file (code mode)
  document.getElementById('btn-new-file')?.addEventListener('click', newFile);

  // File import
  document.getElementById('btn-import-files')?.addEventListener('click', () => {
    import('./file-import').then(m => m.openImportDialog());
  });
  document.getElementById('file-import-input')?.addEventListener('change', () => {
    import('./file-import').then(m => m.onFilesSelected());
  });
  document.getElementById('btn-confirm-import')?.addEventListener('click', () => {
    import('./file-import').then(m => m.confirmImport());
  });

  // Sync progress cancel
  document.getElementById('sync-progress-cancel')?.addEventListener('click', cancelSync);

  // Modal backdrops + data-modal-close buttons — single delegated listener
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;

    if (target.classList.contains('modal-backdrop')) {
      target.classList.add('hidden');
      return;
    }

    const closeBtn = target.closest('[data-modal-close]') as HTMLElement | null;
    if (closeBtn) {
      closeBtn.closest('.modal-backdrop')?.classList.add('hidden');
    }
  });

  // Keyboard
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(el =>
        el.classList.add('hidden'),
      );
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      if (visual.mode === 'code') {
        togglePanel('search');
        setTimeout(() => (document.getElementById('search-input') as HTMLInputElement)?.focus(), 50);
      }
    }
  });
}

// ── AI model status bar helper ─────────────────────────────────────────

function updateAIModelStatus(progress: BrowserLLMProgress): void {
  const el   = document.getElementById('status-ai');
  const text = document.getElementById('status-ai-text');
  if (!el || !text) return;
  if (progress.status === 'downloading') {
    el.style.display = '';
    text.textContent = `✦ AI ${progress.progress ?? 0}%`;
  } else if (progress.status === 'ready') {
    el.style.display = '';
    text.textContent = '✦ AI ready';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
    updateAiChip();
  } else {
    el.style.display = 'none';
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────
// Register the preview service worker first so it's active before the
// visual canvas tries to load any pages through /preview/*.
registerPreviewSW().then(() =>
  init().then(() => {
    // Auto-download browser LLM in the background after the app is ready.
    if (state.browserLLMEnabled) {
      initBrowserLLM(state.browserLLMModel || DEFAULT_BROWSER_MODEL, updateAIModelStatus)
        .catch(() => { /* already handled inside initBrowserLLM */ });
    }
  }),
);
