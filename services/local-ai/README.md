# REWEAR AI on the owner's hardware

This stack runs language inference, English/French speech recognition and speech
synthesis on the owner's machine. It does not use OpenAI, cloud speech recognition,
browser SpeechRecognition or a hosted inference provider. Weights are downloaded
once during installation, not on customer requests. The model is a licensed existing
model, not a new foundation model trained or exclusively owned by REWEAR.

## Components and scope

- Qwen3-8B Q4_K_M through llama.cpp, private container, tools enabled with `--jinja`.
- faster-whisper `small`, CPU/int8; Piper English `lessac` and French `siwis`.
- A private Python gateway with fixed inference/audio routes, bearer authentication,
  global rate/concurrency limits, bounded WAV inputs and no prompt/audio logging.
- Caddy TLS is the only published port. The inference containers use an internal
  network with no internet egress. No database credentials are installed here.
- Website and Supabase still host the storefront, authentication, inventory and
  customer actions. This migration removes the external **AI provider** dependency;
  it does not move the entire website/database onto this machine.

The existing customer-only operation allowlist, explicit ownership checks, RLS,
review buttons and checkout handoff remain mandatory. The model cannot change
prices, publish inventory or perform any administration, even for a staff account.

## Install on a dedicated owner-controlled machine

Do not run on a server already using ports 80/443 without first planning its proxy
configuration. Do not interrupt an existing VPN or other service to free those ports.

1. Check actual RAM, CPU and GPU before choosing the production model. The language
   model file is about 5 GB; context, speech models, OS and concurrent conversations
   need additional memory. The CPU configuration is a starting point for hardware
   testing, not a promise of live-voice latency or production capacity. A GPU needs
   a separate tested CUDA/driver configuration; this package does not assume one.
2. Install Docker with Compose. Set a real DNS hostname such as `ai.example.com`
   to this machine, and arrange inbound HTTPS reachability. A home machine needs
   a working network route and must stay online while serving customers.
3. From this directory run `python setup.py --domain ai.example.com` (or `python3`).
   Installation downloads the model files and creates a local `.env` with a random
   private token. It never prints or commits that token. Weights remain in `models/`.
4. Inspect `docker compose ps` and `docker compose logs --tail=30 inference llama`.
   Wait for all models to finish loading. The gateway's `/health` requires the
   private token and checks actual local language-model readiness.
5. Set **server-only** `SELF_HOSTED_AI_URL=https://ai.example.com` and
   `SELF_HOSTED_AI_TOKEN` (the value generated in `.env`) in both Supabase Edge
   secrets and the Vercel project environments that will be tested. Use secure
   secret entry; never put it in `NEXT_PUBLIC_*`, frontend code, screenshots or chat.
   The token protects your own machine; it is not a third-party AI subscription.
6. Deploy `rewear-assistant` with `_shared/assistant-host.ts` and the existing shared
   contract/search/stylist files. Deploy the website branch, then test the full flow.
   No production release should claim to work until these steps pass on real hardware.

Python package versions are locked in `requirements.lock`. The llama.cpp image is
currently the `server` channel; record and pin the actual tested digest before
production. Review model/voice model cards and retain required license notices
(Qwen Apache-2.0; Piper GPL-3.0 and per-voice licenses). This stack's installation
uses official upstream repositories; runtime does not send customer data to them.

## Live voice

The customer explicitly starts the microphone. An AudioWorklet converts to mono
16 kHz PCM, detects speech and a silence boundary, and submits bounded utterances
to the same-origin site transport. The owner-hosted speech model transcribes them.
The same customer-authorized shopping path answers, and owner-hosted Piper reads
the answer. Spoken input can interrupt playback; text chat remains available.
Final writes still need the on-screen review button. Stopping, leaving the page,
changing account or the ten-minute idle/session bound releases microphone tracks.

This is continuous **turn-based voice**, not a claim of token-by-token streaming
speech or native speech-to-speech latency. Recognition starts after a short silence.
Noise, Safari/iOS playback, interruptions and concurrent users need hardware/browser
tests. Reference image search is hidden because this selected local model is text-only;
it is explicitly rejected server-side rather than ignored. A local vision model is
additional work, not a capability of this package.

## Verification

From repository root:

```sh
node --test tests/assistant.test.ts tests/assistant-self-hosted.test.ts
python -m unittest discover -s services/local-ai -p test_server.py
npx tsc --noEmit
npm run build
```

Run `docker compose exec inference python smoke_model.py` (it uses synthetic inventory, never customer data). This calls the real Qwen model to check English/French search tools, final JSON and refusal of price/publication commands.

Gateway tests run actual HTTP requests with fake engines; they verify auth, route
bounds, WAV validation and concurrency, not model quality. Worklet tests exercise
speech/silence detection and downsampling. Test with actual model files separately:
English/French requests, exact/alternative stock, follow-up item positions, style
advice, typed and spoken actions, account switching, all forbidden admin operations,
model/server outage and microphone cleanup. Never replace missing inventory with
invented products. Existing shipping-quote and earnings tools are still site-only.

## Operating without this ChatGPT session

Docker services use `restart: unless-stopped`; no ChatGPT session runs them. Keep
the machine online, back up model/config files securely, patch dependencies and
monitor CPU/memory and TLS readiness. Stop using `docker compose stop`; resume
using `docker compose up -d`. Do not use `down -v` unless deliberately deleting
the Caddy volumes. No model training or personal-data collection jobs are scheduled.
