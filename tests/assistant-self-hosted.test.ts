import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { assistantHostConfig } from "../lib/assistant-host.ts";
import { pcmWav } from "../lib/assistant-audio.ts";

test("local inference requires a fixed HTTPS host and a private server token", () => {
  const token = "x".repeat(48);
  for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com/other", "https://example.com/?upstream=evil", "not-a-url"])
    assert.equal(assistantHostConfig({ SELF_HOSTED_AI_URL: url, SELF_HOSTED_AI_TOKEN: token }), null);
  assert.equal(assistantHostConfig({ OPENAI_API_KEY: token }), null);
  assert.deepEqual(assistantHostConfig({ SELF_HOSTED_AI_URL: "https://ai.example.com", SELF_HOSTED_AI_TOKEN: token }), { url: "https://ai.example.com", token });
});

test("voice encodes actual PCM16 little-endian and refuses oversized utterances", () => {
  const pcm = new Int16Array(3200); pcm[0] = -123; pcm[1] = 456;
  const wav = new DataView(pcmWav(pcm));
  assert.equal(wav.getUint32(24, true), 16000);
  assert.equal(wav.getUint16(22, true), 1);
  assert.equal(wav.getInt16(44, true), -123);
  assert.equal(wav.getInt16(46, true), 456);
  assert.equal(wav.getUint32(40, true), 6400);
  assert.throws(() => pcmWav(new Int16Array(16_000 * 21)));
});

test("continuous voice detects an utterance after silence and down-samples 48 kHz", () => {
  const events: { type: string; pcm?: ArrayBuffer }[] = [];
  let Processor: new () => { process(inputs: Float32Array[][]): boolean };
  vm.runInNewContext(readFileSync(new URL("../public/assistant-audio-worklet.js", import.meta.url), "utf8"), {
    sampleRate: 48000,
    AudioWorkletProcessor: class { port = { postMessage: (event: { type: string; pcm?: ArrayBuffer }) => events.push(event) }; },
    registerProcessor: (_: string, value: typeof Processor) => { Processor = value; },
  });
  const processor = new Processor!();
  const block = new Float32Array(960);
  for (let i = 0; i < 25; i++) { block.fill(i % 2 ? 0.08 : -0.08); processor.process([[block]]); }
  block.fill(0);
  for (let i = 0; i < 40; i++) processor.process([[block]]);
  assert.equal(events.filter((e) => e.type === "speech_start").length, 1);
  const utterances = events.filter((e) => e.type === "utterance");
  assert.equal(utterances.length, 1);
  assert.ok(utterances[0].pcm!.byteLength > 16000);
  assert.ok(utterances[0].pcm!.byteLength < 64000);
});


test("local model final JSON may be fenced but prose and malformed actions fail closed", async () => {
  const { parseAssistantResponse } = await import("../lib/assistant-response.ts");
  assert.equal(parseAssistantResponse('```json\n{"reply":"Bonjour", "operation":null}\n```').reply, "Bonjour");
  assert.throws(() => parseAssistantResponse('{"name":"search_inventory"}'));
  assert.throws(() => parseAssistantResponse('I did it! {"reply":"changed price"}'));
  assert.throws(() => parseAssistantResponse('[]'));
});
