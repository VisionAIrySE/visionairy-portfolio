#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');process.chdir(path.resolve(__dirname,'../..'));
try{for(const line of fs.readFileSync(process.env.CRM_ENV_FILE||'.env','utf8').split(/\r?\n/)){const match=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);if(match&&process.env[match[1]]===undefined)process.env[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');}}catch{}
const ROI=require('../../src/hoursback/crm/stockerRoiEmail.js');
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
const apply=process.argv.includes('--apply');
const approved=process.argv.includes('--approved=insert-stockerai-roi-followup');
const replaceReviewed=process.argv.includes('--replace-reviewed-drafts');
const messageLocks=message=>!message?['missing']:[
 message.deliveryState!=='DRAFT'?'delivery state '+message.deliveryState:null,
 message.editedAt?'manually edited':null,message.attemptedAt?'attempted':null,message.sentAt?'sent':null,
 message.providerMessageId?'provider accepted':null,message.deliveryKey?'delivery key assigned':null,
].filter(Boolean);
const untouched=message=>messageLocks(message).length===0;
function recordFor(enrollment){
 const prospect=enrollment.recipient.membership.prospect;const contact=prospect.contacts.find(item=>item.id===enrollment.recipient.contactId);
 return {company:{name:prospect.nameManualValue||prospect.name},recipient:contact?{kind:'named_contact',name:contact.name}:{kind:'company_inbox'}};
}
async function plan(tx){
 const enrollments=await tx.productEnrollment.findMany({where:{productId:'stockerai'},include:{recipient:{include:{membership:{include:{prospect:{include:{contacts:true}}}}}},messages:{where:{touch:{in:[2,3]}},orderBy:{touch:'asc'}}}});
 const eligible=[],skipped=[];
 for(const enrollment of enrollments){const company=enrollment.recipient.membership.prospect.nameManualValue||enrollment.recipient.membership.prospect.name;const second=enrollment.messages.find(item=>item.touch===2),third=enrollment.messages.find(item=>item.touch===3);let reason='';
  const locks=[...new Set([...messageLocks(second),...messageLocks(third)])];const onlyReviewed=locks.length&&locks.every(lock=>lock==='manually edited');
  if(enrollment.stoppedAt)reason='campaign is stopped';else if(!second||!third)reason='touch two or three is missing';else if(locks.length&&!(replaceReviewed&&onlyReviewed))reason='touch two or three is locked: '+locks.join(', ');
  if(reason){skipped.push({company,email:enrollment.recipient.email,reason,editedAt:[second?.editedAt,third?.editedAt].filter(Boolean).map(value=>value.toISOString())});continue;}
  const record=recordFor(enrollment);eligible.push({enrollmentId:enrollment.id,company,email:enrollment.recipient.email,second,third,roi:ROI.roiEmail(record),workflow:ROI.workflowEmail(record)});
 }
 return {eligible,skipped,total:enrollments.length};
}
(async()=>{try{
 if(apply&&(!approved||!replaceReviewed))throw Error('Applying this production draft update requires --replace-reviewed-drafts and --approved=insert-stockerai-roi-followup');
 if(!apply){const report=await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');const mode=await tx.$queryRawUnsafe('SHOW transaction_read_only');if(mode[0]?.transaction_read_only!=='on')throw Error('Read-only mode was not confirmed');const result=await plan(tx);const editTimes=result.skipped.flatMap(item=>item.editedAt||[]).sort();return {mode:'PREVIEW',readOnlyConfirmed:true,totalCampaigns:result.total,eligibleCampaigns:result.eligible.length,skippedCampaigns:result.skipped.length,skipReasons:Object.entries(result.skipped.reduce((out,item)=>(out[item.reason]=(out[item.reason]||0)+1,out),{})).map(([reason,count])=>({reason,count})),editedAtRange:editTimes.length?{earliest:editTimes[0],latest:editTimes.at(-1)}:null,sampleSkipped:result.skipped.filter(item=>!/campaign is stopped/.test(item.reason)).sort((a,b)=>Number(/manually edited$/.test(a.reason))-Number(/manually edited$/.test(b.reason))).slice(0,12),sample:result.eligible.slice(0,3).map(item=>({company:item.company,email:item.email,newTouchTwo:item.roi,newTouchThree:item.workflow})),writesProduction:false};});console.log(JSON.stringify(report,null,2));return;}
 const result=await db.$transaction(async tx=>{const prepared=await plan(tx);let updated=0;for(const item of prepared.eligible){const third=await tx.productMessage.updateMany({where:{id:item.third.id,productId:'stockerai',touch:3,deliveryState:'DRAFT',attemptedAt:null,sentAt:null,providerMessageId:null,deliveryKey:null},data:{subject:item.workflow.subject,body:item.workflow.body}});if(third.count!==1)throw Error(item.company+' changed while the update was running');const second=await tx.productMessage.updateMany({where:{id:item.second.id,productId:'stockerai',touch:2,deliveryState:'DRAFT',attemptedAt:null,sentAt:null,providerMessageId:null,deliveryKey:null},data:{subject:item.roi.subject,body:item.roi.body}});if(second.count!==1)throw Error(item.company+' changed while the update was running');updated++;}return {mode:'APPLIED',totalCampaigns:prepared.total,updatedCampaigns:updated,skippedCampaigns:prepared.skipped.length,skipped:prepared.skipped};},{timeout:120000});console.log(JSON.stringify(result,null,2));
 }finally{await db.$disconnect();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
