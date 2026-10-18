import { isGoogleSignInEnabled } from "@/lib/google-auth";
import { signInWithGoogle } from "@/app/auth/google/actions";
import { Localize } from "./site-language";
import { PendingSubmitButton } from "./pending-submit-button";
import Link from "next/link";

export async function GoogleSignIn({ next = "/account" }: { next?: string }) {
  if (!(await isGoogleSignInEnabled())) return null;
  return <Localize><div className="auth-google">
    <form action={signInWithGoogle}>
      <input type="hidden" name="next" value={next} />
      <PendingSubmitButton className="auth-google-button" pendingLabel="Connecting to Google…">Continue with Google</PendingSubmitButton>
    </form>
    <p className="auth-note">By continuing with Google, you agree to the <Link href="/terms">Terms of Use</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.</p>
    <div className="auth-divider">or</div>
  </div></Localize>;
}
