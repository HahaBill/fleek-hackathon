"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Text-mode input bar. Same pipeline as voice; this is fallback rung 2. */
export function TextComposer({
  onSend,
  disabled,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border border-border bg-card/60 px-2 py-1.5 backdrop-blur",
        disabled && "opacity-50"
      )}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        disabled={disabled}
        placeholder="Type your message"
        aria-label="Message the assistant"
        className="flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
      />
      <Button
        size="icon"
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="size-9 shrink-0 rounded-full disabled:opacity-40"
        aria-label="Send"
      >
        <ArrowUp className="size-4" strokeWidth={2.5} />
      </Button>
    </div>
  );
}
