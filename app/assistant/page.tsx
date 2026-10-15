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
  return <AssistantWorkspace available={Boolean(assistantHostConfig(process.env))} />;
}
