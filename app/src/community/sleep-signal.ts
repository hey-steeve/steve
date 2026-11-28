// Spots a sustained drop in sleep against the person's own baseline.
// It reports a change in habit, never a medical reading.

export type SleepNight = { readonly date: string; readonly minutes: number };

export type SleepSignal = {
  readonly baselineMinutes: number;
  readonly recentMinutes: number;
  readonly lowNights: number;
  readonly days: number;
};

export const sleepSignalRules = {
  baselineNights: 4,
  recentNights: 10,
  dropMinutes: 60,
  minLowNights: 7,
} as const;

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function detectSleepDrop(nights: readonly SleepNight[]): SleepSignal | null {
  const { baselineNights, recentNights, dropMinutes, minLowNights } = sleepSignalRules;
  if (nights.length < baselineNights + recentNights) {
    return null;
  }
  const recent = nights.slice(-recentNights).map((night) => night.minutes);
  const baseline = nights
    .slice(-(recentNights + baselineNights), -recentNights)
    .map((night) => night.minutes);
  const baselineMinutes = average(baseline);
  const recentMinutes = average(recent);
  const threshold = baselineMinutes - dropMinutes;
  const lowNights = recent.filter((minutes) => minutes <= threshold).length;
  if (recentMinutes > threshold || lowNights < minLowNights) {
    return null;
  }
  return {
    baselineMinutes: Math.round(baselineMinutes),
    recentMinutes: Math.round(recentMinutes),
    lowNights,
    days: recentNights,
  };
}

export function hoursLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours}h` : `${hours}h ${String(rest).padStart(2, "0")}m`;
}
