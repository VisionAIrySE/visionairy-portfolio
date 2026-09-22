'use strict';
const R=require('./productReadiness.js');
const D=require('./productDelivery.js');
// Both audits use the same explicit cohort. This module never selects recipients,
// creates campaigns, releases campaigns, or configures a live provider.
async function auditCohort(db,{productId,enrollmentIds,now=new Date()}){
 if(!productId||!Array.isArray(enrollmentIds)||new Set(enrollmentIds).size!==enrollmentIds.length)throw new Error('Choose a product and unique campaign IDs');
 const campaigns=await R.loadCampaigns(db,productId,enrollmentIds);
 const found=new Map(campaigns.map(c=>[c.id,c]));
 return enrollmentIds.map(id=>{
  const c=found.get(id);if(!c)return {id,status:'MISSING',reasons:['Campaign was not found in this product']};
  const check=R.readiness(c);
  const uncertain=c.messages.filter(m=>['ATTEMPTING','UNCONFIRMED'].includes(m.deliveryState));
  if(uncertain.length)return {id,status:'UNCERTAIN',messageIds:uncertain.map(m=>m.id),reasons:['Delivery outcome must be reconciled before retry']};
  if(c.stoppedAt||c.recipient.repliedAt||c.recipient.membership.archivedAt)return {id,status:'STOPPED',reasons:check.reasons};
  if(c.messages.length===c.sequence.dayNumbers.length&&c.messages.every(m=>m.deliveryState==='SENT'&&m.providerMessageId&&m.sentAt))return {id,status:'COMPLETE',reasons:[]};
  if(!check.ready)return {id,status:'BLOCKED',reasons:check.reasons};
  if(!c.releasedAt)return {id,status:'NOT_RELEASED',reasons:['Campaign has not been released']};
  const due=D.dueMessage(c,now);
  return {id,status:due?'DUE':'WAITING',...(due?{messageId:due.id}:{}),reasons:[]};
 });
}
async function runCohort(db,{productId,enrollmentIds,send,now=new Date()}){
 if(typeof send!=='function')throw new Error('An explicitly configured sender is required');
 const before=await auditCohort(db,{productId,enrollmentIds,now});
 const run=await db.productSendRun.create({data:{productId,startedAt:now,enrollmentIds,before}});
 const outcomes=[];
 for(const item of before.filter(x=>x.status==='DUE')){
  try{outcomes.push({id:item.id,...await D.attemptCampaign(db,{productId,enrollmentId:item.id,send,now})});}
  catch{outcomes.push({id:item.id,error:'Processing failed; inspect saved state before retrying'});}
 }
 try{
  const after=await auditCohort(db,{productId,enrollmentIds,now});
  const unresolved=after.filter(x=>['MISSING','UNCERTAIN','BLOCKED','DUE','NOT_RELEASED'].includes(x.status));
  await db.productSendRun.update({where:{id:run.id},data:{finishedAt:new Date(),state:unresolved.length?'NEEDS_REVIEW':'AUDITED',after,outcomes}});
  return {runId:run.id,productId,intended:enrollmentIds.length,before,outcomes,after,unresolved};
 }catch(error){
  await db.productSendRun.update({where:{id:run.id},data:{state:'AUDIT_FAILED',outcomes,error:'Final state could not be audited; inspect before retrying'}});
  throw error;
 }
}
module.exports={auditCohort,runCohort};
