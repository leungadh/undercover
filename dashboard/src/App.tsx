import { useEffect, useState } from "react";
import { ClaimPage } from "./ClaimPage";
import { QueuePage } from "./QueuePage";

function useHash(): string {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => {
      setHash(window.location.hash);
    };
    window.addEventListener("hashchange", update);
    return () => {
      window.removeEventListener("hashchange", update);
    };
  }, []);
  return hash;
}

function Page({ hash }: Readonly<{ hash: string }>) {
  const claim = /^#\/claims\/(.+)$/.exec(hash);
  if (claim) return <ClaimPage key={claim[1]} claimId={claim[1]} />;
  return <QueuePage />;
}

export function App() {
  const hash = useHash();
  const onQueue = !hash.startsWith("#/instructions");

  return (
    <>
      <header className="header">
        <a className="brand" href="#/">
          <strong>UnderCover</strong>
          <span className="tagline">Claims desk</span>
        </a>
        <nav className="nav" aria-label="Main">
          <a href="#/" aria-current={onQueue ? "page" : undefined}>
            Queue
          </a>
          <a href="#/instructions" aria-current={onQueue ? undefined : "page"}>
            Agent instructions
          </a>
        </nav>
      </header>
      <main className="main">
        <Page hash={hash} />
      </main>
    </>
  );
}
