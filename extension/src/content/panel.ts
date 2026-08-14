/**
 * Injected coaching panel — reconnects to offscreen Live state across tab navigations.
 * NEVER receives ephemeral tokens. Status + transcripts only.
 */

import type { PanelToSwMessage, SwToPanelMessage } from '../lib/messages';

const ROOT_ID = 'studypilot-live-root';

type UiSnapshot = {
  state: string;
  selectionFrozen: boolean;
  error: string | null;
  warning: string | null;
  fallback: string | null;
  chatId: string | null;
  rubricId: string | null;
  lines: Array<{ role: string; text: string; finalized: boolean }>;
};

const ui: UiSnapshot = {
  state: 'idle',
  selectionFrozen: false,
  error: null,
  warning: null,
  fallback: null,
  chatId: null,
  rubricId: null,
  lines: [],
};

function sendToSw(msg: PanelToSwMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(msg);
}

function ensureRoot(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('data-studypilot', 'live-panel');
  document.documentElement.appendChild(root);
  render(root);
  return root;
}

function render(root: HTMLElement): void {
  const frozen = ui.selectionFrozen;
  root.innerHTML = `
    <div class="sp-panel" role="dialog" aria-label="StudyPilot Live">
      <header class="sp-header">
        <div class="sp-brand">StudyPilot Live</div>
        <button type="button" class="sp-icon" data-action="close" aria-label="Hide panel">×</button>
      </header>
      <div class="sp-status" data-state="${escapeAttr(ui.state)}">
        <span class="sp-dot"></span>
        <span class="sp-state-label">${escapeHtml(ui.state)}</span>
      </div>
      <div class="sp-fields">
        <label>
          Chat ID
          <input data-field="chatId" value="${escapeAttr(ui.chatId ?? '')}" ${frozen ? 'disabled' : ''} placeholder="dashboard chat UUID (required)" />
        </label>
        <label>
          Rubric ID
          <input data-field="rubricId" value="${escapeAttr(ui.rubricId ?? '')}" ${frozen ? 'disabled' : ''} placeholder="optional" />
        </label>
      </div>
      <div class="sp-actions">
        <button type="button" data-action="start" ${ui.state === 'live' || ui.state === 'connecting' || ui.state === 'starting' ? 'disabled' : ''}>Start Live</button>
        <button type="button" data-action="pause" ${ui.state === 'live' ? '' : 'disabled'}>Pause</button>
        <button type="button" data-action="resume" ${ui.state === 'paused' ? '' : 'disabled'}>Resume</button>
        <button type="button" data-action="stop" ${ui.state === 'idle' || ui.state === 'stopping' ? 'disabled' : ''}>Stop</button>
      </div>
      ${ui.fallback === 'text-coaching' ? `<p class="sp-fallback">Live unavailable — use dashboard <strong>text coaching</strong> instead.</p>` : ''}
      ${ui.error ? `<p class="sp-error">${escapeHtml(ui.error)}</p>` : ''}
      ${ui.warning ? `<p class="sp-warn">${escapeHtml(ui.warning)}</p>` : ''}
      <div class="sp-transcript" aria-live="polite">
        ${ui.lines
          .slice(-40)
          .map(
            (l) =>
              `<div class="sp-line sp-${escapeAttr(l.role)}${l.finalized ? ' is-final' : ''}"><span>${escapeHtml(l.role)}</span>${escapeHtml(l.text)}</div>`,
          )
          .join('')}
      </div>
      <details class="sp-auth">
        <summary>Auth (JWT)</summary>
        <textarea data-field="jwt" rows="3" placeholder="Paste Supabase access token"></textarea>
        <button type="button" data-action="auth">Save session</button>
      </details>
    </div>
  `;

  root.querySelectorAll('[data-action]').forEach((el) => {
    el.addEventListener('click', onAction);
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

async function onAction(ev: Event): Promise<void> {
  const btn = ev.currentTarget as HTMLElement;
  const action = btn.getAttribute('data-action');
  const root = ensureRoot();

  if (action === 'close') {
    root.classList.toggle('is-hidden');
    return;
  }

  if (action === 'auth') {
    const jwt = (root.querySelector('[data-field="jwt"]') as HTMLTextAreaElement)?.value?.trim();
    if (!jwt) return;
    await sendToSw({ type: 'AUTH_SET_SESSION', accessToken: jwt });
    return;
  }

  if (action === 'start') {
    const chatId =
      (root.querySelector('[data-field="chatId"]') as HTMLInputElement)?.value?.trim() || null;
    const rubricId =
      (root.querySelector('[data-field="rubricId"]') as HTMLInputElement)?.value?.trim() || null;
    if (!ui.selectionFrozen) {
      await sendToSw({ type: 'SET_SELECTION', chatId, rubricId });
    }
    try {
      await sendToSw({ type: 'LIVE_START', chatId, rubricId, captureScreenshot: true });
    } catch (err) {
      ui.error = err instanceof Error ? err.message : String(err);
      render(root);
    }
    return;
  }

  if (action === 'pause') {
    await sendToSw({ type: 'LIVE_PAUSE' });
    return;
  }
  if (action === 'resume') {
    await sendToSw({ type: 'LIVE_RESUME' });
    return;
  }
  if (action === 'stop') {
    await sendToSw({ type: 'LIVE_STOP' });
  }
}

function applyStatus(msg: Extract<SwToPanelMessage, { type: 'LIVE_STATUS' }>): void {
  ui.state = msg.state;
  ui.selectionFrozen = msg.selectionFrozen;
  ui.error = msg.error ?? null;
  ui.warning = msg.warning ?? null;
  ui.fallback = msg.fallback ?? null;
  ui.chatId = msg.selection.chatId;
  ui.rubricId = msg.selection.rubricId;
  render(ensureRoot());
}

function onSwMessage(raw: unknown): void {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
  const msg = raw as SwToPanelMessage | { type: 'PANEL_TOGGLE' };

  if (msg.type === 'PANEL_TOGGLE') {
    ensureRoot().classList.toggle('is-hidden');
    return;
  }

  // Defense in depth: drop any accidental token fields if present.
  const unsafe = raw as Record<string, unknown>;
  if ('ephemeralToken' in unsafe || 'bootstrap' in unsafe || 'apiKey' in unsafe) {
    console.warn('[StudyPilot] Refusing message that appears to contain secrets');
    return;
  }

  if (msg.type === 'LIVE_STATUS') {
    applyStatus(msg);
    return;
  }
  if (msg.type === 'LIVE_TRANSCRIPT') {
    const last = ui.lines[ui.lines.length - 1];
    if (last && last.role === msg.role && !last.finalized && !msg.finalized) {
      last.text = msg.text;
    } else if (last && last.role === msg.role && !last.finalized && msg.finalized) {
      last.text = msg.text;
      last.finalized = true;
    } else {
      ui.lines.push({ role: msg.role, text: msg.text, finalized: msg.finalized });
    }
    render(ensureRoot());
    return;
  }
  if (msg.type === 'LIVE_WARNING') {
    ui.warning = msg.message;
    render(ensureRoot());
  }
}

function boot(): void {
  const root = ensureRoot();
  root.classList.add('is-hidden');
  chrome.runtime.onMessage.addListener((msg) => {
    onSwMessage(msg);
  });
  void sendToSw({ type: 'PANEL_HELLO' }).then((res) => {
    if (res && typeof res === 'object' && (res as SwToPanelMessage).type === 'LIVE_STATUS') {
      applyStatus(res as Extract<SwToPanelMessage, { type: 'LIVE_STATUS' }>);
      // Re-show panel if Live is already running (tab navigation reconnect).
      if (['live', 'paused', 'connecting', 'starting'].includes(ui.state)) {
        root.classList.remove('is-hidden');
      }
    }
  });
}

boot();
