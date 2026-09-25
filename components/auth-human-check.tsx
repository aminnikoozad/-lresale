import { createHumanChallenge } from "@/lib/human-challenge";

export function AuthHumanCheck() {
  const challenge = createHumanChallenge();
  return (
    <div className="auth-human-check">
      <label htmlFor="human_answer">
        Human check: what is {challenge.question}
        <input
          id="human_answer"
          name="human_answer"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{1,3}"
          maxLength={3}
          autoComplete="off"
          required
        />
      </label>
      <input type="hidden" name="human_challenge" value={challenge.token} />
      <div className="auth-honeypot" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <small>This quick check helps block automated account and login abuse.</small>
    </div>
  );
}
