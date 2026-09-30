/** Central, typed access to environment configuration. No secrets are ever defaulted here. */
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return v && Number.isFinite(n) ? n : d;
};

export const config = {
  get isProd() {
    return process.env.NODE_ENV === "production";
  },
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get sessionSecret() {
    const s = process.env.SESSION_SECRET;
    if (s) return s;
    if (this.isProd && process.env.NEXT_PHASE !== "phase-production-build") {
      throw new Error("SESSION_SECRET must be set in production");
    }
    return "dev-only-insecure-secret";
  },
  providers: {
    get db() {
      return process.env.DB_PROVIDER ?? "local";
    },
    get storage() {
      return process.env.STORAGE_PROVIDER ?? "local";
    },
    get ai() {
      return process.env.AI_PROVIDER ?? "mock";
    },
    get billing() {
      return process.env.BILLING_PROVIDER ?? "dev";
    },
    get email() {
      return process.env.EMAIL_PROVIDER ?? "console";
    },
  },
  ai: {
    get model() {
      return process.env.AI_MODEL ?? "claude-sonnet-5-5";
    },
    get maxOutputTokens() {
      return num(process.env.AI_MAX_OUTPUT_TOKENS, 2500);
    },
    get maxInputChars() {
      return num(process.env.AI_MAX_INPUT_CHARS, 24000);
    },
    get maxRetries() {
      return num(process.env.AI_MAX_RETRIES, 2);
    },
  },
  limits: {
    maxUploadBytes: 10 * 1024 * 1024,
    maxCommentChars: 6000,
    maxPastedChars: 200_000,
  },
};
