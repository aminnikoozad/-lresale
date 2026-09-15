type RecoveryClient = {
  auth: {
    setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ error: unknown }>;
    getUser(): Promise<{ data: { user: unknown }; error: unknown }>;
  };
};

export async function verifyRecoverySession(client: RecoveryClient, fragment: URLSearchParams, hasFragment: boolean) {
  if (hasFragment) {
    const access_token = fragment.get("access_token");
    const refresh_token = fragment.get("refresh_token");
    if (fragment.get("type") !== "recovery" || !access_token || !refresh_token) throw new Error("Invalid recovery link");
    const { error } = await client.auth.setSession({ access_token, refresh_token });
    if (error) throw new Error("Recovery session rejected");
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Recovery session required");
}
