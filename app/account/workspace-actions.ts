"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountWorkspaceCookie, accountWorkspaceDestination, parseAccountWorkspace } from "@/lib/account-workspaces";

async function writePreference(userId: string, mode: "buyer" | "seller") {
  (await cookies()).set(accountWorkspaceCookie(userId), mode, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/account", maxAge: 60 * 60 * 24 * 365,
  });
}

export async function rememberAccountWorkspace(value: string) {
  const mode = parseAccountWorkspace(value);
  if (!mode) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await writePreference(user.id, mode);
}

export async function selectAccountWorkspace(form: FormData) {
  const mode = parseAccountWorkspace(form.get("workspace"));
  if (!mode) redirect("/account?choose=1");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${accountWorkspaceDestination(mode)}`);
  await writePreference(user.id, mode);
  redirect(accountWorkspaceDestination(mode));
}
