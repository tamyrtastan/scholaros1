export type AnalyticsEvent =
  | "signup_completed"
  | "project_created"
  | "manuscript_uploaded"
  | "analysis_started"
  | "analysis_completed"
  | "author_input_required"
  | "revision_resolved"
  | "response_exported"
  | "upgrade_clicked";

/** Provider-agnostic analytics. Default sink is stdout (no PII, no manuscript content). Swap for PostHog etc. */
export interface AnalyticsSink {
  track(event: AnalyticsEvent, userId: string, props?: Record<string, string | number | boolean>): void;
}

const consoleSink: AnalyticsSink = {
  track(event, userId, props) {
    if (process.env.NODE_ENV !== "test") console.log("[analytics]", event, { user: userId.slice(0, 8), ...props });
  },
};

let sink: AnalyticsSink = consoleSink;
export const setAnalyticsSink = (s: AnalyticsSink) => (sink = s);
export const track: AnalyticsSink["track"] = (e, u, p) => sink.track(e, u, p);
