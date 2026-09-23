'use strict';
const crypto=require('node:crypto');
const P=require('./productPersonalization.js');

const clean=value=>String(value||'').trim();
function validEmail(value){const email=clean(value).toLowerCase();if(!email)return null;if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email address');return email;}
function validWebsite(value){const raw=clean(value);if(!raw)return null;if(raw.length>2048)throw new Error('Website address is too long');let url;try{url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);}catch{throw new Error('Enter a valid website address');}if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)throw new Error('Enter a valid public website address');url.hash='';return url.toString().replace(/\/$/,'');}
function short(value,label){const result=clean(value);if(result.length>200)throw new Error(label+' is too long');return result||null;}
function address(value){const result=clean(value);if(result.length>500)throw new Error('Address is too long');return result||null;}
function validPhone(value){
 const phone=clean(value);if(!phone)return null;
 if(phone.length>50||!/^[0-9+(). xext-]+$/i.test(phone))throw new Error('Enter a valid phone number');
 return phone;
}
function validLinkedIn(value,kind){
 const raw=clean(value);if(!raw)return null;
 let url;try{url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);}catch{throw new Error('Enter a valid LinkedIn address');}
 if(!/(^|\.)linkedin\.com$/i.test(url.hostname))throw new Error('Enter a LinkedIn address');
 const expected=kind==='person'?'/in/':'/company/';
 if(!url.pathname.toLowerCase().startsWith(expected))throw new Error(kind==='person'?'Use the person’s LinkedIn profile address':'Use the company’s LinkedIn page address');
 url.protocol='https:';url.search='';url.hash='';return url.toString().replace(/\/$/,'');
}
async function membershipFor(tx,productId,prospectId){
 const membership=await tx.productProspect.findUnique({where:{productId_prospectId:{productId,prospectId}}});
 if(!membership)throw new Error('Company does not belong to this product');return membership;
}
async function saveCompanyChannels(db,{productId,prospectId,name,address:street,website,email,phone,linkedInUrl}){
 const company=name===undefined?undefined:short(name,'Company name'),location=street===undefined?undefined:address(street),site=website===undefined?undefined:validWebsite(website),inbox=email===undefined?undefined:validEmail(email),normalizedPhone=validPhone(phone),linkedIn=validLinkedIn(linkedInUrl,'company');
 if(name!==undefined&&!company)throw new Error('Enter the company name');
 return db.$transaction(async tx=>{const m=await membershipFor(tx,productId,prospectId);
  await tx.prospect.update({where:{id:prospectId},data:{...(company===undefined?{}:{nameManualValue:company}),...(location===undefined?{}:{addressManualValue:location}),...(site===undefined?{}:{websiteManualValue:site}),...(inbox===undefined?{}:{emailManualValue:inbox}),phoneManualValue:normalizedPhone,linkedInUrl:linkedIn}});
  await tx.productActivity.create({data:{productId,membershipId:m.id,eventKey:crypto.randomUUID(),kind:'ACTION',notes:'Updated company contact details',occurredAt:new Date()}});
  return {name:company,address:location,website:site,email:inbox,phone:normalizedPhone,linkedInUrl:linkedIn};
 });
}
async function saveContactChannels(db,{productId,prospectId,contactId,name,role,email,phone,linkedIn}){
 const normalizedPhone=validPhone(phone),profile=validLinkedIn(linkedIn,'person');
 return db.$transaction(async tx=>{const m=await membershipFor(tx,productId,prospectId);
  const contact=await tx.contact.findFirst({where:{id:contactId,prospectId,setAsideAt:null}});if(!contact)throw new Error('Contact does not belong to this company');
  const data={phone:normalizedPhone,linkedIn:profile};
  if(name!==undefined)data.name=short(name,'Name');if(role!==undefined)data.role=short(role,'Role');if(email!==undefined)data.email=validEmail(email);
  if(name!==undefined&&!data.name)throw new Error('Enter the person’s name');
  await tx.contact.update({where:{id:contactId},data});
  if(name!==undefined)await P.syncDraftGreetings(tx,{productId,membershipId:m.id,contactIds:[contactId]});
  await tx.productActivity.create({data:{productId,membershipId:m.id,eventKey:crypto.randomUUID(),kind:'ACTION',contactId,notes:'Updated '+(contact.name||'contact')+' phone and LinkedIn details',occurredAt:new Date()}});
  return data;
 });
}
async function addContact(db,{productId,prospectId,name,role,email,phone,linkedIn}){
 const person=short(name,'Name');if(!person)throw new Error('Enter the person’s name');
 const data={prospectId,name:person,role:short(role,'Role'),email:validEmail(email),phone:validPhone(phone),linkedIn:validLinkedIn(linkedIn,'person'),source:'RUSS'};
 return db.$transaction(async tx=>{const m=await membershipFor(tx,productId,prospectId);const contact=await tx.contact.create({data});
  await tx.productActivity.create({data:{productId,membershipId:m.id,eventKey:crypto.randomUUID(),kind:'ACTION',contactId:contact.id,notes:'Added contact '+person,occurredAt:new Date()}});return contact;
 });
}
function linkedinDrafts(company,contact){
 const first=clean(contact?.name).split(/\s+/)[0]||'there';const business=clean(company?.name)||'your vending operation';
 const invite=`Hi ${first}, I built StockerAI to help vending operators shorten daily route picking with a voice-guided workflow on a phone. I would value your perspective on whether it could help ${business}. Open to connecting?`;
 const followUp=`Thanks for connecting, ${first}. StockerAI gives route pickers a voice-guided workflow on their phone so they can move through a route without repeatedly stopping to read a list and key in quantities. If you are open to it, I would be glad to show you a short demo and check whether it can work with the vending system or route report you already use. What system or report drives your picking today?`;
 return {invite,followUp};
}
async function recordLinkedIn(db,{productId,prospectId,contactId,status,eventKey}){
 if(!['SENT','REPLIED'].includes(status))throw new Error('Choose a LinkedIn activity');
 if(typeof eventKey!=='string'||!eventKey||eventKey.length>200)throw new Error('Activity identifier is required');
 return db.$transaction(async tx=>{const m=await membershipFor(tx,productId,prospectId);
  const contact=await tx.contact.findFirst({where:{id:contactId,prospectId,setAsideAt:null}});if(!contact?.name)throw new Error('Choose a named contact');
  const existing=await tx.productActivity.findUnique({where:{productId_eventKey:{productId,eventKey}}});
  if(existing){if(existing.membershipId!==m.id||existing.contactId!==contactId)throw new Error('Activity identifier belongs to another contact');return existing;}
  const when=new Date();const kind=status==='REPLIED'?'LINKEDIN_RESPONSE':'LINKEDIN_SENT';
  const activity=await tx.productActivity.create({data:{productId,membershipId:m.id,eventKey,kind,contactId,notes:status==='REPLIED'?'LinkedIn response received':'LinkedIn message sent',occurredAt:when}});
  if(status==='REPLIED'){
   const recipients=await tx.productRecipient.findMany({where:{productId,membershipId:m.id,contactId},select:{id:true}});const ids=recipients.map(r=>r.id);
   if(ids.length){await tx.productRecipient.updateMany({where:{productId,id:{in:ids},repliedAt:null},data:{repliedAt:when}});await tx.productEnrollment.updateMany({where:{productId,recipientId:{in:ids},stoppedAt:null},data:{state:'STOPPED',stoppedAt:when,stopReason:'LinkedIn response received'}});}
  }
  return activity;
 });
}
module.exports={validEmail,validWebsite,validPhone,validLinkedIn,saveCompanyChannels,saveContactChannels,addContact,linkedinDrafts,recordLinkedIn};
