import { NextRequest, NextResponse } from "next/server";
import { assistantHostConfig } from "@/lib/assistant-host";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };
/** Audio transport has no database credentials, customer actions or dynamic upstreams. */
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers });
  const config = assistantHostConfig(process.env);
  if (!config)
    return NextResponse.json({ code: "self_hosted_not_configured", error: "Voice server not connected" }, { status: 503, headers });
  // Bound the stream before multipart/JSON parsing, including chunked requests.
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 700_000) { await reader.cancel(); return NextResponse.json({ error: "Audio too long" }, { status: 413, headers }); }
      chunks.push(part.value);
    }
  }
  try {
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const contentType = req.headers.get("content-type") || "";
    const parsed = new Request("https://local.invalid", { method: "POST", headers: { "Content-Type": contentType }, body: bytes });
    let path: string, body: BodyInit | undefined, type: string;
    if (contentType.startsWith("multipart/form-data")) {
      const form = await parsed.formData();
      const audio = form.get("audio");
      if (!(audio instanceof File) || audio.size > 650_000)
        return NextResponse.json({ error: "Invalid audio" }, { status: 400, headers });
      path = `/audio/transcribe?language=${form.get("language") === "fr" ? "fr" : "en"}`;
      body = await audio.arrayBuffer(); type = "audio/wav";
    } else {
      const value = await parsed.json();
      if (value.mode === "health") { path = "/health"; type = "application/json"; }
      else if (value.mode === "synthesize" && typeof value.text === "string" && value.text.trim() && value.text.length <= 1200) {
        path = "/audio/synthesize"; type = "application/json";
        body = JSON.stringify({ text: value.text, language: value.language === "fr" ? "fr" : "en" });
      } else return NextResponse.json({ error: "Invalid request" }, { status: 400, headers });
    }
    const upstream = await fetch(`${config.url}${path}`, {
      method: body ? "POST" : "GET", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": type },
      body, signal: AbortSignal.timeout(50_000),
    });
    if (!upstream.ok)
      return NextResponse.json({ error: "Voice server unavailable" }, { status: upstream.status === 429 ? 429 : 503, headers });
    return new Response(upstream.body, { headers: { ...headers, "Content-Type": path === "/audio/synthesize" ? "audio/wav" : "application/json" } });
  } catch {
    return NextResponse.json({ error: "Voice server unavailable" }, { status: 503, headers });
  }
}
