export const mintCapLimit = 10;
export const mintCapWindowMs = 60_000;
export const unknownClientKey = "unknown";

const sweepThreshold = 1000;

export type MintCap = {
  readonly admit: (key: string, nowMs: number) => boolean;
  readonly reset: () => void;
};

export function createMintCap(limit: number = mintCapLimit, windowMs: number = mintCapWindowMs): MintCap {
  const hits = new Map<string, number[]>();

  function live(times: readonly number[], nowMs: number): number[] {
    return times.filter((time) => nowMs - time <= windowMs);
  }

  function sweep(nowMs: number): void {
    for (const [key, times] of hits) {
      const kept = live(times, nowMs);
      if (kept.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, kept);
      }
    }
  }

  return {
    admit(key, nowMs) {
      if (hits.size > sweepThreshold) {
        sweep(nowMs);
      }
      const kept = live(hits.get(key) ?? [], nowMs);
      if (kept.length >= limit) {
        hits.set(key, kept);
        return false;
      }
      kept.push(nowMs);
      hits.set(key, kept);
      return true;
    },
    reset() {
      hits.clear();
    },
  };
}

export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded !== null) {
    const first = (forwarded.split(",")[0] ?? "").trim();
    if (first.length > 0) {
      return first;
    }
  }
  const real = (headers.get("x-real-ip") ?? "").trim();
  if (real.length > 0) {
    return real;
  }
  return unknownClientKey;
}

const routeMintCap = createMintCap();

export function admitMint(request: Request | undefined, nowMs: number): boolean {
  const key = request === undefined ? unknownClientKey : clientKey(request.headers);
  return routeMintCap.admit(key, nowMs);
}

export function resetMintCapForTests(): void {
  routeMintCap.reset();
}
