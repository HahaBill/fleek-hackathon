"use client";

import { Database, TriangleAlert } from "lucide-react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ui/conversation";
import { Message, MessageContent } from "@/components/ui/message";
import type { FeedItem } from "@/hooks/use-call";
import { cn } from "@/lib/utils";

/**
 * Compact live transcript. It is ambience, not the hero, so it stays small and
 * auto-scrolls. Buyer turns sit right, agent turns left; tool lookups and
 * escalations are threaded inline so judges see the agent reason and defer.
 */
export function Transcript({ feed }: { feed: FeedItem[] }) {
  return (
    <Conversation className="h-full">
      <ConversationContent className="mx-auto flex max-w-xl flex-col gap-1 px-1 py-2">
        {feed.map((item) => {
          if (item.kind === "turn") {
            return (
              <Message key={item.key} from={item.role === "buyer" ? "user" : "assistant"}>
                <MessageContent
                  variant="flat"
                  className={cn(
                    "text-[0.9rem] leading-relaxed",
                    item.role === "buyer" ? "text-foreground/90" : "text-muted-foreground",
                    item.streaming && "opacity-80"
                  )}
                >
                  {item.text}
                </MessageContent>
              </Message>
            );
          }
          if (item.kind === "tool") {
            return (
              <div
                key={item.key}
                className="flex items-center gap-2 py-1 pl-1 font-mono text-[11px] text-muted-foreground/70"
              >
                <Database className="size-3 shrink-0" strokeWidth={1.75} />
                <span className="truncate">
                  {item.tool}
                  <span className="text-muted-foreground/40"> &rarr; </span>
                  {item.summary}
                </span>
              </div>
            );
          }
          return (
            <div
              key={item.key}
              className="my-1 flex items-center gap-2 rounded-md border border-clay/30 bg-clay/[0.07] px-2.5 py-1.5 text-xs text-clay"
            >
              <TriangleAlert className="size-3.5 shrink-0" strokeWidth={2} />
              <span className="font-medium">Escalated: {item.detail}</span>
            </div>
          );
        })}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
