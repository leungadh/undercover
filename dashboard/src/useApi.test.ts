import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { stubApi } from "./testing";
import { useApi } from "./useApi";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("loads a path", async () => {
  stubApi({ "GET /api/health": { status: "ok" } });
  const { result } = renderHook(() => useApi("/api/health"));
  await waitFor(() => {
    expect(result.current.data).toEqual({ status: "ok" });
  });
  expect(result.current.error).toBeUndefined();
});

it("waits while the path is null", () => {
  const fetchMock = stubApi({});
  const { result } = renderHook(() => useApi(null));
  expect(result.current.data).toBeUndefined();
  expect(fetchMock).not.toHaveBeenCalled();
});

it("polls when given a refresh interval", async () => {
  vi.useFakeTimers();
  const fetchMock = stubApi({ "GET /api/claims": [] });
  renderHook(() => useApi("/api/claims", 2000));
  await act(() => vi.advanceTimersByTimeAsync(4100));
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it("reloads on request", async () => {
  const fetchMock = stubApi({ "GET /api/claims": [] });
  const { result } = renderHook(() => useApi("/api/claims"));
  await waitFor(() => {
    expect(result.current.data).toEqual([]);
  });
  act(() => {
    result.current.reload();
  });
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

it("keeps the last data when a refresh fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockRejectedValueOnce(new Error("offline")),
  );
  const { result } = renderHook(() => useApi("/api/claims"));
  await waitFor(() => {
    expect(result.current.data).toEqual([]);
  });
  act(() => {
    result.current.reload();
  });
  await waitFor(() => {
    expect(result.current.error?.message).toBe("offline");
  });
  expect(result.current.data).toEqual([]);
});

it("turns a thrown value into an error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue("offline"));
  const { result } = renderHook(() => useApi("/api/claims"));
  await waitFor(() => {
    expect(result.current.error?.message).toBe("offline");
  });
});
