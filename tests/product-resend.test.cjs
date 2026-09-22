const {test}=require('node:test');const assert=require('node:assert/strict');const {resendProvider}=require('../src/hoursback/crm/productResend.js');
test('Resend adapter preserves reply route, payload and delivery key and retrieves thread ID',async()=>{
 const calls=[];const provider=resendProvider({apiKey:'fake',fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>options.method==='POST'?{id:'sent-1'}:{message_id:'<thread@example.test>'}};}});
 const sent=await provider.send({from:'russ@visionairy.biz',to:'test@example.test',reply_to:'russ@reply.visionairy.biz',subject:'Test',text:'Test',html:'<p>Test</p>',idempotencyKey:'stable-key'});
 assert.equal(sent.message_id,'<thread@example.test>');assert.equal(calls[0].options.headers['Idempotency-Key'],'stable-key');const payload=JSON.parse(calls[0].options.body);assert.equal(payload.reply_to,'russ@reply.visionairy.biz');assert.equal(payload.idempotencyKey,undefined);
});
test('thread metadata failure after accepted delivery never repeats the send',async()=>{
 let sends=0;const provider=resendProvider({apiKey:'fake',fetchImpl:async(url,options)=>{if(options.method==='POST'){sends++;return {ok:true,json:async()=>({id:'accepted'})};}throw Error('metadata timeout');}});
 assert.equal((await provider.send({idempotencyKey:'key',text:'test'})).id,'accepted');assert.equal(sends,1);
});
