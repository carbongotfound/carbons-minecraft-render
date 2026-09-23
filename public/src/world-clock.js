export const DAY_MS = 1_200_000;
const wrap = (value, period) => ((value % period) + period) % period;

// Only server snapshots set world time. A monotonic timer advances it between
// polls, so changing a computer's date/time cannot change the sky or weather.
export class WorldClock {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.anchor = now();
    this.worldAnchor = 300_000;
    this.serverAnchor = 0;
    this.lastServer = -Infinity;
    this.synced = false;
  }
  sync(snapshot, sentAt, receivedAt = this.now()) {
    if (!snapshot || !Number.isFinite(snapshot.server_ms) || !Number.isFinite(snapshot.world_ms)
      || snapshot.world_ms < 0 || snapshot.day_length_ms !== DAY_MS || snapshot.server_ms <= this.lastServer
      || !Number.isFinite(sentAt) || !Number.isFinite(receivedAt) || sentAt > receivedAt) return false;
    const transit = Math.min(2000, (receivedAt - sentAt) / 2);
    const target = snapshot.world_ms + transit;
    // Smooth normal packet jitter, but apply sleep/large corrections immediately.
    const current = this.worldMs(receivedAt);
    this.worldAnchor = this.synced && Math.abs(target - current) < 1000 ? current + (target - current) * .2 : target;
    this.serverAnchor = snapshot.server_ms + transit;
    this.anchor = receivedAt;
    this.lastServer = snapshot.server_ms;
    this.synced = true;
    return true;
  }
  worldMs(at = this.now()) { return this.worldAnchor + (this.synced ? Math.max(0, at - this.anchor) : 0); }
  serverMs(at = this.now()) { return this.serverAnchor + (this.synced ? Math.max(0, at - this.anchor) : 0); }
  fraction(at) { return wrap(this.worldMs(at), DAY_MS) / DAY_MS; }
  day(at) { return 1 + Math.floor(this.worldMs(at) / DAY_MS); }
  daylight(at) { return Math.max(0, Math.min(1, Math.sin(this.fraction(at) * Math.PI * 2) * 1.8 + .15)); }
  isNight(at) { return this.daylight(at) < .15; }
  label(at) {
    const minutes = Math.floor(wrap(this.fraction(at) * 1440 + 360, 1440));
    return `Day ${this.day(at)} · ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
}
