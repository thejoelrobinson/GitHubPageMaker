import { state } from './state';
import { getBrowserLLMStatus } from './visual/browser-llm';
import { isGeminiReady } from './visual/cloud-llm';

// ── Modal helpers ──────────────────────────────────────────────────────

export function openModal(id: string): void  { document.getElementById(id)?.classList.remove('hidden'); }
export function closeModal(id: string): void { document.getElementById(id)?.classList.add('hidden'); }

export function switchModalTab(tab: 'connect' | 'create' | 'ai'): void {
  const sections: Record<string, string> = {
    connect: 'modal-connect-section',
    create:  'modal-create-section',
    ai:      'modal-ai-section',
  };
  for (const [key, id] of Object.entries(sections)) {
    const el = document.getElementById(id) as HTMLElement | null;
    if (el) el.style.display = key === tab ? 'block' : 'none';
  }
  // GitHub token field is irrelevant on the AI tab
  const tokenGroup = document.getElementById('modal-token-group') as HTMLElement | null;
  if (tokenGroup) tokenGroup.style.display = tab === 'ai' ? 'none' : '';
  document.getElementById('tab-connect')?.classList.toggle('active', tab === 'connect');
  document.getElementById('tab-create')?.classList.toggle('active',  tab === 'create');
  document.getElementById('tab-ai')?.classList.toggle('active',      tab === 'ai');
}

export function openSettings(tab: 'connect' | 'create' | 'ai' = 'connect'): void {
  (document.getElementById('input-token')  as HTMLInputElement).value = state.token;
  (document.getElementById('input-owner')  as HTMLInputElement).value = state.owner;
  (document.getElementById('input-repo')   as HTMLInputElement).value = state.repo;
  (document.getElementById('input-branch') as HTMLInputElement).value = state.branch;

  if (tab === 'ai') {
    // Gemini
    (document.getElementById('input-gemini-api-key') as HTMLInputElement).value = state.geminiApiKey;
    const verifyEl = document.getElementById('gemini-verify-status');
    if (verifyEl) verifyEl.textContent = isGeminiReady() ? '✓ API key configured' : '';

    // Browser LLM
    (document.getElementById('input-browser-llm-enabled') as HTMLInputElement).checked = state.browserLLMEnabled;
    (document.getElementById('input-browser-llm-model')   as HTMLSelectElement).value  = state.browserLLMModel;
    const llmStatus = getBrowserLLMStatus();
    const llmStatusEl = document.getElementById('browser-llm-modal-status');
    if (llmStatusEl) {
      llmStatusEl.textContent = llmStatus === 'ready'       ? '✓ Model ready'
                              : llmStatus === 'downloading' ? '⟳ Downloading…'
                              : llmStatus === 'error'       ? '✗ Failed to load'
                              : '';
    }

    // Ollama
    (document.getElementById('input-ollama-enabled')  as HTMLInputElement).checked = state.ollamaEnabled;
    (document.getElementById('input-ollama-endpoint') as HTMLInputElement).value   = state.ollamaEndpoint;
    (document.getElementById('input-ollama-model')    as HTMLInputElement).value   = state.ollamaModel;
    const probeEl = document.getElementById('ollama-probe-status');
    if (probeEl) probeEl.textContent = '';
  }

  switchModalTab(tab);
  openModal('settings-modal');
}
