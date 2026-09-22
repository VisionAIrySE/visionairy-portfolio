'use strict';
const R=require('./productReadiness.js');
const {stockerSchedule,isBusinessDate}=require('./productSchedule.js');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dueMessage(campaign,now) {
 const product=campaign.sequence.product;
 const clock=R.localClock(now,product.timeZone);
 if(!isBusinessDate(clock.date)||clock.time<product.localSendTime)return null;
 if(!campaign.releasedAt||!campaign.firstLocalDate)return null;
 if(campaign.productId!=='stockerai'||JSON.stringify(campaign.sequence.dayNumbers)!=='[1,4,9,16,25]')return null;
 const schedule=stockerSchedule(campaign.firstLocalDate);
 const messages=campaign.messages;
 if(messages.some(m=>m.sentAt&&R.localClock(new Date(m.sentAt),product.timeZone).date===clock.date))return null;
 for(const slot of schedule){
  const message=messages.find(m=>m.touch===slot.touch);
  if(!message)return null;
  if(message.deliveryState==='SENT'&&message.providerMessageId&&message.sentAt)continue;
  if(message.deliveryState!=='DRAFT')return null; // uncertain/failed/in-flight never retried blindly
  return slot.localDate<=clock.date?message:null;
 }
 return null;
}
async function releaseCampaign(db,{productId,enrollmentId,firstLocalDate,now=new Date()}) {
 if(!isBusinessDate(firstLocalDate))throw new Error('Choose a business day for the first email');
 return db.$transaction(async tx=>{
  const campaign=await R.loadCampaign(tx,productId,enrollmentId);const checked=R.readiness(campaign);
  if(!checked.ready)throw new Error(checked.reasons.join('; '));
  if(productId!=='stockerai')throw new Error('This release path is only for StockerAI');
  if(firstLocalDate<R.localClock(now,campaign.sequence.product.timeZone).date)throw new Error('Choose today or a future business day');
  if(campaign.state!=='DRAFT'||campaign.startedAt)throw new Error('Campaign has already started or been released');
  const result=await tx.productEnrollment.updateMany({where:{id:enrollmentId,productId,state:'DRAFT',releasedAt:null},data:{state:'RELEASED',releasedAt:now,firstLocalDate}});
  return {released:result.count===1};
 });
}
function payloadFor(campaign,message) {
 const product=campaign.sequence.product;
 const text=message.body.trim()+'\n\n'+product.signatureText.trim();
 return {from:product.senderEmail,to:campaign.recipient.email,reply_to:product.replyToEmail,subject:message.subject,text,html:'<div style="font-family:Arial,sans-serif;line-height:1.5">'+text.split(/\n\s*\n/).map(p=>'<p>'+esc(p).replace(/\n/g,'<br>')+'</p>').join('')+'</div>'};
}
async function attemptCampaign(db,{productId,enrollmentId,send,now=new Date()}) {
 if(typeof send!=='function')throw new Error('A configured provider is required');
 const claim=await db.$transaction(async tx=>{
  const campaign=await R.loadCampaign(tx,productId,enrollmentId);const check=R.readiness(campaign);
  if(!check.ready)return {held:check.reasons};
  const message=dueMessage(campaign,now);if(!message)return {held:['No message is due or an earlier delivery needs review']};
  const payload=payloadFor(campaign,message);const key='product-email:'+message.id;
  const updated=await tx.productMessage.updateMany({where:{id:message.id,productId,deliveryState:'DRAFT'},data:{deliveryState:'ATTEMPTING',attemptedAt:now,deliveryKey:key,deliveryPayload:payload}});
  return updated.count?{message,payload,key}:{held:['Another sender already claimed this message']};
 });
 if(claim.held)return claim;
 // Re-read selection/stops/evidence after the durable claim and immediately before provider call.
 const current=await R.loadCampaign(db,productId,enrollmentId);const checked=R.readiness(current);
 if(checked.ready){
  const currentMessage=current.messages.find(m=>m.id===claim.message.id);
  if(!currentMessage||JSON.stringify(payloadFor(current,currentMessage))!==JSON.stringify(claim.payload)){
   checked.ready=false;checked.reasons.push('Recipient, message or sender changed while preparing delivery; review before sending');
  }
 }
 if(!checked.ready){await db.productMessage.update({where:{id:claim.message.id},data:{deliveryState:'BLOCKED',deliveryError:checked.reasons.join('; ')}});return {held:checked.reasons};}
 try {
  const result=await send({...claim.payload,idempotencyKey:claim.key});
  if(!result?.id)throw new Error('Provider did not confirm an email identifier');
  await db.$transaction(async tx=>{
   await tx.productMessage.update({where:{id:claim.message.id},data:{deliveryState:'SENT',providerMessageId:result.id,rfcMessageId:result.message_id||null,sentAt:now}});
   const clock=R.localClock(now,current.sequence.product.timeZone);
   if(claim.message.touch===1)await tx.productEnrollment.updateMany({where:{id:enrollmentId,startedAt:null},data:{startedAt:now,firstLocalDate:clock.date}});
  });
  return {sent:claim.message.id,providerMessageId:result.id};
 }catch{
  await db.productMessage.updateMany({where:{id:claim.message.id,deliveryState:'ATTEMPTING'},data:{deliveryState:'UNCONFIRMED',deliveryError:'Provider outcome needs reconciliation before any retry'}});
  return {unconfirmed:claim.message.id};
 }
}
module.exports={dueMessage,releaseCampaign,attemptCampaign,payloadFor};
