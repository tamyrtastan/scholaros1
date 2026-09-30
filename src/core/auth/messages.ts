import type { AuthError } from "@supabase/supabase-js";
import { AppError, ServiceUnavailableError } from "../errors";
import { isAuthUnavailable } from "./session";

/** Converts a Supabase Auth error into a safe, user-facing AppError (never leaks provider details). */
export function toAppError(error: AuthError): AppError {
  if (isAuthUnavailable(error)) return new ServiceUnavailableError("auth");
  switch (error.code) {
    case "invalid_credentials":
      return new AppError("Incorrect email or password");
    case "email_not_confirmed":
      return new AppError("Please verify your email address first. Check your inbox, or request a new link below.");
    case "weak_password":
      return new AppError("That password is too weak. Use at least 8 characters.");
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return new AppError("Too many requests. Please wait a few minutes and try again.", 429);
    case "otp_expired":
    case "flow_state_expired":
    case "flow_state_not_found":
    case "bad_code_verifier":
      return new AppError("This link has expired or was already used. Please request a new one.");
    case "same_password":
      return new AppError("Choose a password different from your current one.");
    case "signup_disabled":
      return new AppError("Sign-ups are currently disabled.");
    default:
      return new AppError("We could not complete that request. Please try again.");
  }
}
