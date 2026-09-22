'use strict';
const DAYS=[1,4,9,16,25],DEMO='https://www.stocker-ai.com/demo';
function validateRow(row){
 if(!Array.isArray(row.evidenceFindingIds)||!row.evidenceFindingIds.length)throw Error(row.company?.name+' has no supporting website evidence');
 if(JSON.stringify(row.messages.map(message=>Number(message.touch)))!==JSON.stringify([1,2,3,4,5]))throw Error(row.company?.name+' has the wrong message order');
 if(JSON.stringify(row.messages.map(message=>Number(message.business_day)))!==JSON.stringify(DAYS))throw Error(row.company?.name+' has the wrong business-day cadence');
 for(const [index,message] of row.messages.entries()){
  const subject=String(message.subject||'').trim(),body=String(message.body||'').trim(),words=body.split(/\s+/).filter(Boolean).length;
  if(!subject||!body)throw Error(`${row.company?.name} message ${index+1} is empty`);
  if(words<75||words>210)throw Error(`${row.company?.name} message ${index+1} is outside the accepted length`);
  if(!body.includes(DEMO))throw Error(`${row.company?.name} message ${index+1} is missing the live demo`);
  if(/[‐‑‒–—−]/.test(subject+body)||/[\r\n]/.test(subject))throw Error(`${row.company?.name} message ${index+1} contains prohibited formatting`);
  if(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\[company email removed\]/i.test(body))throw Error(`${row.company?.name} message ${index+1} contains an email address or review placeholder`);
  if(/Russ Wright|Founder,? StockerAI|503-621-8000|russ@visionairy\.biz/i.test(body))throw Error(`${row.company?.name} message ${index+1} duplicates the delivery signature`);
 }
}
function validateBatch(batch){
 if(batch?.productId!=='stockerai'||!Array.isArray(batch.results)||!batch.results.length)throw Error('A generated StockerAI campaign batch is required');
 if(batch.completed!==batch.intended||batch.results.length!==batch.intended)throw Error('The generated campaign batch is incomplete');
 const keys=new Set();for(const row of batch.results){const key=row.prospectId+'|'+row.recipient?.recipientKey;if(keys.has(key))throw Error('The generated campaign batch has a duplicate recipient');keys.add(key);if(row.failures?.length)throw Error(row.company?.name+' has failed campaign checks');if(!Array.isArray(row.messages)||row.messages.length!==5)throw Error(row.company?.name+' does not have five messages');validateRow(row);}
 return batch.results.length;
}
async function applyBatch(db,batch){validateBatch(batch);
 return db.$transaction(async tx=>{
  const before={selected:await tx.productRecipient.count({where:{productId:'stockerai',selected:true}}),recipients:await tx.productRecipient.count({where:{productId:'stockerai'}}),campaigns:await tx.productEnrollment.count({where:{productId:'stockerai'}}),messages:await tx.productMessage.count({where:{productId:'stockerai'}})};
  if(before.recipients||before.campaigns||before.messages)throw Error('StockerAI already has prepared recipients, campaigns, or messages; audit before applying this batch');
  const sequenceIds=[...new Set(batch.results.map(row=>row.sequenceId))];if(sequenceIds.length!==1)throw Error('The batch must use one approved sequence');
  const sequence=await tx.productSequence.findFirst({where:{id:sequenceIds[0],productId:'stockerai',approvedAt:{not:null}}});if(!sequence||JSON.stringify(sequence.dayNumbers)!==JSON.stringify(DAYS)||!sequence.businessDaysOnly)throw Error('The approved StockerAI sequence changed');
  const memberships=await tx.productProspect.findMany({where:{id:{in:batch.results.map(row=>row.membershipId)},productId:'stockerai',archivedAt:null},include:{prospect:{include:{contacts:true}}}});const membershipById=new Map(memberships.map(item=>[item.id,item]));
  const allEvidenceIds=[...new Set(batch.results.flatMap(row=>row.evidenceFindingIds))];const findings=await tx.finding.findMany({where:{id:{in:allEvidenceIds},retiredAt:null},select:{id:true,prospectId:true}});const findingById=new Map(findings.map(item=>[item.id,item]));
  const addresses=[];const recipientRows=[];
  for(const row of batch.results){const membership=membershipById.get(row.membershipId);if(!membership||membership.prospectId!==row.prospectId)throw Error(row.company.name+' is no longer active in StockerAI');const prospect=membership.prospect;if(prospect.doNotContact||prospect.emailBouncedAt)throw Error(row.company.name+' is blocked for email');let contactId=null,currentEmail='';if(row.recipient.recipientKey==='inbox')currentEmail=String(prospect.emailManualValue||prospect.email||'').trim().toLowerCase();else if(row.recipient.recipientKey.startsWith('contact:')){contactId=row.recipient.recipientKey.slice('contact:'.length);const contact=prospect.contacts.find(item=>item.id===contactId&&!item.setAsideAt&&!item.bouncedAt);currentEmail=String(contact?.email||'').trim().toLowerCase();}else throw Error(row.company.name+' has an unknown recipient type');if(!currentEmail||currentEmail!==String(row.recipient.email||'').trim().toLowerCase())throw Error(row.company.name+' recipient details changed; review before preparing');for(const id of row.evidenceFindingIds){if(findingById.get(id)?.prospectId!==row.prospectId)throw Error(row.company.name+' supporting evidence changed');}addresses.push(currentEmail);recipientRows.push({membershipId:membership.id,productId:'stockerai',recipientKey:row.recipient.recipientKey,contactId,email:currentEmail,selected:false});}
  const stops=await tx.emailAddressStop.count({where:{email:{in:addresses}}});if(stops)throw Error('One or more StockerAI recipients became blocked; review before preparing');
  const recipients=await tx.productRecipient.createManyAndReturn({data:recipientRows,select:{id:true,membershipId:true,recipientKey:true}});const recipientByKey=new Map(recipients.map(item=>[item.membershipId+'|'+item.recipientKey,item]));
  const enrollments=await tx.productEnrollment.createManyAndReturn({data:batch.results.map(row=>({productId:'stockerai',recipientId:recipientByKey.get(row.membershipId+'|'+row.recipient.recipientKey).id,sequenceId:row.sequenceId})),select:{id:true,recipientId:true}});const enrollmentByRecipient=new Map(enrollments.map(item=>[item.recipientId,item]));
  const messageRows=[];for(const row of batch.results){const recipient=recipientByKey.get(row.membershipId+'|'+row.recipient.recipientKey),enrollment=enrollmentByRecipient.get(recipient.id);for(const message of row.messages)messageRows.push({productId:'stockerai',enrollmentId:enrollment.id,touch:Number(message.touch),subject:message.subject.trim(),body:message.body.trim(),evidenceFindingIds:row.evidenceFindingIds});}
  await tx.productMessage.createMany({data:messageRows});
  const after={selected:await tx.productRecipient.count({where:{productId:'stockerai',selected:true}}),recipients:await tx.productRecipient.count({where:{productId:'stockerai'}}),campaigns:await tx.productEnrollment.count({where:{productId:'stockerai'}}),messages:await tx.productMessage.count({where:{productId:'stockerai'}})};
  if(after.selected!==before.selected||after.recipients!==batch.intended||after.campaigns!==batch.intended||after.messages!==batch.intended*5)throw Error('Campaign completion audit failed; no changes were saved');
  return {before,after,intended:batch.intended};
 },{timeout:120000});
}
module.exports={validateBatch,validateRow,applyBatch};
