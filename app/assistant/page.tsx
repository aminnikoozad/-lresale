
import { Localize } from "@/components/site-language";
import { loadSmartShopSettings } from "@/lib/smart-shop-settings";
import { connection } from "next/server";
import { assistantHostConfig } from "@/lib/assistant-host";
import { AssistantWorkspace } from "@/components/assistant-workspace";
export const metadata = {
  title: "Your personal Shikimomo assistant",
  description:
    "Talk or type to find secondhand pieces, manage your bag and arrange a pickup. English and French.",
};
export default async function AssistantPage() {
  await connection();
  const settings = await loadSmartShopSettings();
  return <Localize><AssistantWorkspace available={settings.enabled && Boolean(assistantHostConfig(process.env))} chatEnabled={settings.chat_enabled} voiceEnabled={settings.voice_enabled} memoryEnabled={settings.memory_enabled} noticeEn={settings.notice_en} noticeFr={settings.notice_fr} /></Localize>;
}
