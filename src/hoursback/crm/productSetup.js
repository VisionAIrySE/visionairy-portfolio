'use strict';
const {address}=require('./productMailEvents.js');
async function previewProductSetup(db){
 const [historical,alreadyVisionairy,alreadyStockerai,legacyMessages]=await Promise.all([
  db.prospect.count({where:{productMemberships:{none:{}}}}),
  db.productProspect.count({where:{productId:'visionairy'}}),
  db.productProspect.count({where:{productId:'stockerai'}}),
  db.outreachMessage.count()
 ]);
 return {historicalCompaniesToAssociate:historical,alreadyVisionairy,alreadyStockerai,legacyMessagesToPreserve:legacyMessages,sendingEnabled:false,recipientsSelected:0};
}
// Call only after the explicit production-data approval or on disposable data.
// This does not change a legacy selection, message, schedule or delivery row.
async function applyProductSetup(db,{sender,replyTo}){
 if(address(sender)!=='russ@visionairy.biz'||!address(replyTo))throw new Error('Use Russ’s approved sender and the existing monitored reply address');
 return db.$transaction(async tx=>{
  const before=await previewProductSetup(tx);
  await tx.cRMProduct.upsert({where:{id:'visionairy'},create:{id:'visionairy',name:'VisionAIry'},update:{}});
  // Backfill historical memberships BEFORE attaching StockerAI. Otherwise an
  // existing VisionAIry company would incorrectly become StockerAI-only.
  const historical=await tx.prospect.findMany({where:{productMemberships:{none:{}}},select:{id:true,stage:true,nextAction:true,nextActionDate:true}});
  // Bound database statement size for the existing 32,000+ company backlog.
  // These chunks share one transaction: an audit failure rolls all of them back.
  for(let offset=0;offset<historical.length;offset+=500){
   await tx.productProspect.createMany({data:historical.slice(offset,offset+500).map(p=>({productId:'visionairy',prospectId:p.id,stage:p.stage,nextAction:p.nextAction,nextActionDate:p.nextActionDate})),skipDuplicates:true});
  }
  await tx.cRMProduct.upsert({where:{id:'stockerai'},create:{id:'stockerai',name:'StockerAI',senderEmail:'russ@visionairy.biz',replyToEmail:address(replyTo),timeZone:'America/Los_Angeles',localSendTime:'10:00',sendingEnabled:false},update:{}});
  await tx.productSequence.upsert({where:{productId_version:{productId:'stockerai',version:1}},create:{productId:'stockerai',version:1,dayNumbers:[1,4,9,16,25],businessDaysOnly:true,approvedAt:new Date('2026-09-21T00:00:00Z')},update:{}});
  const after=await previewProductSetup(tx);
  if(after.historicalCompaniesToAssociate!==0||after.legacyMessagesToPreserve!==before.legacyMessagesToPreserve)throw new Error('Setup audit failed; no changes were saved');
  return {before,after};
 },{timeout:120000});
}
module.exports={previewProductSetup,applyProductSetup};
