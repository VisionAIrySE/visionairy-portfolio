const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../src/hoursback/crm/productPersonalization.js');

test('named recipient replaces an old company greeting without changing the message',()=>{
 const body="Hi Denver's Best Vending team,\n\nI’m Russ, founder at StockerAI.";
 assert.equal(P.personalizeBody(body,'Stephen'),'Hi Stephen,\n\nI’m Russ, founder at StockerAI.');
});

test('named recipient is added when a saved draft has no greeting',()=>{
 assert.equal(P.personalizeBody('A practical route-picking idea.','Stephen'),'Hi Stephen,\n\nA practical route-picking idea.');
});

test('an inline old greeting is replaced without duplicating the salutation',()=>{
 assert.equal(P.personalizeBody('Hi Denver team, I’m Russ.','Stephen'),'Hi Stephen,\n\nI’m Russ.');
});

test('address check accepts only the selected first name',()=>{
 assert.equal(P.addressedTo('Hi Stephen,\n\nMessage','Stephen'),true);
 assert.equal(P.addressedTo('Stephen,\n\nMessage','Stephen'),true);
 assert.equal(P.addressedTo("Hi Denver's Best Vending team,\n\nMessage",'Stephen'),false);
});
