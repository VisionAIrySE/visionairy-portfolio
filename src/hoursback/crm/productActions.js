'use strict';
const crypto=require('node:crypto');
const E=require('./productEnrollment.js');
const M=require('./productMessages.js');
const R=require('./productReadiness.js');
async function checks(db,productId,ids){return Object.fromEntries((await R.loadCampaigns(db,productId,ids)).map(c=>[c.id,R.readiness(c)]));}
async function savedResponse(db,productId,prospectId,result){
 try{
  const campaigns=await db.productEnrollment.findMany({where:{productId,recipient:{membership:{prospectId}}},select:{id:true}});
  return {...result,readiness:await checks(db,productId,campaigns.map(c=>c.id))};
 }catch{return {...result,refresh:true,message:result.message+' Saved status could not be refreshed; reload to verify.'};}
}
// Random per server start; product-bound token prevents cross-site form submission.
const secret=crypto.randomBytes(32);
const formToken=productId=>crypto.createHmac('sha256',secret).update(String(productId)).digest('hex');
function validToken(productId,value) {
 if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)) return false;
 return crypto.timingSafeEqual(Buffer.from(value,'hex'),Buffer.from(formToken(productId),'hex'));
}
async function handleProductPost(db,{productId,action,form}) {
 if(!validToken(productId,form.csrf)) return {status:403,error:'This page has expired. Refresh before saving.'};
 try {
  const S=require('./productSales.js');
  const C=require('./productChannels.js');
  const context={productId,prospectId:form.prospectId};
  if(action==='company-channels') {await C.saveCompanyChannels(db,{...context,name:form.name,address:form.address,website:form.website,email:form.email,phone:form.phone,linkedInUrl:form.linkedInUrl,companyType:form.companyType});return {status:200,message:'Company details saved.',refresh:true};}
  if(action==='contact-channels') {await C.saveContactChannels(db,{...context,contactId:form.contactId,name:form.name,role:form.role,email:form.email,phone:form.phone,linkedIn:form.linkedIn});return {status:200,message:'Contact details saved.',refresh:true};}
  if(action==='contact-add') {await C.addContact(db,{...context,name:form.name,role:form.role,email:form.email,phone:form.phone,linkedIn:form.linkedIn});return {status:200,message:'Person added to this company.',refresh:true};}
  if(action==='linkedin-sent'||action==='linkedin-reply') {await C.recordLinkedIn(db,{...context,contactId:form.contactId,status:action==='linkedin-reply'?'REPLIED':'SENT',eventKey:form.eventKey});return {status:200,message:action==='linkedin-reply'?'LinkedIn reply saved. This person’s StockerAI email sequence is stopped.':'LinkedIn message marked sent.',eventKey:crypto.randomUUID(),refresh:true};}
  if(action==='activity') {await S.recordActivity(db,{...context,kind:form.kind,notes:form.notes,outcome:form.outcome,contactId:form.contactId||null,recipientId:form.recipientId||null,eventKey:form.eventKey,...(form.occurredAt?{occurredAt:form.occurredAt}:{})});return {status:200,message:'Activity saved.',refreshSales:true,eventKey:crypto.randomUUID()};}
  if(action==='next-action') {const n=await S.setNextAction(db,{...context,title:form.title,dueDate:form.dueDate});return {status:200,message:'Next action saved.',nextAction:n.title+' · due '+n.dueDate,refreshSales:true};}
  if(action==='complete-next-action') {await S.completeNextAction(db,{...context,expectedTitle:form.expectedTitle,expectedDate:form.expectedDate});return {status:200,message:'Next action completed.',nextAction:'No next action set.',refreshSales:true};}
  if(action==='sales-stage') {await S.setSalesStage(db,{...context,stage:form.stage});return {status:200,message:'Sales status saved.',refreshSales:true};}
  if(action==='task') {await S.addTask(db,{...context,title:form.title,dueDate:form.dueDate});return {status:200,message:'Task added.',refreshSales:true};}
  if(action==='complete-task') {await S.completeTask(db,{productId,taskId:form.taskId});return {status:200,message:'Task completed.',refreshSales:true};}
  if(action==='draft') {
   await M.saveProductDraft(db,{productId,enrollmentId:form.enrollmentId,touch:Number(form.touch),subject:form.subject,body:form.body,manual:true});
   try{
    const savedCount=await db.productMessage.count({where:{productId,enrollmentId:form.enrollmentId}});
    return {status:200,message:'Message saved.',savedCount,enrollmentId:form.enrollmentId,readiness:await checks(db,productId,[form.enrollmentId])};
   }catch{return {status:200,message:'Message saved. Reload to refresh its status.',refresh:true};}
  }
  if(action!=='choices') return {status:404,error:'Unknown action'};
  const saved=await E.saveRecipientChoices(db,{productId,prospectId:form.prospectId,contactIds:[].concat(form.contacts||[]),chooseInbox:form.inbox==='1'});
  const respond=result=>savedResponse(db,productId,form.prospectId,result);
  // Persist choices first. Preparation failure must never masquerade as failed saving.
  if(!saved.selected) return respond({status:200,selected:0,message:'Recipient choices saved. No recipients selected.'});
  try {
   const sequence=await db.productSequence.findFirst({where:{productId,approvedAt:{not:null}},orderBy:{version:'desc'}});
   if(!sequence) return respond({status:200,selected:saved.selected,message:'Recipient choices saved. An approved sequence is still needed.'});
   const recipients=await db.productRecipient.findMany({where:{productId,selected:true,membership:{prospectId:form.prospectId}},include:{enrollments:true}});
   let created=0;
   for(const recipient of recipients) {
    // Never auto-enroll an existing recipient into a new sequence version.
    if(recipient.enrollments.length) continue;
    await E.enrollRecipient(db,{productId,recipientId:recipient.id,sequenceId:sequence.id});created++;
   }
   return respond({status:200,selected:saved.selected,refresh:created>0,message:'Recipient choices saved.'+(created?' Draft sequences prepared; no emails sent.':'')});
  }catch{return respond({status:200,selected:saved.selected,message:'Recipient choices saved, but draft preparation needs review. No emails sent.'});}
 }catch(error){return {status:400,error:error.code?'Unable to save. Your changes remain on this page.':error.message};}
}
module.exports={formToken,validToken,handleProductPost};
