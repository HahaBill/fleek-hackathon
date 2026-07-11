"use client";

import { ConversationProvider } from "@elevenlabs/react";

import { ELEVENLABS_AGENT_ID } from "@/lib/elevenlabs";
import { CallApp } from "./call-app";
import { VoiceSessionProvider } from "./voice-session-provider";

export function CallProvider() {
  return (
    <ConversationProvider agentId={ELEVENLABS_AGENT_ID}>
      <VoiceSessionProvider>
        <CallApp />
      </VoiceSessionProvider>
    </ConversationProvider>
  );
}
