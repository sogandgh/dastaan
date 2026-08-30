const hits = new Map();

export function checkLimit(name, userId, max, windowMs) {
  const key = `${name}:${userId}`;
  const now = Date.now();
  const timestamps = (hits.get(key) || []).filter(t => now - t < windowMs);

  if (timestamps.length >= max) {
    hits.set(key, timestamps);
    return { allowed: false, retryAfterMs: windowMs - (now - timestamps[0]) };
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return { allowed: true };
}

export function getUsage(name, userId, windowMs) {
  const key = `${name}:${userId}`;
  const now = Date.now();
  const timestamps = (hits.get(key) || []).filter(t => now - t < windowMs);
  return timestamps.length;
}

export function formatRetryAfter(ms) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.ceil(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
