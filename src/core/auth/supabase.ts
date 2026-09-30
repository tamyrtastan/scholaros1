import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { config } from "../config";

export function authEnv() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required (Supabase Auth)");
  return { url, key };
}

/** Session cookies are only ever read server-side, so they can be httpOnly (supabase-js defaults to readable-by-JS). */
export function hardenCookie(options: CookieOptions = {}): CookieOptions {
  return { ...options, httpOnly: true, sameSite: "lax", secure: config.isProd, path: "/" };
}

/** Supabase client bound to the current request's cookies (Server Components, server actions, route handlers). */
export async function supabaseServer() {
  const store = await cookies(); // first: marks the route dynamic so nothing is prerendered without env at build time
  const { url, key } = authEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          for (const { name, value, options } of list) store.set(name, value, hardenCookie(options));
        } catch {
          // Called from a Server Component: cookies are read-only there. proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
