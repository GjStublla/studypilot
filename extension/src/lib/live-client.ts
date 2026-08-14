/**
 * Gemini Live session via raw WebSocket (v1beta).
 *
 * @google/genai drops historyConfig from its setup converter; Gemini 3.1 requires
 * historyConfig.initialHistoryInClientContent before sendClientContent seeding.
 *
 * Receives bootstrap.ephemeralToken from the service worker — never from content scripts.
 */

import type { GeminiContentTurn, LiveBootstrap, TranscriptRole } from './messages';
import {
  MIC_CHUNK_MS,
  MIC_SAMPLE_RATE,
  PLAYBACK_SAMPLE_RATE,
  base64ToInt16,
  int16ToBase64,
  int16ToFloat32,
} from './pcm';

const DEFAULT_MODEL = 'gemini-3.1-flash-live-preview';
/** Ephemeral tokens work with v1beta (not v1alpha). */
const API_VERSION = 'v1beta';

const SEARCH_RUBRIC_DECL = {
  name: 'search_rubric',
  description:
    'Search the student rubric / course materials for criteria relevant to the current coaching question.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural-language search query over the rubric or notes.',
      },
    },
    required: ['query'],
  },
};

export type LiveClientCallbacks = {
  onState: (
    state: 'connecting' | 'live' | 'paused' | 'closing' | 'closed' | 'error',
    error?: string,
  ) => void;
  onTranscriptPartial: (role: TranscriptRole, text: string) => void;
  onTurnFinal: (userText: string | null, assistantText: string | null, warning?: string) => void;
  onToolCall: (callId: string, name: string, args: Record<string, unknown>) => void;
  onResumptionUpdate: (handle: string) => void;
  onGoAway: (timeLeftMs?: number) => void;
  onInterrupted: () => void;
};

export type ConnectOptions = {
  bootstrap: LiveBootstrap;
  screenshotJpegBase64?: string | null;
  /** Seed history + screenshot only on a fresh Live — never on resumption. */
  seedHistoryAndScreenshot: boolean;
  callbacks: LiveClientCallbacks;
};

export class PcmPlaybackQueue {
  private ctx: AudioContext | null = null;
  private queue: Float32Array[] = [];
  private playing = false;
  private nextTime = 0;
  /** Already-scheduled Web Audio sources — must be stopped on interrupt. */
  private activeSources = new Set<AudioBufferSourceNode>();

  async ensure(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    return this.ctx;
  }

  clear(): void {
    this.queue = [];
    this.playing = false;
    this.nextTime = 0;
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
      try {
        src.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.activeSources.clear();
  }

  async enqueueBase64Pcm16(b64: string): Promise<void> {
    const pcm = base64ToInt16(b64);
    const f32 = int16ToFloat32(pcm);
    this.queue.push(f32);
    await this.pump();
  }

  private async pump(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      const ctx = await this.ensure();
      while (this.queue.length > 0) {
        const chunk = this.queue.shift()!;
        const buffer = ctx.createBuffer(1, chunk.length, PLAYBACK_SAMPLE_RATE);
        buffer.copyToChannel(Float32Array.from(chunk), 0);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(ctx.destination);
        this.activeSources.add(src);
        src.onended = () => {
          this.activeSources.delete(src);
        };
        const startAt = Math.max(ctx.currentTime, this.nextTime);
        src.start(startAt);
        this.nextTime = startAt + buffer.duration;
      }
    } finally {
      this.playing = false;
      if (this.queue.length > 0) void this.pump();
    }
  }

  async close(): Promise<void> {
    this.clear();
    if (this.ctx) {
      await this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }
}

function modelResourceName(model: string): string {
  // Vertex publisher models are already fully qualified.
  if (model.includes('/publishers/') || model.startsWith('projects/')) {
    return model;
  }
  return model.startsWith('models/') ? model : `models/${model}`;
}

function constrainedWsUrl(apiVersion: string, token: string): string {
  const method = 'BidiGenerateContentConstrained';
  return (
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.` +
    `${apiVersion}.GenerativeService.${method}?access_token=${encodeURIComponent(token)}`
  );
}

/**
 * Vertex Live WebSocket. Browsers cannot set Authorization headers on WS, so
 * the OAuth access token is passed as access_token (same pattern as GL ephemeral).
 */
export function vertexWsUrl(websocketUrl: string, accessToken: string): string {
  const sep = websocketUrl.includes('?') ? '&' : '?';
  return `${websocketUrl}${sep}access_token=${encodeURIComponent(accessToken)}`;
}

/** Build the Live WebSocket URL from bootstrap auth fields. */
export function buildLiveWebSocketUrl(opts: {
  accessToken: string;
  authMode?: 'vertex' | 'gemini-ephemeral';
  websocketUrl?: string;
  apiVersion?: string;
}): string {
  const useVertex =
    opts.authMode === 'vertex' || Boolean(opts.websocketUrl);
  if (useVertex) {
    if (!opts.websocketUrl?.trim()) {
      throw new Error('Vertex Live requires websocketUrl from live-token');
    }
    return vertexWsUrl(opts.websocketUrl.trim(), opts.accessToken);
  }
  const apiVersion =
    typeof opts.apiVersion === 'string' && opts.apiVersion.trim()
      ? opts.apiVersion.trim()
      : 'v1beta1';
  return constrainedWsUrl(apiVersion, opts.accessToken);
}

export class LiveClient {
  private ws: WebSocket | null = null;
  private playback = new PcmPlaybackQueue();
  private micStream: MediaStream | null = null;
  private micCtx: AudioContext | null = null;
  private micNode: AudioWorkletNode | null = null;
  private paused = false;
  private closing = false;
  private setupComplete = false;
  private inputBuf = '';
  private outputBuf = '';
  private callbacks: LiveClientCallbacks | null = null;
  private seeded = false;

  get isActive(): boolean {
    return this.ws != null && this.ws.readyState === WebSocket.OPEN && !this.closing;
  }

  async connect(opts: ConnectOptions): Promise<void> {
    if (this.ws) {
      throw new Error('Live already connected in this profile — stop first');
    }

    this.closing = false;
    this.paused = false;
    this.setupComplete = false;
    this.inputBuf = '';
    this.outputBuf = '';
    this.seeded = false;
    this.callbacks = opts.callbacks;
    this.callbacks.onState('connecting');

    const token =
      (opts.bootstrap.accessToken || opts.bootstrap.ephemeralToken || '').trim();
    if (!token) {
      throw new Error('Live bootstrap missing accessToken');
    }
    const model = modelResourceName(opts.bootstrap.model || DEFAULT_MODEL);
    const apiVersion =
      typeof opts.bootstrap.apiVersion === 'string' && opts.bootstrap.apiVersion.trim()
        ? opts.bootstrap.apiVersion.trim()
        : API_VERSION;
    const url = buildLiveWebSocketUrl({
      accessToken: token,
      authMode: opts.bootstrap.authMode,
      websocketUrl: opts.bootstrap.websocketUrl,
      apiVersion,
    });

    const setup: Record<string, unknown> = {
      model,
      generationConfig: {
        responseModalities: ['AUDIO'],
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      sessionResumption: opts.bootstrap.resumptionHandle
        ? { handle: opts.bootstrap.resumptionHandle }
        : {},
      contextWindowCompression: {
        slidingWindow: {},
      },
      tools: [{ functionDeclarations: [SEARCH_RUBRIC_DECL] }],
    };

    // Only wait for clientContent history when we will seed it. On resumption,
    // do not set initialHistoryInClientContent (server would block forever).
    if (opts.seedHistoryAndScreenshot) {
      setup.historyConfig = {
        initialHistoryInClientContent: true,
      };
    }

    if (opts.bootstrap.systemInstruction) {
      setup.systemInstruction = {
        parts: [{ text: opts.bootstrap.systemInstruction }],
      };
    }

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      let settled = false;

      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve();
      };

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ setup }));
        } catch (err) {
          done(err instanceof Error ? err : new Error(String(err)));
        }
      };

      ws.onmessage = (ev) => {
        void this.onServerMessage(ev.data).then(() => {
          if (this.setupComplete) done();
        });
      };

      ws.onerror = () => {
        const message = 'Gemini Live WebSocket error';
        this.callbacks?.onState('error', message);
        done(new Error(message));
      };

      ws.onclose = () => {
        this.ws = null;
        if (!this.closing) this.callbacks?.onState('closed');
        if (!this.setupComplete) done(new Error('Live WebSocket closed before setupComplete'));
      };

      setTimeout(() => {
        if (!this.setupComplete) done(new Error('Timed out waiting for Live setupComplete'));
      }, 20_000);
    });

    if (opts.seedHistoryAndScreenshot) {
      await this.seedInitialContent(
        opts.bootstrap.initialTurns ?? [],
        opts.screenshotJpegBase64,
      );
    }

    await this.startMic();
  }

  private async seedInitialContent(
    turns: GeminiContentTurn[],
    screenshotJpegBase64?: string | null,
  ): Promise<void> {
    if (!this.ws || this.seeded) return;
    this.seeded = true;

    this.sendJson({
      clientContent: {
        turns: Array.isArray(turns) ? turns : [],
        turnComplete: true,
      },
    });

    if (screenshotJpegBase64) {
      this.sendJson({
        realtimeInput: {
          video: {
            data: screenshotJpegBase64,
            mimeType: 'image/jpeg',
          },
        },
      });
    }
  }

  private sendJson(payload: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  private async onServerMessage(raw: unknown): Promise<void> {
    let msg: Record<string, unknown>;
    try {
      const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer);
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }

    if ('setupComplete' in msg) {
      this.setupComplete = true;
      this.callbacks?.onState('live');
    }

    const sc = msg.serverContent as Record<string, unknown> | undefined;
    if (sc?.interrupted) {
      this.playback.clear();
      this.callbacks?.onInterrupted();
    }

    const inputTx = sc?.inputTranscription as { text?: string } | undefined;
    if (inputTx?.text) {
      this.inputBuf += inputTx.text;
      this.callbacks?.onTranscriptPartial('user', this.inputBuf);
    }
    const outputTx = sc?.outputTranscription as { text?: string } | undefined;
    if (outputTx?.text) {
      this.outputBuf += outputTx.text;
      this.callbacks?.onTranscriptPartial('assistant', this.outputBuf);
    }

    const modelTurn = sc?.modelTurn as { parts?: Array<Record<string, unknown>> } | undefined;
    for (const part of modelTurn?.parts ?? []) {
      const inline = part.inlineData as { data?: string } | undefined;
      if (inline?.data) await this.playback.enqueueBase64Pcm16(inline.data);
    }

    if (sc?.turnComplete) {
      const userText = this.inputBuf.trim() || null;
      const assistantText = this.outputBuf.trim() || null;
      let warning: string | undefined;
      // Postgres commit_live_turn requires BOTH sides — never claim we will commit a partial.
      if (!userText || !assistantText) {
        warning =
          !userText && !assistantText
            ? 'Transcript missing for this turn — not saved.'
            : 'Partial transcript — turn not saved (both user and assistant text are required).';
      }
      this.callbacks?.onTurnFinal(userText, assistantText, warning);
      this.inputBuf = '';
      this.outputBuf = '';
    }

    const toolCall = msg.toolCall as
      | { functionCalls?: Array<{ id?: string; name?: string; args?: Record<string, unknown> }> }
      | undefined;
    if (toolCall?.functionCalls) {
      for (const fc of toolCall.functionCalls) {
        this.callbacks?.onToolCall(
          fc.id ?? crypto.randomUUID(),
          fc.name ?? 'unknown',
          (fc.args ?? {}) as Record<string, unknown>,
        );
      }
    }

    const resumption = msg.sessionResumptionUpdate as { newHandle?: string } | undefined;
    if (resumption?.newHandle) {
      this.callbacks?.onResumptionUpdate(resumption.newHandle);
    }

    const goAway = msg.goAway as { timeLeft?: string } | undefined;
    if (goAway) {
      const ms = goAway.timeLeft ? Number.parseInt(goAway.timeLeft, 10) : undefined;
      this.callbacks?.onGoAway(Number.isFinite(ms) ? ms : undefined);
    }
  }

  sendToolResponse(
    functionResponses: Array<{ id: string; name: string; response: Record<string, unknown> }>,
  ): void {
    this.sendJson({
      toolResponse: {
        functionResponses: functionResponses.map((fr) => ({
          id: fr.id,
          name: fr.name,
          response: fr.response,
        })),
      },
    });
  }

  async pause(): Promise<void> {
    if (!this.ws || this.paused) return;
    this.paused = true;
    this.stopMicTracks();
    try {
      this.sendJson({ realtimeInput: { audioStreamEnd: true } });
    } catch {
      // ignore
    }
    this.callbacks?.onState('paused');
  }

  async resume(): Promise<void> {
    if (!this.ws || !this.paused) return;
    this.paused = false;
    await this.startMic();
    this.callbacks?.onState('live');
  }

  async disconnect(reason?: string): Promise<void> {
    this.closing = true;
    this.callbacks?.onState('closing', reason);
    this.stopMicTracks();
    await this.playback.close();
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
    this.callbacks?.onState('closed');
  }

  private stopMicTracks(): void {
    this.micNode?.port.postMessage({ type: 'stop' });
    this.micNode?.disconnect();
    this.micNode = null;
    if (this.micCtx) {
      void this.micCtx.close().catch(() => undefined);
      this.micCtx = null;
    }
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
  }

  private async startMic(): Promise<void> {
    if (this.paused || this.closing) return;

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    this.micCtx = new AudioContext({ sampleRate: MIC_SAMPLE_RATE });
    const workletUrl = chrome.runtime.getURL('audio-worklet.js');
    await this.micCtx.audioWorklet.addModule(workletUrl);

    const source = this.micCtx.createMediaStreamSource(this.micStream);
    this.micNode = new AudioWorkletNode(this.micCtx, 'studypilot-pcm-capture', {
      processorOptions: {
        targetSampleRate: MIC_SAMPLE_RATE,
        chunkMs: MIC_CHUNK_MS,
      },
    });

    this.micNode.port.onmessage = (ev: MessageEvent) => {
      if (this.paused || this.closing || !this.ws) return;
      const data = ev.data as { type?: string; pcm16?: ArrayBuffer };
      if (data.type !== 'chunk' || !data.pcm16) return;
      const pcm = new Int16Array(data.pcm16);
      try {
        this.sendJson({
          realtimeInput: {
            audio: {
              data: int16ToBase64(pcm),
              mimeType: `audio/pcm;rate=${MIC_SAMPLE_RATE}`,
            },
          },
        });
      } catch {
        // session may be closing
      }
    };

    const gain = this.micCtx.createGain();
    gain.gain.value = 0;
    source.connect(this.micNode);
    this.micNode.connect(gain);
    gain.connect(this.micCtx.destination);
  }
}
