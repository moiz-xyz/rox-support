"use client";

import * as React from "react";
import { notFound, useParams } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import type { Conversation } from "@roxshield/support-sdk";
import { ConversationList } from "@/components/inbox/ConversationList";
import { ChatView } from "@/components/inbox/ChatView";
import { CustomerPanel } from "@/components/inbox/CustomerPanel";
import { EmptyState } from "@/components/ui";
import { isView } from "@/lib/inbox";
import { cx } from "@/lib/format";

/**
 * Three-column inbox: conversation list · active chat · customer details.
 *  ≥ xl  : all three columns
 *  lg    : list + chat, details as a slide-over
 *  < lg  : one column at a time (list → chat → details)
 */
export default function InboxPage() {
  const params = useParams<{ view: string; id?: string[] }>();
  const view = params.view;
  const conversationId = params.id?.[0] ?? null;
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [conversation, setConversation] = React.useState<Conversation | null>(null);
  const onConversation = React.useCallback((c: Conversation | null) => setConversation(c), []);

  React.useEffect(() => {
    setPanelOpen(false);
    if (!conversationId) setConversation(null);
  }, [conversationId]);

  if (!isView(view)) notFound();

  return (
    <div className="flex h-full">
      <div className={cx("w-full shrink-0 border-r border-zinc-200 bg-white lg:w-[22rem]", conversationId ? "hidden lg:block" : "block")}>
        <ConversationList view={view} activeId={conversationId} />
      </div>

      <div className={cx("min-w-0 flex-1", conversationId ? "block" : "hidden lg:block")}>
        {conversationId ? (
          <ChatView key={conversationId} conversationId={conversationId} backHref={`/inbox/${view}`} onTogglePanel={() => setPanelOpen((o) => !o)} onConversation={onConversation} />
        ) : (
          <div className="h-full bg-zinc-50/60">
            <EmptyState icon={<MessagesSquare className="h-5 w-5" />} title="Select a conversation" description="Pick a conversation from the list to read and reply. New messages arrive here in real time." />
          </div>
        )}
      </div>

      {conversationId && (
        <>
          <aside className="hidden w-[20rem] shrink-0 border-l border-zinc-200 xl:block">
            <CustomerPanel conversation={conversation} />
          </aside>
          {panelOpen && (
            <div className="fixed inset-0 z-40 xl:hidden" role="dialog" aria-label="Customer details">
              <div className="absolute inset-0 bg-zinc-950/30 animate-fade-in" onClick={() => setPanelOpen(false)} />
              <div className="absolute inset-y-0 right-0 w-full max-w-sm shadow-2xl animate-slide-up">
                <CustomerPanel conversation={conversation} onClose={() => setPanelOpen(false)} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
