"use client";

import { useEffect, useRef, useState } from "react";
import type { AskedQuestion, Cart, TurnEvent, TurnRequest } from "./turn-events.ts";

type Step = { id: number; text: string; seconds: number | null };

type Message =
  | { role: "owner"; text: string }
  | { role: "bot"; text: string; questions: AskedQuestion[] }
  | { role: "steps"; steps: Step[] }
  | { role: "cart"; cart: Cart }
  | { role: "error"; text: string };

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

async function* readEvents(response: Response): AsyncGenerator<TurnEvent> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line) as TurnEvent;
    if (done) break;
  }
  if (buffer.trim()) yield JSON.parse(buffer) as TurnEvent;
}

function withStep(messages: Message[], update: (steps: Step[]) => Step[]): Message[] {
  const last = messages.at(-1);
  if (last?.role !== "steps") return [...messages, { role: "steps", steps: update([]) }];
  return [...messages.slice(0, -1), { role: "steps", steps: update(last.steps) }];
}

function withEvent(messages: Message[], event: TurnEvent): Message[] {
  switch (event.type) {
    case "session":
      return messages;
    case "step-started":
      return withStep(messages, (steps) => [
        ...steps,
        { id: event.id, text: event.text, seconds: null },
      ]);
    case "step-done":
      return withStep(messages, (steps) =>
        steps.map((step) => (step.id === event.id ? { ...step, seconds: event.seconds } : step)),
      );
    case "questions":
      return [...messages, { role: "bot", text: event.text, questions: event.questions }];
    case "cart":
      return [...messages, { role: "cart", cart: event.cart }];
    case "error":
      return [...messages, { role: "error", text: event.message }];
  }
}

export function Chat({ firstQuestion }: { firstQuestion: string }) {
  const firstMessages: Message[] = [{ role: "bot", text: firstQuestion, questions: [] }];
  const [messages, setMessages] = useState<Message[]>(firstMessages);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const [finished, setFinished] = useState(false);
  const turn = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => () => turn.current?.abort(), []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || working) return;
    setDraft("");
    setWorking(true);
    setMessages((current) => [...current, { role: "owner", text }]);
    const controller = new AbortController();
    turn.current = controller;
    const request: TurnRequest = { sessionId, text };
    try {
      const response = await fetch("/api/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      for await (const event of readEvents(response)) {
        if (event.type === "session") setSessionId(event.sessionId);
        if (event.type === "cart" || (event.type === "error" && response.status !== 409)) {
          setFinished(true);
        }
        setMessages((current) => withEvent(current, event));
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      setMessages((current) => [...current, { role: "error", text: message }]);
      setFinished(true);
    } finally {
      setWorking(false);
    }
  }

  function restart() {
    setMessages(firstMessages);
    setSessionId(null);
    setDraft("");
    setFinished(false);
  }

  function appendChip(piece: string) {
    setDraft((current) => (current.trim() ? `${current.trim()}, ${piece}` : piece));
  }

  const lastIndex = messages.length - 1;

  return (
    <div className="wrap">
      <h1>Pedido al súper</h1>
      <div className="log">
        {messages.map((message, index) => (
          <MessageView
            key={index}
            message={message}
            chips={index === lastIndex && !working && !finished}
            onChip={appendChip}
          />
        ))}
        {working && messages.at(-1)?.role !== "steps" ? (
          <div className="msg bot">
            <span className="spinner" />
          </div>
        ) : null}
        <div ref={bottom} />
      </div>
      {finished ? (
        <div className="input">
          <button className="btn ghost" onClick={restart}>
            Nuevo pedido
          </button>
        </div>
      ) : (
        <form
          className="input"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            value={draft}
            disabled={working}
            placeholder={sessionId === null ? "Código postal…" : "Escribí tu mensaje…"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button className="btn" type="submit" disabled={working || !draft.trim()}>
            Enviar
          </button>
        </form>
      )}
    </div>
  );
}

function MessageView({
  message,
  chips,
  onChip,
}: {
  message: Message;
  chips: boolean;
  onChip: (piece: string) => void;
}) {
  switch (message.role) {
    case "owner":
      return <div className="msg me">{message.text}</div>;
    case "bot":
      return (
        <div className="msg bot">
          <div className="text">{message.text}</div>
          {chips && message.questions.some((question) => question.options.length > 0) ? (
            <QuestionChips questions={message.questions} onChip={onChip} />
          ) : null}
        </div>
      );
    case "steps":
      return (
        <div className="msg bot">
          {message.steps.map((step) => (
            <div key={step.id} className="small">
              {step.seconds === null ? (
                <span className="spinner" />
              ) : (
                <span className="ok">✓ </span>
              )}
              {step.text}
              {step.seconds === null ? null : (
                <span className="muted"> {step.seconds.toFixed(1)} s</span>
              )}
            </div>
          ))}
        </div>
      );
    case "cart":
      return (
        <div className="msg bot wide">
          <CartView cart={message.cart} />
        </div>
      );
    case "error":
      return <div className="msg bot error">{message.text}</div>;
  }
}

function QuestionChips({
  questions,
  onChip,
}: {
  questions: AskedQuestion[];
  onChip: (piece: string) => void;
}) {
  return (
    <div className="chips">
      {questions.map((question) => (
        <div key={question.number} className="question">
          <strong>{question.number}.</strong>
          {question.options.map((option, index) => (
            <button key={option} className="chip" type="button" onClick={() => onChip(option)}>
              {index + 1}) {option}
            </button>
          ))}
          <button className="chip" type="button" onClick={() => onChip("cualquiera")}>
            cualquiera
          </button>
        </div>
      ))}
      <div className="muted small">
        Tocá una opción o escribí la respuesta. Podés contestar todo en un solo mensaje.
      </div>
    </div>
  );
}

function CartView({ cart }: { cart: Cart }) {
  return (
    <>
      <div className="lead">Listo, este es tu carrito en Carrefour:</div>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th className="num">Cant.</th>
            <th className="num">c/u</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {cart.lines.map((line, index) => (
            <tr key={index}>
              <td>
                <div>{line.product?.name ?? "Sin producto"}</div>
                <div className="muted small">
                  pediste &quot;{line.phrase}&quot; · {line.reason}
                </div>
                {line.notices.map((notice) => (
                  <div key={notice} className="notice">
                    {notice}
                  </div>
                ))}
              </td>
              <td className="num">{line.quantity}</td>
              <td className="num">
                {line.unitPrice === null ? "—" : money.format(line.unitPrice)}
              </td>
              <td className="num">{money.format(line.total)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3}>
              <strong>Total</strong> <span className="muted small">CP {cart.postalCode}</span>
            </td>
            <td className="num">
              <strong>{money.format(cart.total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      {cart.notices.map((notice) => (
        <div key={notice} className="notice block">
          {notice}
        </div>
      ))}
      {cart.cartLink ? (
        <div className="block">
          <a className="btn" href={cart.cartLink} target="_blank" rel="noreferrer">
            Abrir el carrito en Carrefour
          </a>
        </div>
      ) : null}
    </>
  );
}
