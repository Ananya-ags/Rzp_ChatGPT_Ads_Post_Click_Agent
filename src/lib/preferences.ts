import { z } from "zod";
import { Category, Occasion } from "./schemas";

export const PREFS_COOKIE = "cosmos_prefs";
export const PreferencesSchema = z.object({
  budget_max_inr: z.number().nonnegative().optional(),
  occasion: Occasion.optional(),
  category: Category.optional(),
  style: z.string().trim().max(40).optional().describe("e.g. minimal, statement, classic"),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date").optional().describe("YYYY-MM-DD"),
});
export type Preferences = z.infer<typeof PreferencesSchema>;

export function readPreferencesCookie(raw: string | undefined): Preferences {
  if (!raw) return {};
  try {
    // Next's cookie reader may already have decoded the value; raw Request headers have not.
    const value: unknown = JSON.parse(raw.trim().startsWith("{") ? raw : decodeURIComponent(raw));
    const parsed = PreferencesSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    console.warn("Ignoring invalid chat preferences:", parsed.error.issues.map((issue) => issue.path.join(".")).join(", "));
  } catch {
    console.warn("Ignoring an unreadable chat-preferences cookie.");
  }
  return {};
}
