'use strict';
const E=require('./productEnrollment.js');const M=require('./productMessages.js');
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
 return db.$transaction(async tx=>{const scope=new Proxy(tx,{get:(target,key)=>key==='$transaction'?fn=>fn(tx):target[key]});
  const before={selected:await tx.productRecipient.count({where:{productId:'stockerai',selected:true}}),recipients:await tx.productRecipient.count({where:{productId:'stockerai'}}),campaigns:await tx.productEnrollment.count({where:{productId:'stockerai'}}),messages:await tx.productMessage.count({where:{productId:'stockerai'}})};
  if(before.campaigns||before.messages)throw Error('StockerAI already has prepared campaigns or messages; audit before applying this batch');
  for(const row of batch.results){const prepared=await E.prepareRecipientCampaign(scope,{productId:'stockerai',prospectId:row.prospectId,recipientKey:row.recipient.recipientKey,sequenceId:row.sequenceId});
   for(const message of row.messages)await M.saveProductDraft(scope,{productId:'stockerai',enrollmentId:prepared.enrollment.id,touch:Number(message.touch),subject:message.subject,body:message.body,evidenceFindingIds:row.evidenceFindingIds,manual:false});
  }
  const after={selected:await tx.productRecipient.count({where:{productId:'stockerai',selected:true}}),recipients:await tx.productRecipient.count({where:{productId:'stockerai'}}),campaigns:await tx.productEnrollment.count({where:{productId:'stockerai'}}),messages:await tx.productMessage.count({where:{productId:'stockerai'}})};
  if(after.selected!==before.selected||after.campaigns!==batch.intended||after.messages!==batch.intended*5)throw Error('Campaign completion audit failed; no changes were saved');
  return {before,after,intended:batch.intended};
 },{timeout:120000});
}
module.exports={validateBatch,validateRow,applyBatch};
