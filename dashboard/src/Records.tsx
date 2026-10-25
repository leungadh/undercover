import type { Customer, Policy } from "./api";
import { date, label, money } from "./format";

export function PolicyPanel({ policy }: Readonly<{ policy: Policy }>) {
  const plan = policy.plan_details;
  return (
    <section className="panel" aria-label="Policy">
      <h2>
        Policy <span className="mono">{policy.policy_id}</span>
      </h2>
      <dl className="facts">
        <dt>Plan</dt>
        <dd>{plan.name}</dd>
        <dt>Add-ons</dt>
        <dd>
          {policy.add_ons.length > 0
            ? policy.add_ons.map(label).join(", ")
            : "None"}
        </dd>
        <dt>Trip</dt>
        <dd>
          {policy.trip.destination}, {date(policy.trip.departs_on)} to{" "}
          {date(policy.trip.returns_on)}
        </dd>
        <dt>Trip cost</dt>
        <dd className="mono">{money(policy.trip.trip_cost)}</dd>
        <dt>Travelers</dt>
        <dd>{policy.travelers.join(", ")}</dd>
        <dt>Bought</dt>
        <dd>
          {date(policy.purchased_on)} through {policy.sold_through}
        </dd>
      </dl>
      <details>
        <summary>Plan limits</summary>
        <dl className="facts">
          <dt>Trip cancellation and interruption</dt>
          <dd className="mono">{money(plan.trip_cancellation_max)}</dd>
          <dt>Trip delay</dt>
          <dd>
            <span className="mono">{money(plan.trip_delay_max)}</span> after{" "}
            {plan.trip_delay_waiting_hours} hours
          </dd>
          <dt>Baggage delay</dt>
          <dd>
            <span className="mono">{money(plan.baggage_delay_max)}</span> after{" "}
            {plan.baggage_delay_waiting_hours} hours
          </dd>
          <dt>Baggage and personal effects</dt>
          <dd>
            <span className="mono">{money(plan.baggage_max)}</span>, up to{" "}
            <span className="mono">{money(plan.per_item_limit)}</span> an item
          </dd>
          <dt>Passport and travel documents</dt>
          <dd className="mono">{money(plan.passport_max)}</dd>
          <dt>Emergency medical</dt>
          <dd className="mono">{money(plan.emergency_medical_max)}</dd>
          <dt>Deductible</dt>
          <dd className="mono">{money(plan.deductible)}</dd>
        </dl>
      </details>
    </section>
  );
}

export function CustomerPanel({ customer }: Readonly<{ customer: Customer }>) {
  return (
    <section className="panel" aria-label="Customer">
      <h2>Customer</h2>
      <dl className="facts">
        <dt>Name</dt>
        <dd>{customer.name}</dd>
        <dt>Email</dt>
        <dd>{customer.email}</dd>
        <dt>Phone</dt>
        <dd>{customer.phone}</dd>
        <dt>Customer since</dt>
        <dd>{date(customer.customer_since)}</dd>
      </dl>
      <h3>Claim history</h3>
      {customer.previous_claims.length === 0 ? (
        <p className="muted">No earlier claims.</p>
      ) : (
        <ul className="cards">
          {customer.previous_claims.map((c) => (
            <li key={c.claim_id}>
              <p className="card-title">
                <span className="mono">{c.claim_id}</span>{" "}
                {`${label(c.claim_type)}, filed ${date(c.filed_on)}`}
              </p>
              <p>{c.summary}</p>
              <p className="muted">
                {label(c.outcome)}, paid{" "}
                <span className="mono">{money(c.amount_paid)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
