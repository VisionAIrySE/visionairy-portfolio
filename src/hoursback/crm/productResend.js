'use strict';
const {resendJson}=require('./resendReplies.js');
function resendProvider({apiKey,inboundKey=apiKey,fetchImpl=fetch}={}){
 if(!apiKey)throw new Error('Resend sending key is not configured');
 return {
  async send({idempotencyKey,...payload}){
   if(!idempotencyKey)throw new Error('An email delivery key is required');
   const result=await resendJson('https://api.resend.com/emails',apiKey,{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify(payload)},fetchImpl);
   if(!result?.id)throw new Error('Resend did not confirm an email ID');
   // Delivery was accepted even if the subsequent read fails. Never resend it.
   try{const detail=await resendJson('https://api.resend.com/emails/'+encodeURIComponent(result.id),apiKey,{},fetchImpl);return {...result,message_id:detail.message_id||null};}
   catch{return result;}
  },
  async received(id){
   if(!inboundKey||!id)throw new Error('Resend reply retrieval is not configured');
   return resendJson('https://api.resend.com/emails/receiving/'+encodeURIComponent(id),inboundKey,{},fetchImpl);
  }
 };
}
module.exports={resendProvider};
