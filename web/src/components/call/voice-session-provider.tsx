"use client";

import { createContext, useContext, useRef, type ReactNode } from "react";

import { ServerEventTransport } from "@fleek/voice-client";

const VoiceSessionContext = createContext<ServerEventTransport | null>(null);

export function VoiceSessionProvider({ children }: { children: ReactNode }) {
  const transportRef = useRef<ServerEventTransport | null>(null);
  if (!transportRef.current) {
    transportRef.current = new ServerEventTransport();
  }

  return (
    <VoiceSessionContext.Provider value={transportRef.current}>
      {children}
    </VoiceSessionContext.Provider>
  );
}

export function useVoiceSessionTransport(): ServerEventTransport {
  const transport = useContext(VoiceSessionContext);
  if (!transport) {
    throw new Error("useVoiceSessionTransport requires VoiceSessionProvider");
  }
  return transport;
}
