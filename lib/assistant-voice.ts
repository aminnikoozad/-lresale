import { pcmWav } from "./assistant-audio";

export class SelfHostedVoice {
  readonly audio = { muted: false };
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private closed = false;
  private generation = 0;
  private output: AudioBufferSourceNode | null = null;
  private transcription: AbortController | null = null;
  private synthesis: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private options: {
    language: "en" | "fr";
    onTranscript: (text: string) => void;
    onInterrupt: () => void;
    onError: () => void;
    onTimeout: () => void;
  }) {}
  async start() {
    // Resume synchronously from the mic gesture, including Safari/iOS.
    this.context = new AudioContext();
    const resumed = this.context.resume();
    const health = await fetch("/api/assistant/audio", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "health" }),
    });
    if (!health.ok) throw new Error("Voice server unavailable");
    if (this.closed) return;
    await resumed;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    if (this.closed) { stream.getTracks().forEach((t) => t.stop()); return; }
    this.stream = stream;
    await this.context.audioWorklet.addModule("/assistant-audio-worklet.js");
    if (this.closed) return;
    this.source = this.context.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(this.context, "shikimomo-audio");
    this.node.port.onmessage = (event) => {
      if (this.closed) return;
      if (event.data.type === "speech_start") {
        this.transcription?.abort(); this.interrupt(); this.options.onInterrupt();
      }
      if (event.data.type === "utterance")
        void this.transcribe(new Int16Array(event.data.pcm));
    };
    this.source.connect(this.node);
    // The worklet outputs silence. Connecting keeps processing active on Safari.
    this.node.connect(this.context.destination);
    this.timer = setTimeout(() => { this.stop(); this.options.onTimeout(); }, 600000);
  }
  private async transcribe(pcm: Int16Array) {
    this.transcription?.abort();
    const abort = new AbortController();
    this.transcription = abort;
    try {
      const body = new FormData();
      body.set("audio", new Blob([pcmWav(pcm)], { type: "audio/wav" }), "utterance.wav");
      body.set("language", this.options.language);
      const response = await fetch("/api/assistant/audio", { method: "POST", body, signal: abort.signal });
      if (!response.ok) throw new Error("Transcription failed");
      const result = await response.json();
      if (!this.closed && !abort.signal.aborted && typeof result.text === "string" && result.text.trim())
        this.options.onTranscript(result.text.trim());
    } catch {
      if (!this.closed && !abort.signal.aborted) this.options.onError();
    }
  }
  interrupt() {
    this.generation++;
    this.synthesis?.abort(); this.output?.stop(); this.output = null;
  }
  async speak(text: string) {
    this.interrupt();
    if (this.closed || this.audio.muted) return;
    const generation = this.generation;
    const abort = new AbortController(); this.synthesis = abort;
    try {
      const response = await fetch("/api/assistant/audio", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "synthesize", text: text.slice(0, 1200), language: this.options.language }),
        signal: abort.signal,
      });
      if (!response.ok) throw new Error("Speech failed");
      const bytes = await response.arrayBuffer();
      if (this.closed || generation !== this.generation || !this.context) return;
      const buffer = await this.context.decodeAudioData(bytes);
      if (this.closed || generation !== this.generation) return;
      const output = this.context.createBufferSource();
      output.buffer = buffer; output.connect(this.context.destination);
      this.output = output; output.start();
    } catch {
      if (!this.closed && !abort.signal.aborted) this.options.onError();
    }
  }
  stop() {
    this.closed = true; this.interrupt(); this.transcription?.abort();
    if (this.timer) clearTimeout(this.timer);
    this.node?.disconnect(); this.source?.disconnect();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.context?.close().catch(() => {});
  }
}
