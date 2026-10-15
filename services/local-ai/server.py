"""Private inference gateway. No database/admin credentials and no cloud inference.

Model downloads are a separate install step. Runtime requires local model files.
"""
import collections
import hmac
import http.client
import io
import json
import os
from pathlib import Path
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit


MAX_BODY = 2_500_000
MAX_AUDIO = 16_000 * 20


def validate_wav(raw):
    try:
        with wave.open(io.BytesIO(raw), "rb") as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getcomptype()) != (1, 2, 16000, "NONE"):
                raise ValueError("Expected mono PCM16 at 16 kHz")
            frames = wav.getnframes()
            if not 1600 <= frames <= MAX_AUDIO:
                raise ValueError("Audio must be 0.1–20 seconds")
            if len(wav.readframes(frames)) != frames * 2:
                raise ValueError("Truncated WAV")
    except (wave.Error, EOFError) as error:
        raise ValueError("Invalid WAV") from error


class Engines:
    def __init__(self):
        # Imports here allow security/transport tests without loading large models.
        from faster_whisper import WhisperModel
        from piper import PiperVoice
        root = Path(os.environ.get("MODEL_ROOT", "/models"))
        self.whisper = WhisperModel(str(root / "whisper"), device="cpu", compute_type="int8", cpu_threads=int(os.environ.get("AI_CPU_THREADS", "4")), local_files_only=True)
        self.voices = {
            "en": PiperVoice.load(str(root / "voices/en_US-lessac-medium.onnx")),
            "fr": PiperVoice.load(str(root / "voices/fr_FR-siwis-medium.onnx")),
        }
        self.audio_lock = threading.Lock()

    def local_model(self, path, payload=None):
        connection = http.client.HTTPConnection(os.environ.get("LLAMA_HOST", "llama"), int(os.environ.get("LLAMA_PORT", "8080")), timeout=42)
        try:
            connection.request("POST" if payload is not None else "GET", path, body=json.dumps(payload).encode() if payload is not None else None, headers={"Content-Type": "application/json"})
            response = connection.getresponse()
            data = response.read(MAX_BODY + 1)
            if response.status != 200 or len(data) > MAX_BODY:
                raise RuntimeError("Local model unavailable")
            return json.loads(data)
        finally:
            connection.close()

    def health(self):
        self.local_model("/health")
        return {"available": True, "provider": "self_hosted", "audio": ["en", "fr"], "images": False}

    def chat(self, body):
        # Fixed local model and bounded generation; model has no built-in shell/MCP.
        messages = body.get("messages", [])
        finalizing = bool(messages and messages[-1].get("role") == "tool")
        payload = {key: body[key] for key in ("messages", "tools") if key in body}
        # A JSON grammar would suppress llama.cpp's native tool-call delimiters.
        # With tools, the system prompt specifies final JSON; don't constrain the
        # intermediate function-call tokens with response_format=json_object.
        if finalizing or not body.get("tools"):
            payload.pop("tools", None)
            payload["response_format"] = {"type": "json_object"}
        payload.update(model="rewear-local", stream=False, max_tokens=1200, temperature=0.3, chat_template_kwargs={"enable_thinking": False})
        result = self.local_model("/v1/chat/completions", payload)
        message = (result.get("choices") or [{}])[0].get("message", {})
        if payload.get("tools") and not message.get("tool_calls"):
            # A no-tool answer (e.g. refusing an admin action) must still obey
            # the final response contract. Regenerate under JSON grammar with
            # native tool markers removed, never guess actions from prose.
            payload.pop("tools", None)
            payload["response_format"] = {"type": "json_object"}
            result = self.local_model("/v1/chat/completions", payload)
        return result

    def transcribe(self, raw, language):
        import numpy as np
        # We accept only validated PCM WAV, so no external codec/resampler is
        # needed and decoding cannot depend on a changing PyAV signature.
        with wave.open(io.BytesIO(raw), "rb") as wav:
            audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
        with self.audio_lock:
            segments, _ = self.whisper.transcribe(audio, language=language, beam_size=1, vad_filter=True, condition_on_previous_text=False)
            return {"text": " ".join(s.text.strip() for s in segments if s.no_speech_prob < 0.6).strip()[:3000]}

    def synthesize(self, text, language):
        result = io.BytesIO()
        with self.audio_lock:
            with wave.open(result, "wb") as wav:
                self.voices[language].synthesize_wav(text, wav)
        return result.getvalue()


class InferenceServer(ThreadingHTTPServer):
    daemon_threads = True
    def __init__(self, address, engines, token):
        if len(token) < 32:
            raise ValueError("SELF_HOSTED_AI_TOKEN must have at least 32 characters")
        super().__init__(address, Handler)
        self.engines = engines
        self.token = token
        self.slots = threading.BoundedSemaphore(2)
        self.rate_lock = threading.Lock()
        self.requests = collections.deque()

    def permit(self):
        with self.rate_lock:
            now = time.monotonic()
            while self.requests and self.requests[0] < now - 60:
                self.requests.popleft()
            if len(self.requests) >= 120:
                return False
            self.requests.append(now)
            return True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never log audio, prompts, tokens, addresses or customer history.

    def reply(self, status, value, content_type="application/json"):
        raw = value if isinstance(value, bytes) else json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        self.handle_request()

    def do_POST(self):
        self.handle_request()

    def handle_request(self):
        self.connection.settimeout(15)
        if not hmac.compare_digest(self.headers.get("Authorization", "").encode(), ("Bearer " + self.server.token).encode()):
            return self.reply(401, {"error": "Unauthorized"})
        parsed = urlsplit(self.path)
        paths = {"/health": "GET", "/v1/chat/completions": "POST", "/audio/transcribe": "POST", "/audio/synthesize": "POST"}
        if paths.get(parsed.path) != self.command:
            return self.reply(404, {"error": "Unknown route"})
        if not self.server.permit() or not self.server.slots.acquire(blocking=False):
            return self.reply(429, {"error": "Local server busy"})
        try:
            if parsed.path == "/health":
                return self.reply(200, self.server.engines.health())
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                return self.reply(413, {"error": "Request too large or empty"})
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError("Truncated request")
            if parsed.path == "/audio/transcribe":
                validate_wav(raw)
                language = parse_qs(parsed.query).get("language", ["en"])[0]
                if language not in ("en", "fr"):
                    raise ValueError("Unsupported language")
                return self.reply(200, self.server.engines.transcribe(raw, language))
            body = json.loads(raw)
            if not isinstance(body, dict):
                raise ValueError("Expected object")
            if parsed.path == "/v1/chat/completions":
                if not isinstance(body.get("messages"), list) or not 1 <= len(body["messages"]) <= 50:
                    raise ValueError("Invalid conversation")
                return self.reply(200, self.server.engines.chat(body))
            text, language = body.get("text"), body.get("language", "en")
            if not isinstance(text, str) or not text.strip() or len(text) > 1200 or language not in ("en", "fr"):
                raise ValueError("Invalid speech request")
            return self.reply(200, self.server.engines.synthesize(text, language), "audio/wav")
        except (ValueError, TypeError):
            self.reply(400, {"error": "Invalid request"})
        except Exception:
            self.reply(503, {"error": "Local inference unavailable"})
        finally:
            self.server.slots.release()


if __name__ == "__main__":
    token = os.environ.get("SELF_HOSTED_AI_TOKEN", "")
    if len(token) < 32:
        raise SystemExit("Configure SELF_HOSTED_AI_TOKEN before starting")
    InferenceServer(("0.0.0.0", 8000), Engines(), token).serve_forever()
