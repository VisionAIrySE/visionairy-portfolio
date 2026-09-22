const {test} = require('node:test');
const assert = require('node:assert/strict');
const {stockerSchedule,isBusinessDate,STOCKER_SEQUENCE} = require('../src/hoursback/crm/productSchedule.js');
test('Monday enrollment uses business days 1,4,9,16,25',()=> {
 assert.deepEqual(stockerSchedule('2026-09-21').map(x=>x.localDate), ['2026-09-21','2026-09-24','2026-10-01','2026-10-12','2026-10-23']);
});
test('Friday start skips weekends and crosses daylight-saving boundary as calendar dates',()=> {
 assert.deepEqual(stockerSchedule('2026-10-30').map(x=>x.localDate), ['2026-10-30','2026-11-04','2026-11-11','2026-11-20','2026-12-03']);
});
test('invalid dates and weekend starts fail closed',()=> {
 for(const value of ['2026-02-30','bad','2026-09-26','2026-09-27']) assert.throws(()=>stockerSchedule(value));
 assert.equal(isBusinessDate('2026-09-27'),false);
});
test('sequence definition cannot be modified by another product',()=> {
 assert.equal(Object.isFrozen(STOCKER_SEQUENCE),true);
 assert.equal(Object.isFrozen(STOCKER_SEQUENCE.businessDays),true);
});
