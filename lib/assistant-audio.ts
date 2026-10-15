/** Encode the worklet's mono 16 kHz PCM as a bounded, uncompressed WAV. */
export function pcmWav(pcm: Int16Array): ArrayBuffer {
  if (pcm.length < 1600 || pcm.length > 16_000 * 20)
    throw new Error("Invalid utterance length");
  const result = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(result);
  const word = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  word(0, "RIFF"); view.setUint32(4, result.byteLength - 8, true);
  word(8, "WAVE"); word(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, "data"); view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i], true);
  return result;
}
