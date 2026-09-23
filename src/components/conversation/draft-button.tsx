"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { draftReplyAction } from "@/lib/actions/ai";
import type { Draft } from "@/lib/ai/draft";
import { cx } from "@/components/ui/primitives";

type Props = {
  channel: "email" | "whatsapp";
  contactAddress: string;
  clientId: string | null;
  onDraft: (draft: Draft) => void;
};

/**
 * Asks Claude for a ready-to-send reply to the latest client message and hands it
 * to the composer. The agent can add a one-line instruction to steer the draft.
 */
export function DraftButton({ channel, contactAddress, clientId, onDraft }: Props) {
  const [pending, startTransition] = useTransition();
  const [showInstruction, setShowInstruction] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  const generate = () => {
    setError(null);
    setNotes(null);
    startTransition(async () => {
      const result = await draftReplyAction({ channel, contactAddress, clientId, instruction: instruction.trim() || undefined });
      if (!result.ok || !result.data) {
        setError((!result.ok && result.error) || "Could not generate a draft.");
        return;
      }
      onDraft(result.data);
      setNotes(result.data.notes || null);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={pending || !contactAddress}
          className={cx("btn btn-secondary btn-sm gap-1.5", pending && "opacity-70")}
          aria-busy={pending}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {pending ? "Drafting…" : "Draft with AI"}
        </button>
        <button type="button" className="text-[12px] font-medium text-ink-muted hover:text-ink" onClick={() => setShowInstruction((v) => !v)}>
          {showInstruction ? "Hide instructions" : "Add instructions"}
        </button>
      </div>
      {showInstruction ? (
        <input
          className="input h-8 text-[13px]"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              generate();
            }
          }}
          placeholder="Optional: what should the reply say? e.g. offer a viewing on Saturday morning"
          aria-label="Instructions for the AI draft"
        />
      ) : null}
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
      {notes ? (
        <p className="rounded-sm border border-sage-200 bg-sage-50 px-3 py-2 text-[12px] text-sage-900">
          <span className="font-medium">Check before sending: </span>
          {notes}
        </p>
      ) : null}
    </div>
  );
}
