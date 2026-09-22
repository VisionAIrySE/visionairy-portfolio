'use strict';
const R=require('./productReadiness.js');
const {looksAutomatic}=require('./mailEvents.js');
const {recordActivity}=require('./productSales.js');
const address=value=>{const m=String(value||'').match(/<?([^\s<>]+@[^\s<>]+)>?/);return m?R.norm(m[1]):null;};
async function receiveProductEvent(db,event,eventId,{getReceived}={}) {
 if(!eventId||typeof eventId!=='string')throw new Error('Missing verified event identifier');
 let data=event.data||{};const from=address(data.from);const to=[].concat(data.to||[]).map(address).filter(Boolean);
 await db.productMailEvent.upsert({where:{id:eventId},create:{id:eventId,eventType:event.type||'unknown',providerEmailId:data.email_id||null,fromAddress:from,toAddresses:to,subject:data.subject||null,textBody:data.text||null},update:{}});
 if(event.type==='email.received'&&getReceived){
  const full=await getReceived(data.email_id);
  // Envelope identity remains the signed webhook's identity.
  data={...data,text:full.text||null,headers:full.headers||{}};
  await db.productMailEvent.update({where:{id:eventId},data:{textBody:data.text}});
 }
 return db.$transaction(async tx=>{
  const stored=await tx.productMailEvent.findUnique({where:{id:eventId}});
  if(stored.state!=='PENDING')return stored;
  const finish=patch=>tx.productMailEvent.update({where:{id:eventId},data:patch});
  if(['email.sent','email.bounced','email.complained','email.delivered'].includes(event.type)){
   const message=data.email_id?await tx.productMessage.findUnique({where:{providerMessageId:data.email_id},include:{enrollment:{include:{recipient:true}}}}):null;
   if(!message)return finish({state:'UNMATCHED',note:'No product delivery matches this provider email ID'});
   if(data.message_id)await tx.productMessage.update({where:{id:message.id},data:{rfcMessageId:data.message_id}});
   const target=R.norm(message.enrollment.recipient.email);
   if(['email.bounced','email.complained'].includes(event.type)) {
    const reason=event.type==='email.bounced'?'Address bounced':'Spam complaint';
    await tx.emailAddressStop.upsert({where:{email:target},create:{email:target,reason},update:{reason}});
    await tx.productEnrollment.updateMany({where:{recipient:{email:{equals:target,mode:'insensitive'}},stoppedAt:null},data:{state:'STOPPED',stoppedAt:new Date(),stopReason:reason}});
    // Existing VisionAIry delivery checks already inspect these shared bounce fields.
    await tx.contact.updateMany({where:{email:{equals:target,mode:'insensitive'}},data:{bouncedAt:new Date()}});
    await tx.prospect.updateMany({where:{OR:[{email:{equals:target,mode:'insensitive'}},{emailManualValue:{equals:target,mode:'insensitive'}}]},data:{emailBouncedAt:new Date()}});
   }
   return finish({state:'PROCESSED',matchedProductId:message.productId,matchedRecipientId:message.enrollment.recipientId});
  }
  if(event.type!=='email.received')return finish({state:'IGNORED',note:'Event does not change campaign progress'});
  if(!from||!to.length)return finish({state:'UNMATCHED',note:'Reply addresses are missing'});
  const products=await tx.cRMProduct.findMany({where:{replyToEmail:{in:to},replyRouteVerifiedAt:{not:null}}});
  let recipients=await tx.productRecipient.findMany({where:{productId:{in:products.map(p=>p.id)},email:from,enrollments:{some:{startedAt:{not:null}}}},include:{membership:true}});
  const headers=Object.fromEntries(Object.entries(data.headers||{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
  const replyId=(headers['in-reply-to']||'').trim();
  let exact=false;
  if(replyId){
   const parent=await tx.productMessage.findUnique({where:{rfcMessageId:replyId},include:{enrollment:true}});
   if(parent){recipients=recipients.filter(r=>r.id===parent.enrollment.recipientId);exact=recipients.length===1;}
  }
  if(recipients.length!==1)return finish({state:'UNMATCHED',note:recipients.length?'Reply matches multiple campaigns; review required':'No sent campaign matches this reply route and sender'});
  const legacySent=await tx.outreachMessage.count({where:{lane:'EMAIL',sentAt:{not:null},sentTo:{equals:from,mode:'insensitive'}}});
  if(legacySent&&!exact)return finish({state:'UNMATCHED',note:'Sender also has VisionAIry delivery history; identify the replied-to message before assigning the product'});
  const r=recipients[0];
  if(looksAutomatic(data.subject)||(headers['auto-submitted']&&headers['auto-submitted'].toLowerCase()!=='no'))return finish({state:'AUTOMATIC',matchedProductId:r.productId,matchedRecipientId:r.id,note:'Automatic response saved; campaign not stopped'});
  const scope=new Proxy(tx,{get:(target,key)=>key==='$transaction'?fn=>fn(tx):target[key]});
  await recordActivity(scope,{productId:r.productId,prospectId:r.membership.prospectId,recipientId:r.id,eventKey:'provider:'+eventId,kind:'RESPONSE',notes:data.text||('Reply received: '+(data.subject||'(no subject)')+'. Full body has not yet been retrieved.')});
  return finish({state:'PROCESSED',matchedProductId:r.productId,matchedRecipientId:r.id,note:data.text?null:'Reply body retrieval still needed'});
 });
}
module.exports={receiveProductEvent,address};
