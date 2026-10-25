import type { Status, Step, StepKind } from "./api";
import { time } from "./format";

const KIND_LABELS: Record<StepKind, string> = {
  message: "Agent",
  tool_call: "Action",
  tool_result: "Result",
};

export function Steps({
  steps,
  status,
}: Readonly<{ steps: Step[]; status: Status }>) {
  return (
    <section className="panel" aria-label="The agent's steps">
      <h2>The agent's steps</h2>
      {steps.length === 0 && (
        <p className="muted">
          {status === "waiting"
            ? "The agent hasn't started on this claim yet."
            : "No steps recorded yet."}
        </p>
      )}
      <ol className="steps">
        {steps.map((step) => (
          <li key={step.step_id} className={`step step-${step.kind}`}>
            <div className="step-meta">
              <span className="step-kind">{KIND_LABELS[step.kind]}</span>
              <time className="mono muted" dateTime={step.created_at}>
                {time(step.created_at)}
              </time>
            </div>
            <p className="step-title">{step.title}</p>
            {step.detail && step.detail !== step.title && (
              <details>
                <summary>Show details</summary>
                <pre>{step.detail}</pre>
              </details>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
