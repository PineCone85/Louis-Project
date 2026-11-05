"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** A read-only value (a URL or id) with a button that copies it, for pasting into another console. */
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-sm border border-line bg-canvas py-1 pr-1 pl-3">
      <code className="min-w-0 flex-1 truncate text-[12px] text-ink" title={value}>
        {value}
      </code>
      <button type="button" onClick={() => void copy()} className="btn btn-ghost btn-xs" aria-label={label ? `Copy ${label}` : "Copy"}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
