'use strict';
const R=require('./productReadiness.js');
const D=require('./productDelivery.js');
const {resendProvider}=require('./productResend.js');

const TEST_TO='russ@visionairy.biz';
const PLACE_ID='stockerai-delivery-test-russ';
const SIGNATURE='Best regards,\n\nRuss Wright\nFounder, StockerAI\n503-621-8000\nruss@visionairy.biz\nhttps://www.stocker-ai.com/';

async function prepare(db){return db.$transaction(async tx=>{
 const product=await tx.cRMProduct.update({where:{id:'stockerai'},data:{sendingEnabled:true,senderEmail:'russ@visionairy.biz',replyToEmail:'russ@reply.visionairy.biz',senderVerifiedAt:new Date(),replyRouteVerifiedAt:new Date(),signatureText:SIGNATURE,timeZone:'America/Los_Angeles',localSendTime:'10:00'}});
 const prospect=await tx.prospect.upsert({where:{placeId:PLACE_ID},create:{placeId:PLACE_ID,name:'StockerAI delivery and reply test',email:TEST_TO,siteStatus:'READ',siteReadAt:new Date(),theirWork:'verify StockerAI email delivery and reply tracking'},update:{email:TEST_TO,doNotContact:false,emailBouncedAt:null}});
 const membership=await tx.productProspect.upsert({where:{productId_prospectId:{productId:'stockerai',prospectId:prospect.id}},create:{productId:'stockerai',prospectId:prospect.id},update:{archivedAt:null}});
 let reading=await tx.reading.findFirst({where:{prospectId:prospect.id,source:'website',reader:'understand-businesses',outcome:'read'}});
 if(!reading)reading=await tx.reading.create({data:{prospectId:prospect.id,source:'website',reader:'understand-businesses',readerVersion:'delivery-test',outcome:'read',finishedAt:new Date(),pages:{create:{url:'https://www.stocker-ai.com/',text:'StockerAI delivery and reply routing test record.',bytes:48}}}});
 let finding=await tx.finding.findFirst({where:{prospectId:prospect.id,readingId:reading.id,field:'theirWork',retiredAt:null}});
 if(!finding)finding=await tx.finding.create({data:{prospectId:prospect.id,readingId:reading.id,field:'theirWork',value:'verify StockerAI email delivery and reply tracking',status:'confirmed',url:'https://www.stocker-ai.com/',quote:'StockerAI delivery and reply routing test record.'}});
 const recipient=await tx.productRecipient.upsert({where:{membershipId_recipientKey:{membershipId:membership.id,recipientKey:'inbox'}},create:{productId:'stockerai',membershipId:membership.id,recipientKey:'inbox',email:TEST_TO,selected:true},update:{email:TEST_TO,selected:true,repliedAt:null}});
 const sequence=await tx.productSequence.findFirst({where:{productId:'stockerai',approvedAt:{not:null}},orderBy:{version:'desc'}});
 if(!sequence)throw Error('The approved StockerAI sequence is missing');
 const enrollment=await tx.productEnrollment.upsert({where:{recipientId_sequenceId:{recipientId:recipient.id,sequenceId:sequence.id}},create:{productId:'stockerai',recipientId:recipient.id,sequenceId:sequence.id},update:{}});
 if(enrollment.startedAt||enrollment.stoppedAt)throw Error('The StockerAI delivery test was already sent. It cannot be sent twice.');
 const bodies=[
  'Hi Russ,\n\nThis is the controlled StockerAI delivery and reply-routing test. It uses the same sender, reply address, rendering, signature, provider adapter, and saved delivery tracking planned for operator outreach. Please inspect the formatting and links, then reply with the words "StockerAI reply test." That reply should reach your normal inbox and automatically stop only this test campaign.\n\nLive demo: https://www.stocker-ai.com/demo',
  'Hi Russ,\n\nThis unsent test placeholder exists only so the temporary campaign has the approved five-message structure. It must never be delivered.\n\nLive demo: https://www.stocker-ai.com/demo',
  'Hi Russ,\n\nThis unsent test placeholder exists only so the temporary campaign has the approved five-message structure. It must never be delivered.\n\nLive demo: https://www.stocker-ai.com/demo',
  'Hi Russ,\n\nThis unsent test placeholder exists only so the temporary campaign has the approved five-message structure. It must never be delivered.\n\nLive demo: https://www.stocker-ai.com/demo',
  'Hi Russ,\n\nThis unsent test placeholder exists only so the temporary campaign has the approved five-message structure. It must never be delivered.\n\nLive demo: https://www.stocker-ai.com/demo'];
 for(let index=0;index<5;index++)await tx.productMessage.upsert({where:{enrollmentId_touch:{enrollmentId:enrollment.id,touch:index+1}},create:{productId:'stockerai',enrollmentId:enrollment.id,touch:index+1,subject:index===0?'StockerAI delivery and reply test':'StockerAI unsent test placeholder '+(index+1),body:bodies[index],evidenceFindingIds:[finding.id]},update:{subject:index===0?'StockerAI delivery and reply test':'StockerAI unsent test placeholder '+(index+1),body:bodies[index],evidenceFindingIds:[finding.id]}});
 return {product,enrollmentId:enrollment.id};
});}

async function sendApprovedTest(db,{apiKey,inboundKey,now=new Date(),fetchImpl=fetch}={}){
 if(!apiKey)throw Error('The StockerAI sending connection is not configured on Render.');
 const prepared=await prepare(db);
 const date=R.localClock(now,prepared.product.timeZone).date;
 const campaign=await R.loadCampaign(db,'stockerai',prepared.enrollmentId);
 if(!campaign.releasedAt)await D.releaseCampaign(db,{productId:'stockerai',enrollmentId:prepared.enrollmentId,firstLocalDate:date,now});
 const provider=resendProvider({apiKey,inboundKey,fetchImpl});
 const result=await D.attemptCampaign(db,{productId:'stockerai',enrollmentId:prepared.enrollmentId,send:provider.send,now});
 if(!result.sent)throw Error(result.unconfirmed?'The sending service outcome is uncertain. The CRM will not retry it automatically.':(result.held||['The test was not sent.']).join(' '));
 return {to:TEST_TO,enrollmentId:prepared.enrollmentId,providerMessageId:result.providerMessageId};
}

module.exports={prepare,sendApprovedTest,SIGNATURE,TEST_TO};
