import { useState, type SubmitEvent } from "react";
import { postJson, type Claim, type Handler } from "./api";
import { DECISION_LABELS, dateTime, money } from "./format";

function handlerName(handlers: Handler[], handlerId: string): string {
  return handlers.find((h) => h.handler_id === handlerId)?.name ?? handlerId;
}

function Payment({
  claim,
  handlers,
}: Readonly<{ claim: Claim; handlers: Handler[] }>) {
  const lines: string[] = [];
  if (claim.signed_off_by !== null && claim.signed_off_at !== null)
    lines.push(
      `Signed off by ${handlerName(handlers, claim.signed_off_by)} on ${dateTime(claim.signed_off_at)}`,
    );
  if (claim.paid_amount !== null && claim.paid_at !== null)
    lines.push(
      `Paid ${money(claim.paid_amount)} on ${dateTime(claim.paid_at)}`,
    );
  else if (claim.status === "awaiting_sign_off")
    lines.push("Not paid. The payment waits for a handler's sign-off.");
  else lines.push("Not paid");
  return (
    <ul className="plain">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function SignOff({
  claim,
  handlers,
  onSignedOff,
}: Readonly<{ claim: Claim; handlers: Handler[]; onSignedOff: () => void }>) {
  const [handlerId, setHandlerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    void postJson<Claim>(`/api/claims/${claim.claim_id}/sign-off`, {
      handler_id: handlerId,
    })
      .then(onSignedOff, (e: unknown) => {
        const reason = e instanceof Error ? e.message : "";
        setError(reason || "The sign-off didn't go through.");
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <form className="sign-off" onSubmit={submit} aria-label="Sign-off">
      <h3>Sign-off</h3>
      <p>
        This payout is over the approval limit, so a handler signs off before
        it's paid. Signing off pays {money(claim.payout ?? 0)}.
      </p>
      <div className="sign-off-row">
        <label>
          Handler{" "}
          <select
            value={handlerId}
            onChange={(e) => {
              setHandlerId(e.target.value);
            }}
          >
            <option value="">Choose a handler</option>
            {handlers.map((h) => (
              <option key={h.handler_id} value={h.handler_id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={handlerId === "" || busy}>
          Sign off and pay
        </button>
      </div>
      {error !== null && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function Decision({
  claim,
  handlers,
  onSignedOff,
}: Readonly<{ claim: Claim; handlers: Handler[]; onSignedOff: () => void }>) {
  if (claim.decision === null)
    return (
      <section className="panel" aria-label="Decision">
        <h2>Decision</h2>
        <p className="muted">
          {claim.status === "in_progress"
            ? "The agent is working on this claim."
            : "No decision yet."}
        </p>
      </section>
    );

  return (
    <section className="panel decision" aria-label="Decision">
      <h2>Decision</h2>
      <p className="decision-headline">
        {DECISION_LABELS[claim.decision]}
        {claim.decision === "approve" && claim.payout !== null && (
          <span className="mono"> {money(claim.payout)}</span>
        )}
      </p>
      <p>{claim.reason}</p>
      <p className="muted">Policy wording: {claim.policy_section}</p>
      {claim.decided_at && (
        <p className="muted">Decided on {dateTime(claim.decided_at)}</p>
      )}
      {claim.decision === "approve" && (
        <Payment claim={claim} handlers={handlers} />
      )}
      {claim.status === "awaiting_sign_off" && (
        <SignOff claim={claim} handlers={handlers} onSignedOff={onSignedOff} />
      )}
    </section>
  );
}
