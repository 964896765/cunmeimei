'use strict';
// Repository-level validation: API checks can become stale while awaiting a database lock.
const LEAD_MS = 10 * 60 * 1000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
function isValidSlotInstant(requestedAt) {
  if (typeof requestedAt !== 'string') return false;
  // The API supplies canonical UTC instants; reject ambiguous timestamps at repository edges.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(requestedAt)) return false;
  const instant = Date.parse(requestedAt);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== requestedAt) return false;
  const shanghai = new Date(instant + SHANGHAI_OFFSET_MS);
  return shanghai.getUTCFullYear() >= 2020 && shanghai.getUTCFullYear() <= 2100
    && shanghai.getUTCHours() >= 9 && shanghai.getUTCHours() <= 18
    && shanghai.getUTCMinutes() === 0 && shanghai.getUTCSeconds() === 0
    && shanghai.getUTCMilliseconds() === 0;
}
function isBookableSlot(requestedAt, nowMs = Date.now()) {
  return isValidSlotInstant(requestedAt) && Date.parse(requestedAt) > nowMs + LEAD_MS;
}
module.exports = {isValidSlotInstant, isBookableSlot, LEAD_MS};
