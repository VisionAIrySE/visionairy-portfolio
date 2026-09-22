'use strict';
const R=require('./productReadiness.js');
const {isBusinessDate}=require('./productSchedule.js');
const D=require('./productDelivery.js');
const {runCohort}=require('./productAudit.js');
async function scheduledProductRun(db,{productId,send,enabled=false,now=new Date()}){
 if(!enabled)return {paused:true,reason:'StockerAI scheduled sending has not been enabled'};
 if(productId!=='stockerai')throw new Error('The StockerAI scheduler requires its explicit product');
 const product=await db.cRMProduct.findUnique({where:{id:productId}});
 if(!product?.sendingEnabled)return {paused:true,reason:'Product sending is paused'};
 const clock=R.localClock(now,product.timeZone);
 // Render can invoke at both UTC offsets. Only the configured Pacific hour
 // proceeds, so daylight saving never moves the send to 9 or 11 AM.
 if(!isBusinessDate(clock.date)||clock.time.slice(0,2)!==product.localSendTime.slice(0,2)||clock.time<product.localSendTime)return {waiting:true};
 const campaigns=await db.productEnrollment.findMany({where:{productId,recipient:{selected:true,membership:{archivedAt:null}}},select:{id:true,state:true,startedAt:true,stoppedAt:true}});
 const enrollmentIds=campaigns.map(c=>c.id);
 const preparation=[];
 for(const campaign of campaigns.filter(c=>c.state==='DRAFT'&&!c.startedAt&&!c.stoppedAt)){
  const candidate=await R.loadCampaign(db,productId,campaign.id);const check=R.readiness(candidate);
  if(!check.ready){preparation.push({id:campaign.id,reasons:check.reasons});continue;}
  try{await D.releaseCampaign(db,{productId,enrollmentId:campaign.id,firstLocalDate:clock.date,now});}
  catch{preparation.push({id:campaign.id,reasons:['Campaign could not be released; inspect current state']});}
 }
 const missing=await db.productRecipient.findMany({where:{productId,selected:true,membership:{archivedAt:null},enrollments:{none:{}}},select:{id:true,membershipId:true}});
 const audit=await runCohort(db,{productId,enrollmentIds,send,now});
 if(missing.length)await db.productSendRun.update({where:{id:audit.runId},data:{state:'NEEDS_REVIEW',outcomes:[...audit.outcomes,...missing.map(r=>({recipientId:r.id,reason:'Selected recipient has no campaign'}))]}});
 return {...audit,preparation,selectedWithoutCampaign:missing};
}
module.exports={scheduledProductRun};
