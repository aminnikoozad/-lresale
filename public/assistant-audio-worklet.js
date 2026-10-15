// Audio never goes to browser speech-recognition services. Only bounded PCM
// utterances are sent to our own same-origin transport after explicit mic start.
class RewearAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = [];
    this.fraction = 0;
    this.sum = 0;
    this.count = 0;
    this.pre = [];
    this.speech = [];
    this.quiet = 0;
    this.loud = 0;
    this.active = false;
  }
  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input) return true;
    for (const value of input) {
      this.sum += value;
      this.count++;
      this.fraction += 16000;
      if (this.fraction < sampleRate) continue;
      this.fraction -= sampleRate;
      this.frame.push(this.sum / this.count);
      this.sum = 0; this.count = 0;
      if (this.frame.length === 320) {
        this.detect(this.frame);
        this.frame = [];
      }
    }
    return true;
  }
  detect(frame) {
    const energy = Math.sqrt(frame.reduce((n, x) => n + x * x, 0) / frame.length);
    const speaking = energy > 0.018;
    if (!this.active) {
      this.pre.push(frame);
      if (this.pre.length > 10) this.pre.shift();
      this.loud = speaking ? this.loud + 1 : 0;
      if (this.loud < 3) return;
      this.active = true;
      this.speech = this.pre;
      this.pre = [];
      this.quiet = 0;
      this.port.postMessage({ type: "speech_start" });
      return;
    }
    this.speech.push(frame);
    this.quiet = speaking ? 0 : this.quiet + 1;
    if (this.quiet < 35 && this.speech.length < 950) return;
    if (this.speech.length - this.quiet >= 12) {
      const pcm = new Int16Array(this.speech.length * 320);
      let i = 0;
      for (const part of this.speech)
        for (const value of part) pcm[i++] = Math.round(Math.max(-1, Math.min(1, value)) * 32767);
      this.port.postMessage({ type: "utterance", pcm: pcm.buffer }, [pcm.buffer]);
    }
    this.active = false; this.speech = []; this.loud = 0; this.quiet = 0;
  }
}
registerProcessor("rewear-audio", RewearAudioProcessor);
