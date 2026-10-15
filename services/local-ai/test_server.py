import http.client
import io
import json
import threading
import unittest
import wave
from server import Engines, InferenceServer, validate_wav


def wav_bytes(seconds=0.2, rate=16000):
    result = io.BytesIO()
    with wave.open(result, "wb") as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate)
        wav.writeframes(b"\0\0" * int(seconds * rate))
    return result.getvalue()


class FakeEngines:
    def health(self): return {"available": True, "provider": "self_hosted"}
    def chat(self, body): return {"choices": [{"message": {"content": json.dumps({"reply": "Bonjour", "product_ids": []})}}]}
    def transcribe(self, raw, language): return {"text": "Un t-shirt taille S" if language == "fr" else "A size S shirt"}
    def synthesize(self, text, language): return wav_bytes()


class GatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token = "test-private-token-" * 3
        cls.server = InferenceServer(("127.0.0.1", 0), FakeEngines(), cls.token)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join()

    def request(self, path, body=None, token=None, method="POST"):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port)
        connection.request(method, path, body=body, headers={"Authorization": "Bearer " + (token if token is not None else self.token)})
        response = connection.getresponse(); status, raw = response.status, response.read()
        connection.close(); return status, raw

    def test_private_auth_and_unknown_routes(self):
        self.assertEqual(self.request("/health", token="wrong", method="GET")[0], 401)
        self.assertEqual(self.request("/admin/change-price", b"{}")[0], 404)
        self.assertEqual(self.request("/health", method="GET")[0], 200)

    def test_actual_http_chat_transport(self):
        status, raw = self.request("/v1/chat/completions", json.dumps({"messages": [{"role": "user", "content": "Bonjour"}]}))
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(json.loads(raw)["choices"][0]["message"]["content"])["reply"], "Bonjour")

    def test_pcm_transcription_and_wav_speech_transport(self):
        status, raw = self.request("/audio/transcribe?language=fr", wav_bytes())
        self.assertEqual(status, 200); self.assertIn("taille S", json.loads(raw)["text"])
        self.assertEqual(self.request("/audio/transcribe?language=en", b"fake audio")[0], 400)
        status, raw = self.request("/audio/synthesize", json.dumps({"text": "Bonjour", "language": "fr"}))
        self.assertEqual(status, 200); validate_wav(raw)

    def test_limits_and_invalid_languages(self):
        for raw in (wav_bytes(21), wav_bytes(rate=48000), wav_bytes()[:-30]):
            self.assertEqual(self.request("/audio/transcribe?language=en", raw)[0], 400)
        self.assertEqual(self.request("/audio/synthesize", json.dumps({"text": "x" * 1201}))[0], 400)
        self.assertEqual(self.request("/audio/transcribe?language=xx", wav_bytes())[0], 400)

    def test_concurrency_fails_closed(self):
        self.server.slots.acquire(); self.server.slots.acquire()
        try: self.assertEqual(self.request("/health", method="GET")[0], 429)
        finally: self.server.slots.release(); self.server.slots.release()

    def test_json_grammar_does_not_suppress_native_tool_calls(self):
        engine = Engines.__new__(Engines)
        captured = []
        engine.local_model = lambda path, payload: captured.append((path, payload)) or {"choices": [{"message": {"tool_calls": [{"function": {"name": "search_inventory"}}]}}]}
        engine.chat({"messages": [{"role": "user", "content": "shirt"}], "tools": [{"type": "function"}], "response_format": {"type": "json_object"}, "url": "https://external.invalid"})
        self.assertEqual(captured[0][0], "/v1/chat/completions")
        self.assertNotIn("response_format", captured[0][1])
        self.assertNotIn("url", captured[0][1])
        self.assertEqual(captured[0][1]["model"], "rewear-local")
        engine.chat({"messages": [{"role": "tool", "content": "verified products"}], "tools": [{"type": "function"}]})
        self.assertNotIn("tools", captured[1][1])
        self.assertEqual(captured[1][1]["response_format"], {"type": "json_object"})


if __name__ == "__main__": unittest.main()
