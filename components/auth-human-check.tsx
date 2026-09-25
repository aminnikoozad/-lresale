import { createHumanChallenge } from "@/lib/human-challenge";

export function AuthHumanCheck() {
  const challenge = createHumanChallenge();
  return (
    <fieldset className="auth-human-check">
      <legend>Quick verification</legend>
      <p className="auth-human-question">Tap the answer to {challenge.question}</p>
      <div className="auth-human-options" role="radiogroup" aria-label={`Answer to ${challenge.question}`}>
        {challenge.choices.map((choice) => (
          <label className="auth-human-option" key={choice}>
            <input name="human_answer" type="radio" value={choice} required />
            <span>{choice}</span>
          </label>
        ))}
      </div>
      <input type="hidden" name="human_challenge" value={challenge.token} />
      <div className="auth-honeypot" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <small>This helps us block automated sign-ups and login abuse.</small>
    </fieldset>
  );
}
