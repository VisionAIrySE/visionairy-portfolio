'use strict';
const P=require('./productPersonalization.js');
const Q=require('./productMessageQuality.js');
const norm=v=>String(v||'').trim().toLowerCase();
const validEmail=v=>/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(String(v||''));
const localClock=(now,timeZone)=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return {date:values.year+'-'+values.month+'-'+values.day,time:values.hour+':'+values.minute};
};
const prospectInclude={
  contacts:true,
  readings:{where:{source:'website',reader:'understand-businesses',outcome:'read',finishedAt:{not:null},OR:[{note:null},{NOT:{note:{startsWith:'not their site'}}}],pages:{some:{bytes:{gt:0},OR:[{text:{not:null}},{sameAs:{not:null}}]}}},select:{id:true}},
  findings:{where:{retiredAt:null,status:{in:['observed','confirmed']}},select:{id:true,readingId:true,url:true,quote:true}}
 };

async function loadCampaign(db,productId,enrollmentId) {
 if(!productId||!enrollmentId)throw new Error('Product and campaign are required');
 return (await loadCampaigns(db,productId,[enrollmentId]))[0]||null;
}
async function loadCampaigns(db,productId,ids){
 if(!productId||!Array.isArray(ids))throw new Error('Product and campaign IDs are required');
 const campaigns=await db.productEnrollment.findMany({
  where:{id:{in:ids},productId},
  include:{sequence:{include:{product:true}},messages:{orderBy:{touch:'asc'}},recipient:{include:{membership:{include:{prospect:{include:prospectInclude}}}}}}
 });
 const stops=await db.emailAddressStop.findMany({where:{email:{in:campaigns.map(c=>norm(c.recipient.email))}}});
 const byEmail=new Map(stops.map(s=>[s.email,s]));
 const unresolved=await db.productMailEvent.findMany({where:{fromAddress:{in:campaigns.map(c=>norm(c.recipient.email))},eventType:'email.received',state:{in:['PENDING','UNMATCHED']}},select:{fromAddress:true}});
 const held=new Set(unresolved.map(e=>e.fromAddress));
 return campaigns.map(c=>({...c,addressStop:byEmail.get(norm(c.recipient.email)),replyNeedsReview:held.has(norm(c.recipient.email))}));
}

function readiness(campaign) {
 if(!campaign)return {ready:false,contentReady:false,reasons:['Campaign does not belong to this product']};
 const reasons=[],config=[];const {recipient:r,sequence,messages}=campaign;const p=r.membership.prospect;const product=sequence.product;
 if(!r.selected)reasons.push('Recipient is not selected');
 if(r.repliedAt||campaign.stoppedAt)reasons.push('Campaign stopped after a reply or other recorded stop');
 if(r.membership.archivedAt)reasons.push('Company is archived for this product');
 if(p.doNotContact)reasons.push('Company is marked do not contact');
 if(campaign.replyNeedsReview)reasons.push('A received reply needs review before any further sending');
 if(campaign.addressStop)reasons.push('Email address is blocked: '+campaign.addressStop.reason);
 if(!validEmail(r.email))reasons.push('Recipient email is missing or invalid');
 const selectedContact=r.contactId?p.contacts.find(c=>c.id===r.contactId):null;
 if(r.contactId){if(!selectedContact||selectedContact.setAsideAt||selectedContact.bouncedAt||norm(selectedContact.email)!==norm(r.email))reasons.push('Contact address changed or is unavailable');}
 else if(p.emailBouncedAt||norm(p.emailManualValue||p.email)!==norm(r.email))reasons.push('Company inbox changed or has bounced');
 const recipientFirst=r.contactId?P.expectedFirstName(selectedContact):null;
 if(r.contactId&&!recipientFirst)reasons.push('Selected contact needs a usable first name');
 if(!p.readings.length)reasons.push('Full website research with saved pages is missing');
 const evidence=new Set(p.findings.filter(f=>p.readings.some(x=>x.id===f.readingId)&&f.url&&f.quote).map(f=>f.id));
 if(!sequence.approvedAt)reasons.push('Campaign sequence is not approved');
 if(messages.length!==sequence.dayNumbers.length)reasons.push('Campaign is missing one or more messages');
 for(let n=1;n<=sequence.dayNumbers.length;n++){
  const m=messages.find(m=>m.touch===n);if(!m)continue;
  if(!m.subject?.trim()||!m.body?.trim())reasons.push('Message '+n+' is empty');
  if(/[\r\n\u2014]/.test(m.subject)||/\u2014|<\/?[a-z][^>]*>|&lt;|\{\{|\[FIRST_NAME\]/i.test(m.body))reasons.push('Message '+n+' has a formatting or placeholder problem');
  const duplicate=Q.duplicateContentIssue(m.body);if(duplicate)reasons.push('Message '+n+' '+duplicate);
  if(recipientFirst&&!P.addressedTo(m.body,recipientFirst))reasons.push('Message '+n+' is not addressed to '+recipientFirst);
  if(!m.evidenceFindingIds.length||m.evidenceFindingIds.some(id=>!evidence.has(id)))reasons.push('Message '+n+' needs valid company evidence');
 }
 if(!product.sendingEnabled)config.push('Sending has not been enabled for this product');
 if(!product.senderVerifiedAt||!validEmail(product.senderEmail))config.push('Sender identity has not been verified');
 if(!product.replyRouteVerifiedAt||!validEmail(product.replyToEmail))config.push('Reply routing has not been verified');
 if(!product.signatureText?.trim())config.push('Product signature is not configured');
 try{if(!product.timeZone)throw Error();localClock(new Date(),product.timeZone);}catch{config.push('Sending timezone is not configured');}
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(product.localSendTime||''))config.push('Sending time is not configured');
 return {ready:!reasons.length&&!config.length,contentReady:!reasons.length,reasons:[...reasons,...config]};
}
module.exports={loadCampaigns,loadCampaign,readiness,localClock,norm,prospectInclude};
