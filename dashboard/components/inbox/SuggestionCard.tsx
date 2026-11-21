"use client";

import * as React from "react";
import { Pencil, Send, X, Zap } from "lucide-react";
import { SupportEvents } from "@roxshield/support-sdk";
import type { QuickAnswerSuggestion } from "@roxshield/support-sdk";
import { Badge, Button } from "@/components/ui";
import { useSupport } from "@/lib/support";

/** The suggested quick answer for a conversation (fetched on open, updated live). */
export function useQuickAnswerSuggestion(conversationId: string) {
  const { client, subscribe } = useSupport();
  const [suggestion, setSuggestion] = React.useState<QuickAnswerSuggestion | null>(null);

  React.useEffect(() => {
    let alive = true;
    setSuggestion(null);
    client
      .quickAnswerSuggestion(conversationId)
      .then((s) => alive && setSuggestion(s))
      .catch(() => undefined);
    const off = subscribe((name, payload) => {
      if (name === SupportEvents.QUICK_ANSWER_SUGGESTION && payload?.conversationId === conversationId) setSuggestion(payload.suggestion ?? null);
    });
    return () => {
      alive = false;
      off();
    };
  }, [client, subscribe, conversationId]);

  return [suggestion, setSuggestion] as const;
}

export function SuggestionCard({
  suggestion,
  disabled,
  onSend,
  onEdit,
  onDismiss,
}: {
  suggestion: QuickAnswerSuggestion;
  disabled?: boolean;
  onSend: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}) {
  const pct = Math.round(suggestion.score * 100);
  return (
    <div className="border-t border-violet-200 bg-violet-50/70 px-4 py-2.5" role="region" aria-label="Suggested answer">
      <div className="flex items-center gap-2 text-xs">
        <Zap className="h-3.5 w-3.5 shrink-0 text-violet-600" />
        <span className="font-semibold text-violet-900">Suggested answer</span>
        <span className="truncate text-violet-800/80">· {suggestion.title}</span>
        <Badge tone={pct >= 80 ? "green" : "amber"} className="ml-auto">{pct}% match</Badge>
        <button onClick={onDismiss} className="rounded p-0.5 text-violet-500 hover:bg-violet-100 hover:text-violet-800" aria-label="Dismiss suggestion">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p dir="auto" className="mt-1.5 line-clamp-3 text-[13px] whitespace-pre-wrap text-zinc-800">{suggestion.answer}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={disabled} onClick={onSend}>
          <Send className="h-3.5 w-3.5" /> Send
        </Button>
        <Button size="sm" disabled={disabled} onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit first
        </Button>
        <span className="truncate text-[11px] text-violet-800/70">
          Matched {suggestion.source === "text" ? "message" : suggestion.source === "screen" ? "screenshot text" : "screenshot"}: {suggestion.matched.slice(0, 3).join(", ")}
        </span>
      </div>
    </div>
  );
}
