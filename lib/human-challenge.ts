import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { BUILD_ADMIN_RATE_LIMIT_SALT } from "@/lib/generated/admin-rate-limit-salt";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

type ChallengePayload = {
  a: number;
  b: number;
  exp: number;
  nonce: string;
};

function challengeSecret() {
  const configured = process.env.ADMIN_RATE_LIMIT_SALT?.trim();
  return configured && configured.length >= 32 ? configured : BUILD_ADMIN_RATE_LIMIT_SALT;
}

function signature(body: string) {
  return createHmac("sha256", challengeSecret()).update(body).digest("base64url");
}

function shuffledChoices(answer: number) {
  const values = [answer, Math.max(1, answer - 1), answer + 1];
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

export function createHumanChallenge() {
  const a = randomInt(2, 10);
  const b = randomInt(1, 10);
  const answer = a + b;
  const payload: ChallengePayload = {
    a,
    b,
    exp: Date.now() + CHALLENGE_TTL_MS,
    nonce: randomInt(0, 2 ** 31 - 1).toString(36),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return {
    question: `${a} + ${b}`,
    choices: shuffledChoices(answer),
    token: `${body}.${signature(body)}`,
  };
}

export function verifyHumanChallenge(token: string, rawAnswer: string) {
  const [body, suppliedSignature, extra] = token.split(".");
  if (!body || !suppliedSignature || extra) return false;

  const expectedSignature = signature(body);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;

  let payload: ChallengePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ChallengePayload;
  } catch {
    return false;
  }

  if (
    !Number.isInteger(payload.a) ||
    !Number.isInteger(payload.b) ||
    !Number.isFinite(payload.exp) ||
    payload.exp < Date.now() ||
    payload.exp > Date.now() + CHALLENGE_TTL_MS + 60_000
  ) return false;

  const answer = Number(rawAnswer.trim());
  return Number.isInteger(answer) && answer === payload.a + payload.b;
}
