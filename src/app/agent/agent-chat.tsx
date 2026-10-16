"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../../core/agent-chat/chat.ts";

type Shown = ChatMessage | { role: "error"; text: string };

const replySchemaMessage = (body: unknown): ChatMessage | null => {
  if (typeof body !== "object" || body === null || !("message" in body)) return null;
  return body.message as ChatMessage;
};

const errorsOf = (body: unknown): string[] => {
  if (typeof body === "object" && body !== null && "errors" in body && Array.isArray(body.errors)) {
    return body.errors.map(String);
  }
  return ["No pude leer la respuesta del servidor."];
};

export function AgentChat({ initialMessages }: { initialMessages: ChatMessage[] }) {
  const [messages, setMessages] = useState<Shown[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, working]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (text === "" || working) return;
    setDraft("");
    setWorking(true);
    setMessages((shown) => [...shown, { role: "owner", at: new Date().toISOString(), text }]);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body: unknown = await response.json().catch(() => null);
      const message = response.ok ? replySchemaMessage(body) : null;
      setMessages((shown) => [
        ...shown,
        message ?? { role: "error", text: errorsOf(body).join("\n") },
      ]);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setMessages((shown) => [...shown, { role: "error", text }]);
    }
    setWorking(false);
  }

  return (
    <div className="wrap">
      <h1>Pedido al súper</h1>
      <div className="log">
        {messages.length === 0 && (
          <div className="msg bot">
            <div className="text">Hola, escribime lo que necesitás.</div>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === "owner"
                ? "msg me"
                : message.role === "error"
                  ? "msg bot error"
                  : "msg bot"
            }
          >
            {message.role === "assistant" ? (
              <div className="text">{message.text}</div>
            ) : (
              message.text
            )}
          </div>
        ))}
        {working && (
          <div className="msg bot">
            <span className="spinner" />
            <span className="muted">Pensando…</span>
          </div>
        )}
        <div ref={bottom} />
      </div>
      <form className="input" onSubmit={(event) => void send(event)}>
        <textarea
          className="input"
          value={draft}
          placeholder="Escribí tu mensaje"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="btn" type="submit" disabled={working || !draft.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
