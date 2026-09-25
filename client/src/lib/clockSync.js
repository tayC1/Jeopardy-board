import { socket } from './socket.js';

// Rough NTP-style clock sync: repeatedly round-trip a timestamp to the
// server and keep the offset from whichever sample had the lowest RTT (least
// likely to be skewed by a slow leg). Used to timestamp buzz-ins against the
// server's clock instead of raw arrival order, so a laggy connection doesn't
// unfairly cost a player who buzzed first.
const RESYNC_INTERVAL_MS = 4000;

let offset = 0;
let bestRtt = Infinity;
let intervalHandle = null;

function measure() {
  const t0 = Date.now();
  socket.emit('clock:sync', null, (serverTime) => {
    if (typeof serverTime !== 'number') return;
    const t1 = Date.now();
    const rtt = t1 - t0;
    if (rtt < bestRtt) {
      bestRtt = rtt;
      offset = serverTime + rtt / 2 - t1;
    }
  });
}

function onReconnect() {
  bestRtt = Infinity; // network path likely changed; stop trusting old samples
  measure();
}

export function startClockSync() {
  measure();
  intervalHandle = setInterval(measure, RESYNC_INTERVAL_MS);
  socket.on('connect', onReconnect);
  return function stopClockSync() {
    clearInterval(intervalHandle);
    socket.off('connect', onReconnect);
  };
}

export function estimatedServerTime() {
  return Date.now() + offset;
}
