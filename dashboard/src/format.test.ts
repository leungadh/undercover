import { expect, it } from "vitest";
import { date, dateTime, label, money, time } from "./format";

it("formats money in US dollars", () => {
  expect(money(1250)).toBe("$1,250.00");
  expect(money(0)).toBe("$0.00");
});

it("formats dates", () => {
  expect(date("2026-06-24")).toBe("Jun 24, 2026");
  expect(dateTime("2026-06-24T15:30:00+00:00")).toMatch(/^Jun 2[45], 2026/);
  expect(time("2026-06-24T15:30:05+00:00")).toMatch(
    /^\d{1,2}:\d{2}:05\s[AP]M$/,
  );
});

it("turns identifiers into labels", () => {
  expect(label("trip_delay")).toBe("Trip delay");
  expect(label("baggage")).toBe("Baggage");
});
