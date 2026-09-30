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
  providers: {
    get db() {
      return process.env.DB_PROVIDER ?? "postgres";
    },
    get storage() {
      return process.env.STORAGE_PROVIDER ?? (process.env.NODE_ENV === "production" ? "s3" : "local");
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
    /** Per-IP auth attempts per minute (sign-up/sign-in/reset). Only raise in test environments. */
    get authPerMinute() {
      return num(process.env.AUTH_RATE_LIMIT_PER_MINUTE, 10);
    },
    maxUploadBytes: 10 * 1024 * 1024,
    maxCommentChars: 6000,
    maxPastedChars: 200_000,
  },
};
