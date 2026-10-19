import { NextResponse } from "next/server";
import { loadSmartShopSettings } from "@/lib/smart-shop-settings";
import { assistantHostConfig } from "@/lib/assistant-host";

export const dynamic = "force-dynamic";
export async function GET() {
  const settings = await loadSmartShopSettings();
  return NextResponse.json({
    available: settings.enabled && Boolean(assistantHostConfig(process.env)),
    chatEnabled: settings.chat_enabled,
    voiceEnabled: settings.voice_enabled,
    memoryEnabled: settings.memory_enabled,
  }, { headers: { "Cache-Control": "no-store" } });
}
