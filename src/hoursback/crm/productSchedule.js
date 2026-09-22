'use strict';
// Calendar dates, not elapsed milliseconds: callers must supply the configured
// local send-date. This module neither chooses a timezone nor sends messages.
const STOCKER_SEQUENCE = Object.freeze({
  product: 'stockerai', version: 1,
  businessDays: Object.freeze([1, 4, 9, 16, 25]),
});
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected local date YYYY-MM-DD');
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date');
  return date;
}
function businessDay(date) { return date.getUTCDay() !== 0 && date.getUTCDay() !== 6; }
function isBusinessDate(value) { return businessDay(parseDate(value)); }
function stockerSchedule(firstDate) {
  const date = parseDate(firstDate);
  if (!businessDay(date)) throw new Error('First email must be scheduled on a business day');
  const results = [];
  let ordinal = 1;
  while (ordinal <= 25) {
    if (STOCKER_SEQUENCE.businessDays.includes(ordinal)) results.push(Object.freeze({touch: results.length + 1, businessDay: ordinal, localDate: date.toISOString().slice(0, 10)}));
    do { date.setUTCDate(date.getUTCDate() + 1); } while (!businessDay(date));
    ordinal++;
  }
  return results;
}
module.exports = { STOCKER_SEQUENCE, isBusinessDate, stockerSchedule };
