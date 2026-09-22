const {test}=require('node:test');const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const R=require('../src/hoursback/crm/productReadiness.js');const D=require('../src/hoursback/crm/productDelivery.js');const E=require('../src/hoursback/crm/productMailEvents.js');
async function scenario(work){
 const db=new PrismaClient({datasources:{db:{url:'postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test'}}});
 try{await db.$transaction(async tx=>{
  const scope=new Proxy(tx,{get:(t,k)=>k==='$transaction'?fn=>fn(tx):t[k]});
  const product=await tx.cRMProduct.create({data:{id:'stockerai',name:'StockerAI',sendingEnabled:true,senderEmail:'russ@example.test',replyToEmail:'reply@example.test',senderVerifiedAt:new Date(),replyRouteVerifiedAt:new Date(),signatureText:'Russ, StockerAI',timeZone:'America/Los_Angeles',localSendTime:'10:00'}});
  const p=await tx.prospect.create({data:{placeId:'delivery-'+Date.now(),name:'Test Operator',email:'office@example.test'}});
  const reading=await tx.reading.create({data:{prospectId:p.id,source:'website',reader:'understand-businesses',readerVersion:'test',outcome:'read',finishedAt:new Date(),pages:{create:{url:'https://example.test',text:'We run vending routes.',bytes:22}}}});
  const finding=await tx.finding.create({data:{prospectId:p.id,readingId:reading.id,field:'theirWork',value:'vending routes',status:'observed',url:'https://example.test',quote:'We run vending routes.'}});
  const member=await tx.productProspect.create({data:{productId:product.id,prospectId:p.id}});
  const recipient=await tx.productRecipient.create({data:{productId:product.id,membershipId:member.id,recipientKey:'inbox',email:p.email,selected:true}});
  const sequence=await tx.productSequence.create({data:{productId:product.id,version:1,dayNumbers:[1,4,9,16,25],businessDaysOnly:true,approvedAt:new Date()}});
  const campaign=await tx.productEnrollment.create({data:{productId:product.id,recipientId:recipient.id,sequenceId:sequence.id}});
  await tx.productMessage.createMany({data:[1,2,3,4,5].map(t=>({productId:product.id,enrollmentId:campaign.id,touch:t,subject:'Picking report '+t,body:'Try StockerAI for your vending routes: https://www.stocker-ai.com/demo',evidenceFindingIds:[finding.id]}))});
  await work({tx,scope,product,p,member,recipient,campaign});throw new Error('ROLLBACK_DELIVERY');
 },{timeout:20000});}catch(e){if(e.message!=='ROLLBACK_DELIVERY')throw e;}finally{await db.$disconnect();}
}
test('readiness blocks missing evidence and changes; business-day delivery sends once and preserves payload',()=>scenario(async({tx,scope,campaign,recipient})=>{
 const args={productId:'stockerai',enrollmentId:campaign.id};
 assert.equal(R.readiness(await R.loadCampaign(tx,'stockerai',campaign.id)).ready,true);
 await D.releaseCampaign(scope,{...args,firstLocalDate:'2026-09-21',now:new Date('2026-09-21T16:00:00Z')});
 let calls=0;const send=async payload=>{calls++;assert.match(payload.html,/<p>/);assert.equal(payload.reply_to,'reply@example.test');return {id:'provider-'+calls};};
 await D.attemptCampaign(scope,{...args,send,now:new Date('2026-09-21T16:59:00Z')});assert.equal(calls,0);
 await D.attemptCampaign(scope,{...args,send,now:new Date('2026-09-21T17:00:00Z')});assert.equal(calls,1);
 await D.attemptCampaign(scope,{...args,send,now:new Date('2026-09-21T18:00:00Z')});assert.equal(calls,1);
 await D.attemptCampaign(scope,{...args,send,now:new Date('2026-09-26T17:00:00Z')});assert.equal(calls,1);
 await tx.productRecipient.update({where:{id:recipient.id},data:{selected:false}});
 const blocked=await D.attemptCampaign(scope,{...args,send,now:new Date('2026-09-28T17:00:00Z')});assert.ok(blocked.held);assert.equal(calls,1);
 await tx.productRecipient.update({where:{id:recipient.id},data:{selected:true}});
 await tx.productMessage.updateMany({where:{enrollmentId:campaign.id,touch:2},data:{evidenceFindingIds:[]}});
 assert.equal(R.readiness(await R.loadCampaign(tx,'stockerai',campaign.id)).ready,false);
}));
test('uncertain provider outcome is held rather than retried',()=>scenario(async({scope,campaign})=>{
 const args={productId:'stockerai',enrollmentId:campaign.id,now:new Date('2026-09-21T17:00:00Z')};
 await D.releaseCampaign(scope,{...args,firstLocalDate:'2026-09-21'});let calls=0;
 const send=async()=>{calls++;throw new Error('timeout');};
 assert.ok((await D.attemptCampaign(scope,{...args,send})).unconfirmed);
 await D.attemptCampaign(scope,{...args,send,now:new Date('2026-09-22T17:00:00Z')});assert.equal(calls,1);
}));
test('reply event is idempotent, records history and stops only matched campaign',()=>scenario(async({tx,scope,campaign,p})=>{
 await tx.productEnrollment.update({where:{id:campaign.id},data:{startedAt:new Date()}});
 const event={type:'email.received',data:{email_id:'inbound-1',from:'Operator <office@example.test>',to:['reply@example.test'],subject:'Interested',text:'Please show me the demo'}};
 await E.receiveProductEvent(scope,event,'event-1');await E.receiveProductEvent(scope,event,'event-1');
 assert.equal(await tx.productActivity.count({where:{eventKey:'provider:event-1'}}),1);
 assert.equal((await tx.productEnrollment.findUnique({where:{id:campaign.id}})).state,'STOPPED');
 assert.equal((await tx.prospect.findUnique({where:{id:p.id}})).repliedAt,null);
 const unmatched=await E.receiveProductEvent(scope,{...event,data:{...event.data,to:['other@example.test']}},'event-2');assert.equal(unmatched.state,'UNMATCHED');
}));


test('bounce blocks shared address and automatic reply does not stop campaign',()=>scenario(async({tx,scope,campaign,recipient,p})=>{
 await tx.productEnrollment.update({where:{id:campaign.id},data:{startedAt:new Date()}});
 const automatic=await E.receiveProductEvent(scope,{type:'email.received',data:{from:recipient.email,to:['reply@example.test'],subject:'Out of office'}},'auto-event');
 assert.equal(automatic.state,'AUTOMATIC');
 assert.equal((await tx.productEnrollment.findUnique({where:{id:campaign.id}})).stoppedAt,null);
 await tx.productMessage.update({where:{enrollmentId_touch:{enrollmentId:campaign.id,touch:1}},data:{providerMessageId:'bounce-id'}});
 await E.receiveProductEvent(scope,{type:'email.bounced',data:{email_id:'bounce-id'}},'bounce-event');
 assert.ok(await tx.emailAddressStop.findUnique({where:{email:recipient.email}}));
 assert.ok((await tx.prospect.findUnique({where:{id:p.id}})).emailBouncedAt);
 assert.equal(R.readiness(await R.loadCampaign(tx,'stockerai',campaign.id)).ready,false);
}));

test('legacy delivery history prevents guessing which product received a reply',()=>scenario(async({tx,scope,campaign,recipient,p})=>{
 await tx.productEnrollment.update({where:{id:campaign.id},data:{startedAt:new Date()}});
 await tx.outreachMessage.create({data:{prospectId:p.id,lane:'EMAIL',state:'SENT',body:'Legacy message',sentTo:recipient.email,sentAt:new Date()}});
 const event=await E.receiveProductEvent(scope,{type:'email.received',data:{from:recipient.email,to:['reply@example.test'],subject:'Tell me more'}},'ambiguous-event');
 assert.equal(event.state,'UNMATCHED');assert.match(event.note,/VisionAIry/);
 assert.ok(R.readiness(await R.loadCampaign(tx,'stockerai',campaign.id)).reasons.some(r=>r.includes('reply needs review')));
 assert.equal(await tx.productActivity.count({where:{eventKey:'provider:ambiguous-event'}}),0);
}));

test('cohort audit accounts for missing, due, sent and uncertain campaigns without silent retries',()=>scenario(async({scope,campaign})=>{
 const A=require('../src/hoursback/crm/productAudit.js');
 const args={productId:'stockerai',enrollmentIds:[campaign.id,'missing'],now:new Date('2026-09-21T17:00:00Z')};
 let audit=await A.auditCohort(scope,args);assert.equal(audit[0].status,'NOT_RELEASED');assert.equal(audit[1].status,'MISSING');
 await D.releaseCampaign(scope,{productId:'stockerai',enrollmentId:campaign.id,firstLocalDate:'2026-09-21',now:args.now});
 let calls=0;const report=await A.runCohort(scope,{...args,send:async()=>{calls++;return {id:'audit-send'};}});
 assert.equal(calls,1);assert.equal(report.intended,2);assert.equal(report.before[0].status,'DUE');assert.equal(report.after[0].status,'WAITING');assert.equal(report.unresolved.length,1);
 const repeat=await A.runCohort(scope,{...args,send:async()=>{calls++;return {id:'wrong'};}});assert.equal(calls,1);assert.equal(repeat.outcomes.length,0);
}));

test('exact reply thread overrides ambiguous shared sender history',()=>scenario(async({tx,scope,campaign,recipient,p})=>{
 await tx.productEnrollment.update({where:{id:campaign.id},data:{startedAt:new Date()}});
 await tx.productMessage.update({where:{enrollmentId_touch:{enrollmentId:campaign.id,touch:1}},data:{rfcMessageId:'<stock-thread@example.test>'}});
 await tx.outreachMessage.create({data:{prospectId:p.id,lane:'EMAIL',state:'SENT',body:'Legacy message',sentTo:recipient.email,sentAt:new Date()}});
 const event=await E.receiveProductEvent(scope,{type:'email.received',data:{email_id:'received-test',from:recipient.email,to:['reply@example.test'],subject:'Interested'}},'exact-reply',{getReceived:async()=>({text:'Please show me StockerAI',headers:{'In-Reply-To':'<stock-thread@example.test>'}})});
 assert.equal(event.state,'PROCESSED');assert.equal(event.textBody,'Please show me StockerAI');assert.equal((await tx.prospect.findUnique({where:{id:p.id}})).repliedAt,null);
}));
