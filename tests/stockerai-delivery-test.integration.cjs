const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const T=require('../src/hoursback/crm/productDeliveryTest.js');

test('controlled StockerAI delivery test sends once only to Russ and cannot be repeated',async()=>{
 const db=new PrismaClient({datasources:{db:{url:'postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test'}}});
 try{
  await db.$transaction(async tx=>{
   const scope=new Proxy(tx,{get:(target,key)=>key==='$transaction'?fn=>fn(tx):target[key]});
   await tx.cRMProduct.upsert({where:{id:'stockerai'},create:{id:'stockerai',name:'StockerAI'},update:{}});
   await tx.productSequence.upsert({where:{productId_version:{productId:'stockerai',version:1}},create:{productId:'stockerai',version:1,dayNumbers:[1,4,9,16,25],businessDaysOnly:true,approvedAt:new Date()},update:{approvedAt:new Date()}});
   let posts=0;
   const fetchImpl=async(url,options={})=>{
    if(options.method==='POST'){
     posts++;
     const payload=JSON.parse(options.body);
     assert.equal(payload.to,T.TEST_TO);
     assert.equal(payload.reply_to,'russ@reply.visionairy.biz');
     assert.match(payload.html,/Founder, StockerAI/);
     return new Response(JSON.stringify({id:'provider-test'}),{status:200,headers:{'content-type':'application/json'}});
    }
    return new Response(JSON.stringify({message_id:'<test@resend.dev>'}),{status:200,headers:{'content-type':'application/json'}});
   };
   const sent=await T.sendApprovedTest(scope,{apiKey:'test-key',inboundKey:'test-key',fetchImpl,now:new Date('2026-09-22T22:00:00Z')});
   assert.equal(sent.to,T.TEST_TO);
   assert.equal(posts,1);
   const campaign=await tx.productEnrollment.findUnique({where:{id:sent.enrollmentId},include:{recipient:true,messages:true,sequence:{include:{product:true}}}});
   assert.equal(campaign.recipient.email,T.TEST_TO);
   assert.equal(campaign.recipient.selected,true);
   assert.equal(campaign.messages.length,5);
   assert.equal(campaign.messages.filter(message=>message.deliveryState==='SENT').length,1);
   assert.equal(campaign.sequence.product.signatureText,T.SIGNATURE);
   assert.equal(campaign.sequence.product.sendingEnabled,true);
   assert.equal(await tx.productRecipient.count({where:{productId:'stockerai',selected:true}}),1);
   await assert.rejects(()=>T.sendApprovedTest(scope,{apiKey:'test-key',fetchImpl,now:new Date('2026-09-22T22:01:00Z')}),/already sent/);
   assert.equal(posts,1);
   throw Error('ROLLBACK_DELIVERY_TEST');
  },{timeout:20000});
 }catch(error){if(error.message!=='ROLLBACK_DELIVERY_TEST')throw error;}
 finally{await db.$disconnect();}
});
