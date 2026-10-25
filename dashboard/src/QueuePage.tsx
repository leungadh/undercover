import type { ClaimSummary } from "./api";
import {
  DECISION_LABELS,
  STATUSES,
  STATUS_LABELS,
  date,
  label,
  money,
} from "./format";
import { StatusBadge } from "./StatusBadge";
import { useApi } from "./useApi";

function Decision({ claim }: Readonly<{ claim: ClaimSummary }>) {
  if (claim.decision === null) return <span className="muted">None yet</span>;
  const payout =
    claim.decision === "approve" && claim.payout !== null
      ? ` ${money(claim.payout)}`
      : "";
  return (
    <>
      {DECISION_LABELS[claim.decision]}
      <span className="mono">{payout}</span>
    </>
  );
}

export function QueuePage() {
  const { data: claims, error } = useApi<ClaimSummary[]>("/api/claims", 2000);

  return (
    <>
      <h1>Claims queue</h1>
      {error && (
        <p className="notice" role="alert">
          Can't reach the backend. Check that it's running.
        </p>
      )}
      {claims && (
        <>
          <section className="panel" aria-label="Claims by status">
            <dl className="counts">
              {STATUSES.map((status) => (
                <div className="count" key={status}>
                  <dt>
                    <StatusBadge status={status} />
                  </dt>
                  <dd aria-label={STATUS_LABELS[status]}>
                    {claims.filter((c) => c.status === status).length}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="panel table-wrap" aria-label="Claims">
            <table>
              <thead>
                <tr>
                  <th>Claim</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Summary</th>
                  <th className="amount">Claimed</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.claim_id}>
                    <td className="nowrap">
                      <a className="mono" href={`#/claims/${claim.claim_id}`}>
                        {claim.claim_id}
                      </a>
                    </td>
                    <td className="nowrap">{claim.customer_name}</td>
                    <td className="nowrap">{label(claim.claim_type)}</td>
                    <td>{claim.summary}</td>
                    <td className="amount">{money(claim.amount_claimed)}</td>
                    <td className="nowrap">{date(claim.submitted_on)}</td>
                    <td>
                      <StatusBadge status={claim.status} />
                    </td>
                    <td className="nowrap">
                      <Decision claim={claim} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  );
}
