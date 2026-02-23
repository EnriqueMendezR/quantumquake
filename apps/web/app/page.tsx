"use client";

import dynamic from "next/dynamic";
import { useChat } from "ai/react";
import { useMemo, useState, useCallback } from "react";
import { INITIAL_GEOLOGY_MESSAGE } from "../lib/prompts";

const InferenceMap = dynamic(() => import("../components/InferenceMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        flex: 1,
        background: "#f5f5f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        color: "#666",
      }}
    >
      Loading map…
    </div>
  ),
});

// Figma asset URLs (valid for 7 days from generation)
const WAVEFORM_IMG =
  "https://www.figma.com/api/mcp/asset/feb17f25-4d71-49a9-a2ee-07c38fbbbb64";
const MOUNTAIN_BG =
  "https://www.figma.com/api/mcp/asset/bdcc6d45-7b79-4f4a-9852-fa8057a0a956";

// ── Icons ──────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg
      width="25"
      height="25"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4f4f4f"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ArrowUpIcon({ disabled }: { disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: disabled ? "#d0d0d0" : "#1a1a1a",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="19" x2="12" y2="5" />
        <polyline points="5 12 12 5 19 12" />
      </svg>
    </button>
  );
}

// ── Shared input box ───────────────────────────────────────────────────────

interface ChatInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  style?: React.CSSProperties;
}

function ChatInput({
  value,
  onChange,
  onSubmit,
  isLoading,
  style,
}: ChatInputProps) {
  return (
    <form
      onSubmit={onSubmit}
      style={{
        background: "#fffdfd",
        border: "1px solid #d5d5d5",
        borderRadius: 24,
        boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
        padding: "16px 14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        ...style,
      }}
    >
      <input
        value={value}
        onChange={onChange}
        placeholder="Explore earthquakes through quantum..."
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          color: "#4f4f4f",
          fontSize: 14,
          letterSpacing: "-0.56px",
          width: "100%",
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            display: "flex",
          }}
        >
          <PlusIcon />
        </button>
        <ArrowUpIcon disabled={isLoading || !value.trim()} />
      </div>
    </form>
  );
}

// ── Tool invocation type helper ────────────────────────────────────────────

interface ToolResult {
  toolCallId: string;
  toolName: string;
  state: string;
  args: Record<string, unknown>;
  result?: unknown[];
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({ api: "/api/chat" });

  // Tracks whether the user has ever submitted — never reverts to false even
  // if the API call fails and useChat clears the messages array.
  const [chatStarted, setChatStarted] = useState(false);

  const handleChatSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      setChatStarted(true);
      handleSubmit(e);
    },
    [handleSubmit]
  );

  // Extract region from the most recent getEarthquakes tool call (so inference API plots that region)
  const plotRegion = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.toolInvocations) {
        const inv = (msg.toolInvocations as ToolResult[]).find(
          (t) => t.toolName === "getEarthquakes" && t.state === "result"
        );
        const args = inv?.args as { region?: string } | undefined;
        if (args?.region) return args.region;
      }
    }
    return null;
  }, [messages]);

  // ── Landing screen ──────────────────────────────────────────────────────
  if (!chatStarted) {
    return (
      <main
        style={{
          height: "100vh",
          background: "white",
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Mountain silhouette background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={MOUNTAIN_BG}
          alt=""
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "53%",
            objectFit: "cover",
            pointerEvents: "none",
          }}
        />

        {/* Centered content: title + input */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 28,
            marginBottom: "18vh",
          }}
        >
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <h1
              style={{
                fontSize: 64,
                fontWeight: 500,
                margin: 0,
                color: "black",
                letterSpacing: "-1px",
              }}
            >
              QuantumQuake
            </h1>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={WAVEFORM_IMG} alt="seismic waveform" width={77} height={79} />
          </div>

          {/* Input box */}
          <ChatInput
            value={input}
            onChange={handleInputChange}
            onSubmit={handleChatSubmit}
            isLoading={isLoading}
            style={{ width: 614, minHeight: 94 }}
          />
        </div>
      </main>
    );
  }

  // ── Chat screen (split layout) ──────────────────────────────────────────
  const hasAssistantReply = messages.some(
    (m) =>
      m.role === "assistant" &&
      typeof m.content === "string" &&
      m.content.trim().length > 0
  );

  return (
    <main
      style={{
        height: "100vh",
        display: "flex",
        background: "white",
        overflow: "hidden",
      }}
    >
      {/* ── Left sidebar ── */}
      <div
        style={{
          width: 448,
          borderRight: "1px solid black",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "16px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return (
                <div
                  key={i}
                  style={{ display: "flex", justifyContent: "flex-end" }}
                >
                  <div
                    style={{
                      background: "#f2f2f2",
                      borderRadius: 8,
                      padding: "8px 12px",
                      maxWidth: 283,
                      fontSize: 14,
                      color: "#2d2c2c",
                      letterSpacing: "-0.56px",
                      lineHeight: 1.4,
                    }}
                  >
                    {typeof msg.content === "string" ? msg.content : null}
                  </div>
                </div>
              );
            }

            if (msg.role === "assistant") {
              const isLast = i === messages.length - 1;
              const invocations = msg.toolInvocations as
                | ToolResult[]
                | undefined;

              return (
                <div key={i}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "black",
                      marginBottom: 2,
                    }}
                  >
                    QuantumQuake
                  </div>

                  {/* Thinking indicator */}
                  {isLoading && isLast && !msg.content && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "#5c5b5b",
                        letterSpacing: "-0.48px",
                        marginBottom: 4,
                      }}
                    >
                      Thinking...
                    </div>
                  )}

                  {/* Tool invocations */}
                  {invocations?.map((t) => (
                    <div
                      key={t.toolCallId}
                      style={{
                        fontSize: 12,
                        color: "#989898",
                        letterSpacing: "-0.48px",
                        marginBottom: 2,
                      }}
                    >
                      {t.state === "result"
                        ? `Fetched ${Array.isArray(t.result) ? t.result.length : 0} earthquakes`
                        : `Running ${t.toolName}…`}
                    </div>
                  ))}

                  {/* Assistant text */}
                  {typeof msg.content === "string" && msg.content && (
                    <div
                      style={{
                        fontSize: 14,
                        color: "#2d2c2c",
                        letterSpacing: "-0.56px",
                        lineHeight: 1.5,
                        marginTop: 4,
                      }}
                    >
                      {msg.content}
                    </div>
                  )}
                </div>
              );
            }

            return null;
          })}

          {/* Initial geology message in left chat bar (before first agent reply) */}
          {chatStarted && !hasAssistantReply && (
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "black",
                  marginBottom: 2,
                }}
              >
                QuantumQuake
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "#2d2c2c",
                  letterSpacing: "-0.56px",
                  lineHeight: 1.5,
                  marginTop: 4,
                }}
              >
                {INITIAL_GEOLOGY_MESSAGE}
              </div>
            </div>
          )}
        </div>

        {/* Input box pinned to bottom */}
        <div style={{ padding: 8 }}>
          <ChatInput
            value={input}
            onChange={handleInputChange}
            onSubmit={handleChatSubmit}
            isLoading={isLoading}
            style={{ width: "100%", minHeight: 120 }}
          />
        </div>
      </div>

      {/* ── Single map: risk cells + earthquakes from inference API (region from agent) ── */}
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <InferenceMap region={chatStarted ? plotRegion ?? "california" : null} />
        {plotRegion && (
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: 24,
              right: 24,
              background: "#fffdfd",
              border: "1px solid #d5d5d5",
              borderRadius: 24,
              padding: "6px 16px",
              fontSize: 14,
              color: "#4f4f4f",
              letterSpacing: "-0.56px",
              zIndex: 1000,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            Risk + earthquakes · {plotRegion}
          </div>
        )}
      </div>
    </main>
  );
}
