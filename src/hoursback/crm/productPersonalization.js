'use strict';
const {firstNameOfMarked}=require('./names.js');

function expectedFirstName(contact){return firstNameOfMarked(contact?.name||'');}
function openingLine(body){return String(body||'').trimStart().split(/\r?\n/,1)[0].trim();}
function addressedTo(body,first){
 if(!first)return false;
 const escaped=String(first).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('^(?:Hi\\s+)?'+escaped+'[,!](?:\\s|$)','i').test(openingLine(body));
}
function personalizeBody(body,first){
 if(!first)throw new Error('The selected contact needs a usable first name');
 const text=String(body||'').trim();const greeting='Hi '+first+',';
 if(!text)return greeting;
 const lines=text.split(/\r?\n/);const firstLine=lines[0].trim();
 const named=firstLine.match(/^(?:hi|dear)\s+[^,!]+[,!]\s*(.*)$/i),plain=firstLine.match(/^hello[,!]\s*(.*)$/i);
 if(named||plain){const rest=(named||plain)[1];lines.shift();lines.unshift(greeting,...(rest?['',rest]:[]));}
 else if(/^[A-Z][A-Za-z'’.-]*[,!]$/.test(firstLine))lines[0]=greeting;
 else lines.unshift(greeting,'');
 return lines.join('\n').trim();
}
async function syncDraftGreetings(tx,{productId,membershipId,contactIds}){
 const ids=[...new Set((contactIds||[]).filter(Boolean))];if(!ids.length)return 0;
 const recipients=await tx.productRecipient.findMany({where:{productId,membershipId,contactId:{in:ids}},include:{enrollments:{where:{state:'DRAFT',startedAt:null,stoppedAt:null},include:{messages:true}}}});
 const contacts=await tx.contact.findMany({where:{id:{in:ids},setAsideAt:null},select:{id:true,name:true}});const byId=new Map(contacts.map(c=>[c.id,c]));let updated=0;
 for(const recipient of recipients){const first=expectedFirstName(byId.get(recipient.contactId));if(!first)continue;for(const enrollment of recipient.enrollments)for(const message of enrollment.messages){const body=personalizeBody(message.body,first);if(body!==message.body){await tx.productMessage.update({where:{id:message.id},data:{body}});updated++;}}}
 return updated;
}
async function syncDraftEvidence(tx,{productId,membershipId,recipientIds}){
 const ids=[...new Set((recipientIds||[]).filter(Boolean))];if(!ids.length)return 0;
 const membership=await tx.productProspect.findFirst({where:{id:membershipId,productId},select:{prospectId:true}});if(!membership)return 0;
 const readings=await tx.reading.findMany({where:{prospectId:membership.prospectId,source:'website',reader:'understand-businesses',outcome:'read',finishedAt:{not:null},OR:[{note:null},{NOT:{note:{startsWith:'not their site'}}}],pages:{some:{bytes:{gt:0},OR:[{text:{not:null}},{sameAs:{not:null}}]}}},select:{id:true}});
 if(!readings.length)return 0;
 const findings=await tx.finding.findMany({where:{prospectId:membership.prospectId,readingId:{in:readings.map(item=>item.id)},retiredAt:null,status:{in:['observed','confirmed']},url:{not:null},quote:{not:null}},select:{id:true}});
 const valid=new Set(findings.map(item=>item.id));if(!valid.size)return 0;
 const recipients=await tx.productRecipient.findMany({where:{productId,membershipId},include:{enrollments:{where:{state:'DRAFT',startedAt:null,stoppedAt:null},include:{messages:{orderBy:{touch:'asc'}}}}}});
 const targets=new Set(ids),pending=new Map();
 for(const recipient of recipients){if(!targets.has(recipient.id))continue;for(const enrollment of recipient.enrollments){
  const siblings=recipients.flatMap(item=>item.enrollments).filter(item=>item.id!==enrollment.id&&item.sequenceId===enrollment.sequenceId);
  for(const message of enrollment.messages){if(message.evidenceFindingIds.some(id=>valid.has(id)))continue;
   const sibling=siblings.flatMap(item=>item.messages).find(item=>item.touch===message.touch&&item.evidenceFindingIds.some(id=>valid.has(id)));
   const evidence=sibling?[...new Set(sibling.evidenceFindingIds.filter(id=>valid.has(id)))]:[...valid];
   if(!evidence.length)continue;const key=JSON.stringify(evidence);const group=pending.get(key)||{evidence,ids:[]};group.ids.push(message.id);pending.set(key,group);
  }
 }}
 let updated=0;for(const group of pending.values())updated+=(await tx.productMessage.updateMany({where:{id:{in:group.ids}},data:{evidenceFindingIds:group.evidence}})).count;
 return updated;
}
module.exports={expectedFirstName,openingLine,addressedTo,personalizeBody,syncDraftGreetings,syncDraftEvidence};
