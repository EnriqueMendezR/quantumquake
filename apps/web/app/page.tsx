"use client";

import dynamic from "next/dynamic";
import { useChat } from "ai/react";
import { useMemo, useRef } from "react";

const Map = dynamic(() => import("../components/Map"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#666",
      }}
    >
      Loading map…
    </div>
  ),
});

interface ToolInvocationResult {
  toolCallId: string;
  toolName: string;
  state: string;
  args: Record<string, unknown>;
  result?: unknown[];
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({ api: "/api/chat" });

  // Extract the most recent getEarthquakes result from messages
  const earthquakes = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.toolInvocations) {
        const inv = (msg.toolInvocations as ToolInvocationResult[]).find(
          (t) => t.toolName === "getEarthquakes" && t.state === "result"
        );
        if (inv && Array.isArray(inv.result)) {
          return inv.result;
        }
      }
    }
    return [];
  }, [messages]);

  // Latest assistant text response
  const latestResponse = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && typeof msg.content === "string" && msg.content.trim()) {
        return msg.content;
      }
    }
    return null;
  }, [messages]);

  return (
    <main
      style={{
        position: "relative",
        height: "100vh",
        background: "#050810",
        overflow: "hidden",
      }}
    >
      {/* Full-screen map */}
      <div style={{ position: "absolute", inset: 0 }}>
        <Map earthquakes={earthquakes as never[]} />
      </div>

      {/* Top-left info panel */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          zIndex: 1000,
          background: "rgba(5, 8, 16, 0.85)",
          border: "1px solid #1e2535",
          borderRadius: 6,
          padding: "8px 14px",
          color: "white",
          fontSize: 14,
          backdropFilter: "blur(4px)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 2 }}>QuantumQuake</div>
        <div style={{ color: "#94a3b8" }}>
          {earthquakes.length} earthquake{earthquakes.length !== 1 ? "s" : ""} displayed
        </div>
      </div>

      {/* AI response panel (shown when there's a response) */}
      {latestResponse && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 1000,
            background: "rgba(5, 8, 16, 0.9)",
            border: "1px solid #1e2535",
            borderRadius: 6,
            padding: "10px 14px",
            color: "#cbd5e1",
            fontSize: 13,
            maxWidth: 320,
            lineHeight: 1.5,
            backdropFilter: "blur(4px)",
          }}
        >
          {latestResponse}
        </div>
      )}

      {/* Bottom input bar */}
      <form
        onSubmit={handleSubmit}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          background: "rgba(5, 8, 16, 0.95)",
          borderTop: "1px solid #1e2535",
          backdropFilter: "blur(8px)",
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={handleInputChange}
          placeholder='Try: "Show me M3+ earthquakes in California in the last 7 days"'
          disabled={isLoading}
          style={{
            flex: 1,
            padding: "10px 14px",
            background: "#0f1629",
            color: "white",
            border: "1px solid #1e2535",
            borderRadius: 6,
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: "10px 20px",
            background: isLoading ? "#1e2535" : "#1d4ed8",
            color: isLoading ? "#64748b" : "white",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            cursor: isLoading ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {isLoading ? "…" : "Send"}
        </button>
      </form>
    </main>
  );
}
