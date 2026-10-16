import { loadChatMessages } from "../../compose.ts";
import { AgentChat } from "./agent-chat.tsx";

export const dynamic = "force-dynamic";

export default function Page() {
  const loaded = loadChatMessages();
  if (!loaded.ok) {
    return (
      <div className="wrap">
        <h1>Pedido al súper</h1>
        <div className="msg bot error">
          <div>No puedo abrir el chat: los datos no son válidos.</div>
          <ul>
            {loaded.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  return <AgentChat initialMessages={loaded.value} />;
}
