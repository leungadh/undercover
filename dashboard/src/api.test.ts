import { afterEach, expect, it, vi } from "vitest";
import { ApiError, getJson, postJson } from "./api";
import { stubApi } from "./testing";

afterEach(() => {
  vi.unstubAllGlobals();
});

it("gets JSON", async () => {
  stubApi({ "GET /api/health": { status: "ok" } });
  expect(await getJson("/api/health")).toEqual({ status: "ok" });
});

it("posts JSON", async () => {
  const fetchMock = stubApi({ "POST /api/claims/CLM-1001/start": { ok: 1 } });
  expect(await postJson("/api/claims/CLM-1001/start", { a: 1 })).toEqual({
    ok: 1,
  });
  expect(fetchMock.mock.calls[0]?.[1]?.body).toBe('{"a":1}');
});

it("raises the backend's reason when it refuses", async () => {
  stubApi({});
  const error = await getJson("/api/claims/CLM-9999").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).status).toBe(404);
  expect((error as ApiError).message).toBe("No route for /api/claims/CLM-9999");
});

it("leaves the message empty when the reason is not text", async () => {
  stubApi({
    "GET /api/bad": () => Response.json({ detail: [] }, { status: 422 }),
  });
  const error = await getJson("/api/bad").catch((e: unknown) => e);
  expect((error as ApiError).message).toBe("");
});
