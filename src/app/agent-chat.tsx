"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatMessage } from "../core/agent-chat/chat.ts";
import type { Cart, Idea, OrderLine, Proposal } from "../core/agent-chat/order.ts";
import { optionLetter, type Round } from "../core/agent-chat/round.ts";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function IdeaBlock({ idea }: { idea: Idea }) {
  return (
    <div className="block">
      <strong>{idea.title}</strong>
      {idea.sections.map((section) => (
        <div key={section.heading} className="block">
          <div>
            <strong>{section.heading}</strong>
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{section.text}</div>
        </div>
      ))}
    </div>
  );
}

function LineSource({ line, plan }: { line: OrderLine; plan: boolean }) {
  return (
    <div className="muted small">
      {plan ? line.description : `pediste "${line.description}"`} · {line.reason}
    </div>
  );
}

function ProposalCard({
  proposal,
  onConfirm,
}: {
  proposal: Proposal;
  onConfirm: (() => void) | null;
}) {
  return (
    <div className="msg bot wide">
      {proposal.idea ? <IdeaBlock idea={proposal.idea} /> : null}
      <div className="lead block">{proposal.idea ? "Armé este plan:" : "Armé este pedido:"}</div>
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
          {proposal.lines.map((line) => (
            <tr key={line.itemId}>
              <td>
                <div>{line.name}</div>
                <LineSource line={line} plan={proposal.idea !== undefined} />
                {line.notes.map((note) => (
                  <div key={note} className="notice">
                    {note}
                  </div>
                ))}
              </td>
              <td className="num">{line.quantity}</td>
              <td className="num">{money.format(line.unitPrice)}</td>
              <td className="num">{money.format(line.total)}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3}>
              <strong>Total</strong>
            </td>
            <td className="num">
              <strong>{money.format(proposal.total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
      {proposal.overBudget ? (
        <div className="notice block">
          Este plan se pasa de tu presupuesto por {money.format(proposal.overBudget.over)}.
        </div>
      ) : null}
      {proposal.notes.map((note) => (
        <div key={note} className="notice block">
          {note}
        </div>
      ))}
      {onConfirm ? (
        <div className="block">
          <button className="btn" type="button" onClick={onConfirm}>
            Confirmar
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RoundCard({ round, onSend }: { round: Round; onSend: ((text: string) => void) | null }) {
  const [chosen, setChosen] = useState<Record<number, number>>({});
  const answers = round.questions.flatMap((question) => {
    const index = chosen[question.number];
    const option = index === undefined ? undefined : question.options[index];
    return option ? [`${String(question.number)}: ${option.label}`] : [];
  });
  return (
    <div className="msg bot wide">
      <div className="lead block">Necesito que me confirmes algunas cosas:</div>
      {round.questions.map((question) => (
        <div key={question.number} className="block">
          <div>
            <strong>{question.number}.</strong> {question.text}
          </div>
          {question.options.map((option, index) => (
            <label key={option.label} className="block">
              <input
                type="radio"
                name={`question-${String(question.number)}`}
                disabled={onSend === null}
                checked={chosen[question.number] === index}
                onChange={() => setChosen((current) => ({ ...current, [question.number]: index }))}
              />{" "}
              {optionLetter(index)}) {option.label}
              {option.price === null ? "" : ` (${money.format(option.price)})`}
              {index + 1 === question.recommended ? (
                <span className="muted small"> · recomendada</span>
              ) : null}
            </label>
          ))}
          {question.ref !== null && question.options.some((option) => option.productId !== null) ? (
            <div className="block">
              <button
                className="btn"
                type="button"
                disabled={onSend === null}
                onClick={() => onSend?.(`Más opciones para la pregunta ${String(question.number)}`)}
              >
                Más opciones
              </button>
            </div>
          ) : null}
        </div>
      ))}
      {onSend ? (
        <div className="block">
          <button
            className="btn"
            type="button"
            disabled={answers.length === 0}
            onClick={() => onSend(answers.join("\n"))}
          >
            Enviar elegidas
          </button>{" "}
          <button className="btn" type="button" onClick={() => onSend("Aceptar las recomendadas")}>
            Aceptar recomendadas
          </button>
        </div>
      ) : null}
    </div>
  );
}

function CartCard({ cart }: { cart: Cart }) {
  return (
    <div className="msg bot wide">
      {cart.idea ? <IdeaBlock idea={cart.idea} /> : null}
      <div className="lead block">Listo, este es tu carrito en Carrefour:</div>
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
          {cart.lines.map((line) => (
            <tr key={line.itemId}>
              <td>
                <div>{line.name}</div>
                <LineSource line={line} plan={cart.idea !== undefined} />
                {line.notes.map((note) => (
                  <div key={note} className="notice">
                    {note}
                  </div>
                ))}
              </td>
              <td className="num">{line.quantity}</td>
              <td className="num">{money.format(line.unitPrice)}</td>
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
      {cart.notes.map((note) => (
        <div key={note} className="notice block">
          {note}
        </div>
      ))}
      <div className="block">{cart.warning}</div>
      <div className="block">
        <a className="btn" href={cart.cartLink} target="_blank" rel="noreferrer">
          Abrir el carrito en Carrefour
        </a>
      </div>
    </div>
  );
}

const proposalOf = (message: ChatMessage): Proposal | null =>
  message.parts?.find((part) => part.type === "proposal")?.proposal ?? null;

const cartOf = (message: ChatMessage): Cart | null =>
  message.parts?.find((part) => part.type === "cart")?.cart ?? null;

const roundOf = (message: ChatMessage): Round | null =>
  message.parts?.find((part) => part.type === "round")?.round ?? null;

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
    await sendText(draft);
  }

  async function sendText(written: string) {
    const text = written.trim();
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
        {messages.map((message, index) => {
          const proposal = message.role === "assistant" ? proposalOf(message) : null;
          if (proposal) {
            const latest = index === messages.length - 1 && !working;
            return (
              <ProposalCard
                key={index}
                proposal={proposal}
                onConfirm={latest ? () => void sendText("Confirmar") : null}
              />
            );
          }
          const round = message.role === "assistant" ? roundOf(message) : null;
          if (round) {
            const latest = index === messages.length - 1 && !working;
            return (
              <RoundCard
                key={index}
                round={round}
                onSend={latest ? (text) => void sendText(text) : null}
              />
            );
          }
          const cart = message.role === "assistant" ? cartOf(message) : null;
          if (cart) return <CartCard key={index} cart={cart} />;
          return (
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
          );
        })}
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
