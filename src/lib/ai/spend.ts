/**
 * Running estimate of today's LLM spend (IST day), for the daily cap. In memory, so it's per server instance and
 * resets on a cold start: a soft guard for the prototype, not billing-grade accounting.
 */
import { dailyBudgetUsd } from "./model";

let day = "";
let usd = 0;
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); // IST date

function roll() {
  const d = today();
  if (d !== day) {
    day = d;
    usd = 0;
  }
}

export function addSpend(cost: number | null) {
  roll();
  if (cost) usd += cost;
}
export function spendToday() {
  roll();
  return { spent_today_usd: +usd.toFixed(5), budget_usd: dailyBudgetUsd(), day };
}
export const overDailyBudget = () => spendToday().spent_today_usd >= dailyBudgetUsd();
