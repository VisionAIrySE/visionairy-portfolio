const {test}=require('node:test');
const assert=require('node:assert/strict');
const Q=require('../src/hoursback/crm/productMessageQuality.js');
const M=require('../src/hoursback/crm/productMessages.js');

test('draft saves reject concatenated email versions',()=>{
 const body="Hi team, I’m Russ. Demo: https://www.stocker-ai.com/demo\n\nI’m Russ, founder of StockerAI. Demo: https://www.stocker-ai.com/demo";
 assert.match(Q.duplicateContentIssue(body),/duplicated email copy/);
 assert.throws(()=>M.validateDraft({subject:'Route picking',body}),/duplicated email copy/);
});

test('one clean email with one demo link passes duplicate detection',()=>{
 const body='Hi team, StockerAI reads the route picking report aloud. See https://www.stocker-ai.com/demo and reply with the report name.';
 assert.equal(Q.duplicateContentIssue(body),null);
 assert.doesNotThrow(()=>M.validateDraft({subject:'Route picking',body}));
});
