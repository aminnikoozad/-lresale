import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase/config";
export const maxDuration = 60;
/** Same-origin transport. Only customer-session credentials reach the assistant. */
export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (req.headers.get("origin") !== req.nextUrl.origin)
    return NextResponse.json(
      { error: "Origin not allowed" },
      { status: 403, headers },
    );
  const raw = await req.text();
  if (raw.length > 3_000_000)
    return NextResponse.json(
      { error: "Request too large" },
      { status: 413, headers },
    );
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers },
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400, headers },
    );
  // No caller-selected function, URL, RPC, role, or server credential is forwarded.
  const { url, publishableKey } = getSupabaseConfig();
  const upstreamHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: publishableKey,
  };
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (user && !error) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user.id === user.id && session.access_token)
      upstreamHeaders.Authorization = `Bearer ${session.access_token}`;
  }
  try {
    const upstream = await fetch(`${url}/functions/v1/rewear-assistant`, {
      method: "POST",
      headers: upstreamHeaders,
      body: JSON.stringify({
        mode: body.mode,
        language: body.language,
        messages: body.messages,
        request: body.request,
        image: body.image,
        bag: body.bag,
        visible_items: body.visible_items,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status, headers });
  } catch {
    return NextResponse.json(
      {
        code: "connection_unavailable",
        error: "Smart Shopping is temporarily unavailable.",
      },
      { status: 503, headers },
    );
  }
}
