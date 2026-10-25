import {
  ApiError,
  type Claim,
  type Customer,
  type Handler,
  type Policy,
  type Step,
} from "./api";
import { Decision } from "./Decision";
import { date, label, money } from "./format";
import { CustomerPanel, PolicyPanel } from "./Records";
import { StatusBadge } from "./StatusBadge";
import { Steps } from "./Steps";
import { useApi } from "./useApi";

function ClaimDetails({ claim }: Readonly<{ claim: Claim }>) {
  return (
    <section className="panel" aria-label="The claim">
      <h2>The claim</h2>
      <dl className="facts">
        <dt>Type</dt>
        <dd>{label(claim.claim_type)}</dd>
        <dt>Incident</dt>
        <dd>
          {date(claim.incident_date)}, {claim.incident_location}
        </dd>
        <dt>Submitted</dt>
        <dd>{date(claim.submitted_on)}</dd>
      </dl>
      <h3>The customer's story</h3>
      <p className="story">{claim.story}</p>
      <h3>Items claimed</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th className="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            {claim.items.map((item) => (
              <tr key={item.description}>
                <td>{item.description}</td>
                <td>{label(item.category)}</td>
                <td className="amount">{money(item.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2}>Total claimed</th>
              <td className="amount">{money(claim.amount_claimed)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <h3>Documents</h3>
      <ul className="cards">
        {claim.documents.map((doc) => (
          <li key={doc.name}>
            <p className="card-title">
              {doc.name} <span className="muted">({label(doc.type)})</span>
            </p>
            <p>{doc.content}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ClaimPage({ claimId }: Readonly<{ claimId: string }>) {
  const {
    data: claim,
    error,
    reload,
  } = useApi<Claim>(`/api/claims/${claimId}`, 2000);
  const { data: steps } = useApi<Step[]>(`/api/claims/${claimId}/steps`, 2000);
  const { data: policy } = useApi<Policy>(
    claim ? `/api/policies/${claim.policy_id}` : null,
  );
  const { data: customer } = useApi<Customer>(
    claim ? `/api/customers/${claim.customer_id}` : null,
  );
  const { data: handlers } = useApi<Handler[]>("/api/handlers");

  if (!claim) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <>
        <a href="#/">Back to the queue</a>
        <h1 className="mono">{claimId}</h1>
        {notFound && <p>We couldn't find claim {claimId}.</p>}
        {error && !notFound && (
          <p className="notice" role="alert">
            Can't reach the backend. Check that it's running.
          </p>
        )}
      </>
    );
  }

  return (
    <>
      <a href="#/">Back to the queue</a>
      <div className="claim-title">
        <h1 className="mono">{claim.claim_id}</h1>
        <StatusBadge status={claim.status} />
      </div>
      <p className="claim-summary">{claim.summary}</p>
      {error && (
        <p className="notice" role="alert">
          Can't reach the backend. Showing the last update.
        </p>
      )}
      <Decision claim={claim} handlers={handlers ?? []} onSignedOff={reload} />
      <div className="claim-grid">
        <ClaimDetails claim={claim} />
        <Steps steps={steps ?? []} status={claim.status} />
      </div>
      <div className="claim-grid">
        {policy && <PolicyPanel policy={policy} />}
        {customer && <CustomerPanel customer={customer} />}
      </div>
    </>
  );
}
