import { releaseExpiredHolds } from "./holdService.js";
import { expireStaleOffers } from "./waitlistService.js";

const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS || 15000); // 15s

/**
 * The frontend countdown is purely cosmetic. This sweep is the actual
 * enforcement mechanism: it periodically reclaims seats whose hold or
 * waitlist offer window has passed, regardless of whether the browser
 * that created the hold is still open. A short interval (15s default)
 * keeps the gap between "TTL expired" and "seat released" small; in a
 * larger deployment this would run as a dedicated cron/worker process
 * instead of an in-process interval.
 */
export function startScheduler() {
  const tick = async () => {
    try {
      const releasedHolds = releaseExpiredHolds();
      const expiredOffers = await expireStaleOffers();
      if (releasedHolds || expiredOffers) {
        console.log(`[scheduler] released ${releasedHolds} expired hold(s), ${expiredOffers} stale waitlist offer(s)`);
      }
    } catch (err) {
      console.error("[scheduler] sweep failed:", err);
    }
  };

  tick();
  return setInterval(tick, SWEEP_INTERVAL_MS);
}
