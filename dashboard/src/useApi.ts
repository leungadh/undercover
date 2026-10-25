import { useCallback, useEffect, useState } from "react";
import { getJson } from "./api";

export interface Loaded<T> {
  data: T | undefined;
  error: Error | undefined;
  reload: () => void;
}

interface State<T> {
  path: string | null;
  data: T | undefined;
  error: Error | undefined;
}

/** Fetch a path from the API, again every refreshMs if given; a null path waits. */
export function useApi<T>(path: string | null, refreshMs = 0): Loaded<T> {
  const [state, setState] = useState<State<T>>({
    path,
    data: undefined,
    error: undefined,
  });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (path === null) return;
    let active = true;
    const load = () => {
      getJson<T>(path).then(
        (data) => {
          if (active) setState({ path, data, error: undefined });
        },
        (error: unknown) => {
          if (active)
            setState((s) => ({
              path,
              data: s.path === path ? s.data : undefined,
              error: error instanceof Error ? error : new Error(String(error)),
            }));
        },
      );
    };
    load();
    const timer = refreshMs > 0 ? setInterval(load, refreshMs) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [path, refreshMs, version]);

  const current = state.path === path;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : undefined,
    reload,
  };
}
