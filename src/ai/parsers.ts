// Pure parsers for the structured command blocks the LLM emits in its replies.
// Kept free of Express/Groq so they can be unit-tested in isolation.

export interface Reminder {
  message: string;
  seconds: number;
}

export interface Hotel {
  name: string;
  price: string;
  rating: number;
}

const REMINDER_RE = /\[COMMAND: REMINDER \| message: (.*?) \| seconds: (\d+)\]/;
const HOTEL_RE = /\[HOTEL: (.*?) \| price: (.*?) \| rating: (.*?)\]/g;

/**
 * Extract a reminder command from an LLM reply and strip the command block
 * out of the user-facing text.
 * @returns the cleaned response plus the parsed reminder (or null if none).
 */
export function parseReminder(llmResponse: string): { response: string; reminder: Reminder | null } {
  const match = llmResponse.match(REMINDER_RE);
  if (!match) return { response: llmResponse, reminder: null };

  const seconds = parseInt(match[2] as string, 10);
  const reminder: Reminder = { message: (match[1] as string).trim(), seconds };
  // Remove every reminder block (there may be more than one) and tidy whitespace.
  const response = llmResponse.replace(/\[COMMAND: REMINDER .*?\]/g, "").trim();
  return { response, reminder };
}

/**
 * Parse the `[HOTEL: ... | price: ... | rating: ...]` blocks from an LLM reply.
 * Non-numeric characters are stripped from the rating; it defaults to 5.0 when
 * the model omits or malforms it.
 */
export function parseHotels(hotelData: string): Hotel[] {
  const matches = [...hotelData.matchAll(HOTEL_RE)];
  return matches.map((m) => ({
    name: (m[1] as string).trim(),
    price: (m[2] as string).trim(),
    rating: parseFloat((m[3] ?? "").replace(/[^0-9.]/g, "")) || 5.0,
  }));
}
