'use strict';
const KINDS=new Set(['RESPONSE','CALL','ACTION','NOTE']);
function calendarDate(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Choose a date');
 const date=new Date(value+'T00:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('Invalid date');
 return date;
}
async function membershipFor(tx,productId,prospectId) {
 if(!productId||!prospectId)throw new Error('Product and company are required');
 const membership=await tx.productProspect.findUnique({where:{productId_prospectId:{productId,prospectId}}});
 if(!membership)throw new Error('Company does not belong to this product');
 return membership;
}
async function recordActivity(db,{productId,prospectId,kind,notes,outcome,contactId,recipientId,eventKey,occurredAt=new Date()}) {
 if(!KINDS.has(kind)||typeof notes!=='string'||!notes.trim())throw new Error('Choose an activity type and enter notes');
 if(typeof eventKey!=='string'||!eventKey||eventKey.length>200)throw new Error('Activity identifier is required');
 const when=new Date(occurredAt);if(!Number.isFinite(when.getTime()))throw new Error('Invalid activity time');
 if(kind==='CALL'&&(!outcome||typeof outcome!=='string'))throw new Error('Record the call outcome');
 return db.$transaction(async tx=>{
  const membership=await membershipFor(tx,productId,prospectId);
  const existing=await tx.productActivity.findUnique({where:{productId_eventKey:{productId,eventKey}}});
  if(existing){if(existing.membershipId!==membership.id)throw new Error('Activity identifier belongs to another company');return existing;}
  if(contactId&&!await tx.contact.findFirst({where:{id:contactId,prospectId}}))throw new Error('Contact does not belong to this company');
  if(recipientId&&!await tx.productRecipient.findFirst({where:{id:recipientId,productId,membershipId:membership.id}}))throw new Error('Recipient does not belong to this product and company');
  if(kind==='RESPONSE'&&!recipientId)throw new Error('Choose the recipient who replied');
  const result=await tx.productActivity.create({data:{productId,membershipId:membership.id,eventKey,kind,notes:notes.trim(),outcome:outcome||null,contactId:contactId||null,recipientId:recipientId||null,occurredAt:when}});
  if(kind==='RESPONSE') {
   await tx.productRecipient.updateMany({where:{id:recipientId,productId,repliedAt:null},data:{repliedAt:when}});
   await tx.productEnrollment.updateMany({where:{productId,recipientId,stoppedAt:null},data:{state:'STOPPED',stoppedAt:when,stopReason:'Reply received'}});
  }
  return result;
 });
}
async function setNextAction(db,{productId,prospectId,title,dueDate}) {
 if(typeof title!=='string'||!title.trim())throw new Error('Enter the next action');const date=calendarDate(dueDate);
 return db.$transaction(async tx=>{
  const membership=await membershipFor(tx,productId,prospectId);
  await tx.productProspect.update({where:{id:membership.id},data:{nextAction:title.trim(),nextActionDate:date}});
  await tx.productActivity.create({data:{productId,membershipId:membership.id,eventKey:require('node:crypto').randomUUID(),kind:'NEXT_ACTION_CHANGED',notes:JSON.stringify({before:{title:membership.nextAction,date:membership.nextActionDate},after:{title:title.trim(),date:dueDate}}),occurredAt:new Date()}});
  return {title:title.trim(),dueDate};
 });
}
async function addTask(db,{productId,prospectId,title,dueDate}) {
 if(typeof title!=='string'||!title.trim())throw new Error('Enter a task');const date=calendarDate(dueDate);
 return db.$transaction(async tx=>{const m=await membershipFor(tx,productId,prospectId);return tx.productTask.create({data:{productId,membershipId:m.id,title:title.trim(),dueDate:date}});});
}
async function completeTask(db,{productId,taskId}) {
 return db.$transaction(async tx=>{
  const task=await tx.productTask.findFirst({where:{id:taskId,productId}});if(!task)throw new Error('Task does not belong to this product');
  if(task.completedAt)return task;
  const when=new Date();
  const changed=await tx.productTask.updateMany({where:{id:taskId,productId,completedAt:null},data:{completedAt:when}});
  if(changed.count)await tx.productActivity.create({data:{productId,membershipId:task.membershipId,eventKey:'task-complete:'+task.id,kind:'ACTION',notes:task.title,occurredAt:when}});
  return tx.productTask.findUnique({where:{id:taskId}});
 });
}
async function dueWork(db,{productId,localDate}) {
 const date=calendarDate(localDate);
 if(!productId)throw new Error('Choose a product');
 const [tasks,nextActions]=await Promise.all([
  db.productTask.findMany({where:{productId,completedAt:null,dueDate:{lte:date},membership:{archivedAt:null}},orderBy:[{dueDate:'asc'},{id:'asc'}]}),
  db.productProspect.findMany({where:{productId,archivedAt:null,nextAction:{not:null},nextActionDate:{lte:date}},orderBy:[{nextActionDate:'asc'},{id:'asc'}]}),
 ]);
 return {tasks,nextActions};
}

async function completeNextAction(db,{productId,prospectId,expectedTitle,expectedDate}) {
 const due=calendarDate(expectedDate);
 return db.$transaction(async tx=>{
  const m=await membershipFor(tx,productId,prospectId);
  const changed=await tx.productProspect.updateMany({where:{id:m.id,productId,nextAction:expectedTitle,nextActionDate:due},data:{nextAction:null,nextActionDate:null}});
  if(!changed.count)throw new Error('The next action changed. Refresh before completing it.');
  await tx.productActivity.create({data:{productId,membershipId:m.id,eventKey:require('node:crypto').randomUUID(),kind:'ACTION',notes:'Completed next action: '+expectedTitle,occurredAt:new Date()}});
  return {title:null,dueDate:null};
 });
}
const SALES_STAGES=['NO_CONTACT','NEEDS_REVIEW','INITIAL_CONTACT','ACTIVE','IN_PROCESS','CUSTOMER','EXPANDED_CUSTOMER','DORMANT'];
async function setSalesStage(db,{productId,prospectId,stage}) {
 if(!SALES_STAGES.includes(stage))throw new Error('Choose a valid sales status');
 return db.$transaction(async tx=>{
  const m=await membershipFor(tx,productId,prospectId);
  await tx.productProspect.update({where:{id:m.id},data:{stage}});
  if(m.stage!==stage)await tx.productActivity.create({data:{productId,membershipId:m.id,eventKey:require('node:crypto').randomUUID(),kind:'STATUS_CHANGED',notes:m.stage+' to '+stage,occurredAt:new Date()}});
  return stage;
 });
}
module.exports={recordActivity,setNextAction,completeNextAction,setSalesStage,SALES_STAGES,addTask,completeTask,dueWork,calendarDate};
