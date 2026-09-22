const {test}=require('node:test');const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');const S=require('../src/hoursback/crm/productSales.js');
test('responses, calls, tasks and follow-up dates remain product-specific',async()=>{
 const db=new PrismaClient({datasources:{db:{url:'postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test'}}});
 try{await db.$transaction(async tx=>{
  const scope=new Proxy(tx,{get:(t,k)=>k==='$transaction'?fn=>fn(tx):t[k]});const id=String(Date.now());
  const prospect=await tx.prospect.create({data:{placeId:'sales-'+id,name:'Shared test company',nextAction:'Legacy follow-up'}});
  const rows=[];
  for(const prefix of ['vision','stock']){
   const product=await tx.cRMProduct.create({data:{id:prefix+id,name:prefix}});
   const member=await tx.productProspect.create({data:{productId:product.id,prospectId:prospect.id}});
   const recipient=await tx.productRecipient.create({data:{productId:product.id,membershipId:member.id,recipientKey:'inbox',email:'shared@example.test',selected:true}});
   const sequence=await tx.productSequence.create({data:{productId:product.id,version:1,dayNumbers:[1,4],businessDaysOnly:true}});
   const enrollment=await tx.productEnrollment.create({data:{productId:product.id,recipientId:recipient.id,sequenceId:sequence.id}});
   rows.push({product,member,recipient,enrollment});
  }
  const [a,b]=rows;const base={productId:b.product.id,prospectId:prospect.id};
  await S.setNextAction(scope,{...base,title:'Discuss StockerAI demo',dueDate:'2026-09-24'});
  assert.equal((await tx.productProspect.findUnique({where:{id:a.member.id}})).nextAction,null);
  assert.equal((await tx.prospect.findUnique({where:{id:prospect.id}})).nextAction,'Legacy follow-up');
  const call=await S.recordActivity(scope,{...base,kind:'CALL',outcome:'Left voicemail',notes:'Asked for a callback',eventKey:'call1'});
  assert.equal((await S.recordActivity(scope,{...base,kind:'CALL',outcome:'Left voicemail',notes:'Asked for a callback',eventKey:'call1'})).id,call.id);
  await assert.rejects(S.recordActivity(scope,{...base,kind:'RESPONSE',recipientId:a.recipient.id,notes:'Wrong scope',eventKey:'wrong'}),/does not belong/);
  await S.recordActivity(scope,{...base,kind:'RESPONSE',recipientId:b.recipient.id,notes:'Interested in a demo',eventKey:'reply1'});
  assert.equal((await tx.productEnrollment.findUnique({where:{id:b.enrollment.id}})).state,'STOPPED');
  assert.equal((await tx.productEnrollment.findUnique({where:{id:a.enrollment.id}})).state,'DRAFT');
  assert.equal((await tx.prospect.findUnique({where:{id:prospect.id}})).repliedAt,null);
  const task=await S.addTask(scope,{...base,title:'Call back',dueDate:'2026-09-22'});
  const due=await S.dueWork(tx,{productId:b.product.id,localDate:'2026-09-24'});
  assert.equal(due.tasks.length,1);assert.equal(due.nextActions.length,1);
  assert.equal((await S.dueWork(tx,{productId:a.product.id,localDate:'2026-09-24'})).tasks.length,0);
  await assert.rejects(S.completeTask(scope,{productId:a.product.id,taskId:task.id}),/does not belong/);
  await S.completeTask(scope,{productId:b.product.id,taskId:task.id});
  await S.completeTask(scope,{productId:b.product.id,taskId:task.id});
  assert.equal(await tx.productActivity.count({where:{productId:b.product.id,eventKey:'task-complete:'+task.id}}),1);
  assert.equal((await S.dueWork(tx,{productId:b.product.id,localDate:'2026-09-24'})).tasks.length,0);
  await S.setSalesStage(scope,{...base,stage:'ACTIVE'});
  assert.equal((await tx.productProspect.findUnique({where:{id:a.member.id}})).stage,'NO_CONTACT');
  await assert.rejects(S.completeNextAction(scope,{...base,expectedTitle:'Old action',expectedDate:'2026-09-24'}),/changed/);
  await S.completeNextAction(scope,{...base,expectedTitle:'Discuss StockerAI demo',expectedDate:'2026-09-24'});
  assert.equal((await tx.productProspect.findUnique({where:{id:b.member.id}})).nextAction,null);
  assert.throws(()=>S.calendarDate('2026-02-30'),/Invalid date/);
  throw new Error('ROLLBACK_SALES');
 },{timeout:20000});}catch(e){if(e.message!=='ROLLBACK_SALES')throw e;}finally{await db.$disconnect();}
});
