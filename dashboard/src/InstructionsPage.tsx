import type { Text } from "./api";
import { useApi } from "./useApi";

export function InstructionsPage() {
  const { data, error } = useApi<Text>("/api/instructions");

  return (
    <>
      <h1>Agent instructions</h1>
      <p className="muted">
        Read only. The agent reads these each time it starts a claim.
      </p>
      {error && (
        <p className="notice" role="alert">
          Can't reach the backend. Check that it's running.
        </p>
      )}
      {data && (
        <section className="panel" aria-label="Instructions">
          <pre className="instructions">{data.content}</pre>
        </section>
      )}
    </>
  );
}
