import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Localize } from "@/components/site-language";
import { AccountWorkspaceChoice } from "@/components/account-workspace-choice";
import { createClient } from "@/lib/supabase/server";
import { accountEntryDestination, accountWorkspaceCookie } from "@/lib/account-workspaces";

export const dynamic = "force-dynamic";

export default async function AccountEntry({ searchParams }: {searchParams: Promise<{choose?: string}>}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");
  const [params, cookieStore] = await Promise.all([searchParams, cookies()]);
  const destination = accountEntryDestination(cookieStore.get(accountWorkspaceCookie(user.id))?.value, params.choose === "1");
  if (destination) redirect(destination);
  return <Localize><AccountWorkspaceChoice /></Localize>;
}
