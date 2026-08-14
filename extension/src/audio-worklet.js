/**
 * AudioWorklet: capture mic → mono PCM16 @ target rate, emit 20–100ms chunks.
 * Loaded as a classic worklet module (not bundled into offscreen.js).
 */

class StudyPilotPcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions || {};
    this.targetRate = opts.targetSampleRate || 16000;
    this.chunkMs = Math.min(100, Math.max(20, opts.chunkMs || 40));
    this.chunkSamples = Math.round((this.targetRate * this.chunkMs) / 1000);
    this.buffer = new Float32Array(0);
    this.stopped = false;
    this.port.onmessage = (ev) => {
      if (ev.data && ev.data.type === 'stop') this.stopped = true;
    };
  }

  /**
   * Linear resample from sampleRate → targetRate.
   */
  resample(input, fromRate, toRate) {
    if (fromRate === toRate) return input;
    const ratio = fromRate / toRate;
    const outLen = Math.max(1, Math.round(input.length / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const src = i * ratio;
      const i0 = Math.floor(src);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const t = src - i0;
      out[i] = input[i0] * (1 - t) + input[i1] * t;
    }
    return out;
  }

  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    // Mixdown to mono if needed.
    const ch0 = input[0];
    let mono = ch0;
    if (input.length > 1 && input[1]) {
      mono = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) {
        let sum = 0;
        for (let c = 0; c < input.length; c++) sum += input[c][i] || 0;
        mono[i] = sum / input.length;
      }
    }

    const resampled = this.resample(mono, sampleRate, this.targetRate);
    const merged = new Float32Array(this.buffer.length + resampled.length);
    merged.set(this.buffer, 0);
    merged.set(resampled, this.buffer.length);
    this.buffer = merged;

    while (this.buffer.length >= this.chunkSamples) {
      const slice = this.buffer.subarray(0, this.chunkSamples);
      this.buffer = this.buffer.slice(this.chunkSamples);
      const pcm16 = new Int16Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        const s = Math.max(-1, Math.min(1, slice[i]));
        pcm16[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
      }
      this.port.postMessage({ type: 'chunk', pcm16: pcm16.buffer }, [pcm16.buffer]);
    }
    return true;
  }
}

registerProcessor('studypilot-pcm-capture', StudyPilotPcmCapture);
