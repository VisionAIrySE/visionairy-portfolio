const {test}=require('node:test');const assert=require('node:assert/strict');const {PrismaClient}=require('@prisma/client');
const {applyProductSetup}=require('../src/hoursback/crm/productSetup.js');const {legacyClient}=require('../src/hoursback/crm/productLegacyScope.js');
test('setup preserves historical selections and messages and keeps shared company in VisionAIry',async()=>{
 const db=new PrismaClient({datasources:{db:{url:'postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test'}}});
 try{await db.$transaction(async tx=>{
  const scope=new Proxy(tx,{get:(t,k)=>k==='$transaction'?fn=>fn(tx):t[k]});
  const p=await tx.prospect.create({data:{placeId:'setup-'+Date.now(),name:'Existing company',email:'office@example.test',emailInboxSelected:true}});
  const msg=await tx.outreachMessage.create({data:{prospectId:p.id,lane:'EMAIL',state:'QUEUED',subject:'Keep original',body:'Keep original body'}});
  const batchPrefix='setup-batch-'+Date.now()+'-';
  await tx.prospect.createMany({data:Array.from({length:501},(_,i)=>({placeId:batchPrefix+i,name:'Historical company '+i}))});
  const args={sender:'Russ Wright <russ@visionairy.biz>',replyTo:'russ@reply.visionairy.biz'};
  const result=await applyProductSetup(scope,args);assert.equal(result.after.historicalCompaniesToAssociate,0);
  assert.equal(await tx.productProspect.count({where:{productId:'visionairy',prospect:{placeId:{startsWith:batchPrefix}}}}),501);
  await tx.productProspect.create({data:{productId:'stockerai',prospectId:p.id}});
  assert.ok(await legacyClient(tx,{enabled:true}).prospect.findUnique({where:{id:p.id}}));
  assert.equal((await tx.prospect.findUnique({where:{id:p.id}})).emailInboxSelected,true);
  assert.deepEqual(await tx.outreachMessage.findUnique({where:{id:msg.id}}),msg);
  assert.equal((await tx.cRMProduct.findUnique({where:{id:'stockerai'}})).sendingEnabled,false);
  assert.equal(await tx.productRecipient.count({where:{productId:'stockerai'}}),0);
  await applyProductSetup(scope,args);assert.equal(await tx.productSequence.count({where:{productId:'stockerai'}}),1);
  throw Error('ROLLBACK_SETUP');
 },{timeout:30000});}catch(e){if(e.message!=='ROLLBACK_SETUP')throw e;}finally{await db.$disconnect();}
});
