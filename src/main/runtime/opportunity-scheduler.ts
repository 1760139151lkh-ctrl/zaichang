/** Rebuildable, single-owner wake timer for the existing Hermes review path.
 * Domain records own deadlines and retry state; no second agent loop lives here. */
export interface OpportunitySchedulerOptions {
  nextReviewAt: () => string | null;
  review: () => Promise<unknown>;
  available?: () => boolean;
  now?: () => number;
  reconcileMs?: number;
  minimumSpacingMs?: number;
  onError?: (error: unknown) => void;
  timers?: {
    set: (callback: () => void, delay: number) => unknown;
    clear: (timer: unknown) => void;
  };
}

export function createOpportunityScheduler(options: OpportunitySchedulerOptions) {
  const now = options.now || Date.now;
  const reconcileMs = Math.max(1000, options.reconcileMs || 60000);
  const minimumSpacingMs = Math.max(1, options.minimumSpacingMs || 1000);
  const timers = options.timers || {
    set: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clear: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  };
  let timer: unknown, dueAt = Infinity, running = false, stopped = false;

  const wake = () => {
    if (stopped || running) return;
    const current = now();
    let next = current + reconcileMs;
    if (options.available?.() !== false) {
      try {
        const due = options.nextReviewAt();
        if (due && Number.isFinite(Date.parse(due))) next = Math.min(next, Math.max(current + minimumSpacingMs, Date.parse(due)));
      } catch (error) { options.onError?.(error); }
    }
    // Repeated UI/source updates may advance a wake, but never postpone it.
    if (timer !== undefined && dueAt <= next) return;
    if (timer !== undefined) timers.clear(timer);
    dueAt = next;
    timer = timers.set(() => { void tick(); }, Math.max(0, next - current));
  };

  const tick = async () => {
    timer = undefined; dueAt = Infinity;
    if (stopped || running) return;
    running = true;
    try {
      if (options.available?.() !== false) await options.review();
    } catch (error) { options.onError?.(error); }
    finally { running = false; wake(); }
  };

  const stop = () => {
    stopped = true;
    if (timer !== undefined) timers.clear(timer);
    timer = undefined; dueAt = Infinity;
  };
  wake();
  return { wake, stop };
}
