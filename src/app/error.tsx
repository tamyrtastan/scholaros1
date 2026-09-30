"use client";
import { Button, Card } from "@/components/ui";

/** Shown when a page cannot load (database, auth or storage outage, unexpected bug). No details are leaked. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-lg text-center" role="alert">
      <h1 className="text-xl font-semibold">We couldn&apos;t load this page</h1>
      <p className="mt-2 text-sm text-muted">
        A service we depend on may be temporarily unavailable. Your projects and files are safe. Please try again in a moment.
      </p>
      <Button onClick={reset} className="mt-4">Try again</Button>
    </Card>
  );
}
