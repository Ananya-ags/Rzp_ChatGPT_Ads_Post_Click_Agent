/** Demo clock: "today" is fixed so delivery dates are identical in every recording and eval run. */
export const DEMO_NOW_ISO = "2026-10-13T10:00:00+05:30";
export const DEMO_TZ = "Asia/Kolkata";
export const DEMO_TODAY = "2026-10-13"; // Tue

export function demoNow(): Date {
  return new Date(DEMO_NOW_ISO);
}
