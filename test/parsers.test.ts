import { describe, it, expect } from "vitest";
import { parseReminder, parseHotels } from "../src/ai/parsers";

describe("parseReminder", () => {
  it("returns the text unchanged and no reminder when there is no command block", () => {
    const { response, reminder } = parseReminder("Sure, the capital of France is Paris.");
    expect(reminder).toBeNull();
    expect(response).toBe("Sure, the capital of France is Paris.");
  });

  it("extracts the reminder and strips the command block from the reply", () => {
    const raw = "Okay, I'll remind you. [COMMAND: REMINDER | message: call mom | seconds: 300]";
    const { response, reminder } = parseReminder(raw);
    expect(reminder).toEqual({ message: "call mom", seconds: 300 });
    expect(response).toBe("Okay, I'll remind you.");
    expect(response).not.toContain("COMMAND");
  });

  it("parses seconds as a number", () => {
    const { reminder } = parseReminder("[COMMAND: REMINDER | message: x | seconds: 42]");
    expect(reminder?.seconds).toBe(42);
    expect(typeof reminder?.seconds).toBe("number");
  });

  it("removes multiple reminder blocks from the visible text", () => {
    const raw =
      "Done. [COMMAND: REMINDER | message: a | seconds: 10] and [COMMAND: REMINDER | message: b | seconds: 20]";
    const { response } = parseReminder(raw);
    expect(response).not.toContain("COMMAND");
  });
});

describe("parseHotels", () => {
  it("returns an empty array when there are no hotel blocks", () => {
    expect(parseHotels("I could not find any hotels.")).toEqual([]);
  });

  it("parses multiple hotel blocks with name, price, and numeric rating", () => {
    const raw = [
      "[HOTEL: Grand Plaza | price: $100 | rating: 4.5]",
      "[HOTEL: Budget Inn | price: $50 | rating: 3.2 stars]",
    ].join("\n");
    expect(parseHotels(raw)).toEqual([
      { name: "Grand Plaza", price: "$100", rating: 4.5 },
      { name: "Budget Inn", price: "$50", rating: 3.2 },
    ]);
  });

  it("defaults rating to 5.0 when it is missing or non-numeric", () => {
    const raw = "[HOTEL: Mystery Suites | price: $80 | rating: N/A]";
    expect(parseHotels(raw)[0].rating).toBe(5.0);
  });

  it("regression: the block regex must NOT be double-escaped (it once matched nothing)", () => {
    // Guards against the historical bug where /\\[HOTEL...\\]/ never matched.
    expect(parseHotels("[HOTEL: A | price: $1 | rating: 5]").length).toBe(1);
  });
});
