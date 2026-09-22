'use strict';
const {address,receiveProductEvent}=require('./productMailEvents.js');
// True means the event belongs to the product path and must not also mutate
// the old company-wide reply fields. Unknown/ambiguous replies stay held.
async function dispatchProductEvent(db,event,eventId,{getReceived,forwardReceived}={}){
 if(event.type==='email.received'){
  const from=address(event.data?.from);
  if(!from)return {handled:false};
  const candidate=await db.productRecipient.findFirst({where:{email:from,enrollments:{some:{startedAt:{not:null}}}},select:{id:true}});
  if(!candidate)return {handled:false};
  const result=await receiveProductEvent(db,event,eventId,{getReceived});
  if(typeof forwardReceived!=='function')throw new Error('Reply forwarding is not configured');
  // Existing forwarding uses a provider idempotency key, including on retries.
  await forwardReceived(event);
  return {handled:true,state:result.state};
 }
 const id=event.data?.email_id;
 if(!id)return {handled:false};
 const known=await db.productMessage.findUnique({where:{providerMessageId:id},select:{id:true}});
 if(!known)return {handled:false};
 const result=await receiveProductEvent(db,event,eventId);
 return {handled:true,state:result.state};
}
async function sharedAddressHold(db,email){
 const normalized=String(email||'').trim().toLowerCase();if(!normalized)return null;
 const stop=await db.emailAddressStop.findUnique({where:{email:normalized}});
 if(stop)return 'address is blocked: '+stop.reason;
 const reply=await db.productMailEvent.findFirst({where:{fromAddress:normalized,eventType:'email.received',state:{in:['PENDING','UNMATCHED']}},select:{id:true}});
 return reply?'a received reply needs product review before more email can be sent':null;
}
module.exports={dispatchProductEvent,sharedAddressHold};
