export function ClaimPage({ claimId }: Readonly<{ claimId: string }>) {
  return (
    <>
      <a href="#/">Back to the queue</a>
      <h1 className="mono">{claimId}</h1>
    </>
  );
}
