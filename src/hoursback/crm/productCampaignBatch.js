'use strict';
const E=require('./productEnrollment.js');const M=require('./productMessages.js');
function validateBatch(batch){
 if(batch?.productId!=='stockerai'||!Array.isArray(batch.results)||!batch.results.length)throw Error('A generated StockerAI campaign batch is required');
 if(batch.completed!==batch.intended||batch.results.length!==batch.intended)throw Error('The generated campaign batch is incomplete');
 const keys=new Set();for(const row of batch.results){const key=row.prospectId+'|'+row.recipient?.recipientKey;if(keys.has(key))throw Error('The generated campaign batch has a duplicate recipient');keys.add(key);if(row.failures?.length)throw Error(row.company?.name+' has failed campaign checks');if(!Array.isArray(row.messages)||row.messages.length!==5)throw Error(row.company?.name+' does not have five messages');}
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
module.exports={validateBatch,applyBatch};
