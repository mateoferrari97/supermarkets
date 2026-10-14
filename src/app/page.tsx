import { POSTAL_CODE_QUESTION } from "../core/order-conversation/take-turn.ts";
import { Chat } from "./chat.tsx";
import { loadDependencies } from "./sessions.ts";

export const dynamic = "force-dynamic";

export default function Page() {
  const loaded = loadDependencies();
  if (!loaded.ok) {
    return (
      <div className="wrap">
        <h1>Pedido al súper</h1>
        <div className="msg bot error">
          <div>No puedo tomar pedidos: los datos no son válidos.</div>
          <ul>
            {loaded.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  return <Chat firstQuestion={POSTAL_CODE_QUESTION} />;
}
