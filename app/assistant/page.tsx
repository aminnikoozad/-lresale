import { localizedMetadata } from "@/lib/localized-metadata";

import { Localize } from "@/components/site-language";
import { loadSmartShopSettings } from "@/lib/smart-shop-settings";
import { connection } from "next/server";
import { assistantHostConfig } from "@/lib/assistant-host";
import { AssistantWorkspace } from "@/components/assistant-workspace";
export function generateMetadata() {
  return localizedMetadata({
  title: "Your personal Shikimomo assistant",
  description:
    "Talk or type to find secondhand pieces, manage your bag and arrange a pickup. English and French.",
}, {"title": "Votre assistant personnel Shikimomo", "description": "Trouvez des articles d’occasion, gérez votre panier et organisez une collecte, en français ou en anglais."});
}
export default async function AssistantPage() {
  await connection();
  const settings = await loadSmartShopSettings();
  return <Localize><AssistantWorkspace available={settings.enabled && Boolean(assistantHostConfig(process.env))} chatEnabled={settings.chat_enabled} voiceEnabled={settings.voice_enabled} memoryEnabled={settings.memory_enabled} noticeEn={settings.notice_en} noticeFr={settings.notice_fr} /></Localize>;
}
