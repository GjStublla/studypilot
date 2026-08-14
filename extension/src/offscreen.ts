/**
 * Offscreen Live state machine — one per browser profile.
 * Receives bootstrap (incl. ephemeral token) ONLY from the service worker.
 */

import { LiveClient } from './lib/live-client';
import type { OffscreenToSwMessage, SwToOffscreenMessage } from './lib/messages';

const client = new LiveClient();

function send(msg: OffscreenToSwMessage): void {
  void chrome.runtime.sendMessage(msg);
}

function wireCallbacks(): void {
  // callbacks set per connect
}

async function handleConnect(msg: Extract<SwToOffscreenMessage, { type: 'OFFSCREEN_CONNECT' }>) {
  if (client.isActive) {
    send({
      type: 'LIVE_CONNECT_FAILED',
      message: 'Live already active in this profile. Stop the current session first.',
    });
    return;
  }

  try {
    await client.connect({
      bootstrap: msg.bootstrap,
      screenshotJpegBase64: msg.screenshotJpegBase64,
      seedHistoryAndScreenshot: msg.seedHistoryAndScreenshot,
      callbacks: {
        onState: (state, error) => {
          send({ type: 'LIVE_MACHINE_STATE', state, error });
        },
        onTranscriptPartial: (role, text) => {
          send({ type: 'LIVE_TRANSCRIPT_PARTIAL', role, text });
        },
        onTurnFinal: (userText, assistantText, warning) => {
          send({ type: 'LIVE_TURN_FINAL', userText, assistantText, warning });
        },
        onToolCall: (callId, name, args) => {
          send({ type: 'LIVE_TOOL_CALL', callId, name, args });
        },
        onResumptionUpdate: (handle) => {
          send({ type: 'LIVE_RESUMPTION_UPDATE', handle });
        },
        onGoAway: (timeLeftMs) => {
          send({ type: 'LIVE_GO_AWAY', timeLeftMs });
        },
        onInterrupted: () => {
          send({ type: 'LIVE_INTERRUPTED' });
        },
      },
    });
  } catch (err) {
    send({
      type: 'LIVE_CONNECT_FAILED',
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) return;
  const msg = raw as SwToOffscreenMessage;
  if (typeof msg.type !== 'string' || !msg.type.startsWith('OFFSCREEN_')) {
    // Ignore panel broadcasts / status fan-out.
    return;
  }

  void (async () => {
    switch (msg.type) {
      case 'OFFSCREEN_PING':
        send({ type: 'OFFSCREEN_PONG' });
        sendResponse({ ok: true });
        break;
      case 'OFFSCREEN_CONNECT':
        await handleConnect(msg);
        sendResponse({ ok: true });
        break;
      case 'OFFSCREEN_DISCONNECT':
        await client.disconnect(msg.reason);
        sendResponse({ ok: true });
        break;
      case 'OFFSCREEN_PAUSE':
        await client.pause();
        sendResponse({ ok: true });
        break;
      case 'OFFSCREEN_RESUME':
        await client.resume();
        sendResponse({ ok: true });
        break;
      case 'OFFSCREEN_TOOL_RESPONSE':
        client.sendToolResponse(msg.functionResponses);
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ ok: false });
    }
  })();

  return true;
});

wireCallbacks();
send({ type: 'OFFSCREEN_READY' });
