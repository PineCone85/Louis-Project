"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 h-px w-10 bg-sage-300" />
      <h1 className="font-serif text-[30px] leading-none text-ink">Something went wrong</h1>
      <p className="mt-2 max-w-md text-[13px] text-ink-muted">{error.message || "An unexpected error occurred."}</p>
      {error.digest ? <p className="mt-1 text-[11px] text-ink-faint">Reference {error.digest}</p> : null}
      <button type="button" className="btn btn-secondary mt-6" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
