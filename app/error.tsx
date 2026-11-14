"use client";
// Global error boundary — the app must never show a blank screen (spec section 13).

import { Button } from "@/components/ui";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-lg font-semibold text-slate-900">Something went wrong</h2>
      <p className="max-w-md text-sm text-slate-500">{error.message || "An unexpected error occurred while rendering this page."}</p>
      <div className="flex gap-2">
        <Button onClick={reset} variant="primary">
          Retry
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline">
          Reload page
        </Button>
      </div>
    </div>
  );
}
