'use strict';
// New product services are deliberately not wired into the legacy sender yet.
const email = value => String(value || '').trim().toLowerCase();
const P=require('./productPersonalization.js');
async function requireProduct(tx, productId) {
  if (!productId) throw new Error('Choose a product');
  const product = await tx.cRMProduct.findUnique({where:{id:productId}});
  if (!product) throw new Error('Unknown product');
  return product;
}
async function addMembership(db, productId, prospectId) {
  return db.$transaction(async tx => {
    await requireProduct(tx, productId);
    return tx.productProspect.upsert({where:{productId_prospectId:{productId,prospectId}},create:{productId,prospectId},update:{}});
  });
}
async function syncUnstartedRecipientEmail(tx,recipient,address) {
  if (!recipient || recipient.email===address) return recipient;
  const [enrollments,activityCount]=await Promise.all([
    tx.productEnrollment.findMany({where:{recipientId:recipient.id},include:{messages:true}}),
    tx.productActivity.count({where:{recipientId:recipient.id}}),
  ]);
  const hasDeliveryHistory=enrollments.some(enrollment=>
    enrollment.state!=='DRAFT'||enrollment.startedAt||enrollment.releasedAt||enrollment.stoppedAt||
    enrollment.messages.some(message=>message.deliveryState!=='DRAFT'||message.attemptedAt||message.providerMessageId||message.sentAt)
  );
  if(recipient.repliedAt||activityCount||hasDeliveryHistory)throw new Error('Recipient email changed; the existing campaign has activity or delivery history and cannot be retargeted');
  return tx.productRecipient.update({where:{id:recipient.id},data:{email:address}});
}
async function cloneCompleteSiblingMessages(tx,{productId,membershipId,enrollment,recipient,sequence}) {
  if(!recipient.contactId)return 0;
  const existingCount=await tx.productMessage.count({where:{productId,enrollmentId:enrollment.id}});
  if(existingCount)return 0;
  const siblings=await tx.productEnrollment.findMany({
    where:{productId,sequenceId:sequence.id,recipient:{membershipId},NOT:{id:enrollment.id}},
    include:{messages:{orderBy:{touch:'asc'}}},orderBy:{createdAt:'asc'},
  });
  const source=siblings.find(item=>item.messages.length===sequence.dayNumbers.length&&item.messages.every((message,index)=>message.touch===index+1&&message.subject?.trim()&&message.body?.trim()));
  if(!source)return 0;
  const contact=await tx.contact.findFirst({where:{id:recipient.contactId,prospectId:recipient.membership.prospectId,setAsideAt:null,bouncedAt:null}});
  const first=P.expectedFirstName(contact);
  if(!first)return 0;
  await tx.productMessage.createMany({data:source.messages.map(message=>({
    productId,enrollmentId:enrollment.id,touch:message.touch,subject:message.subject,
    body:P.personalizeBody(message.body,first),evidenceFindingIds:message.evidenceFindingIds,
  }))});
  return source.messages.length;
}
async function saveRecipientChoices(db, {productId, prospectId, contactIds=[], chooseInbox=false}) {
  if (!Array.isArray(contactIds) || typeof chooseInbox !== 'boolean') throw new Error('Invalid recipient choices');
  return db.$transaction(async tx => {
    await requireProduct(tx, productId);
    const membership = await tx.productProspect.findUnique({where:{productId_prospectId:{productId,prospectId}}});
    if (!membership || membership.archivedAt) throw new Error('Company is not active in this product');
    const prospect = await tx.prospect.findUnique({where:{id:prospectId},include:{contacts:true}});
    if (!prospect) throw new Error('Company no longer exists');
    if ((contactIds.length || chooseInbox) && (prospect.doNotContact || prospect.emailBouncedAt)) throw new Error('Company is blocked for email');
    const selected = [];
    for (const id of new Set(contactIds)) {
      const contact = prospect.contacts.find(c=>c.id===id && !c.setAsideAt && !c.bouncedAt && email(c.email));
      if (!contact) throw new Error('Contact does not belong to this company or cannot receive email');
      selected.push({recipientKey:'contact:'+id,contactId:id,email:email(contact.email)});
    }
    if (chooseInbox) {
      const inbox = email(prospect.emailManualValue || prospect.email);
      if (!inbox) throw new Error('No company inbox is available');
      const namedMatches=prospect.contacts.filter(c=>!c.setAsideAt&&!c.bouncedAt&&c.name&&email(c.email)===inbox);
      if(namedMatches.length===1){const c=namedMatches[0];if(!selected.some(r=>r.contactId===c.id))selected.push({recipientKey:'contact:'+c.id,contactId:c.id,email:inbox});}
      else selected.push({recipientKey:'inbox',contactId:null,email:inbox});
    }
    if (new Set(selected.map(r=>r.email)).size !== selected.length) throw new Error('Choose each email address only once');
    // Selection is atomic and scoped. Clearing choices never queues or generates.
    await tx.productRecipient.updateMany({where:{membershipId:membership.id,productId},data:{selected:false}});
    for (const recipient of selected) {
      let existing = await tx.productRecipient.findUnique({where:{membershipId_recipientKey:{membershipId:membership.id,recipientKey:recipient.recipientKey}}});
      if(!existing&&recipient.contactId){const inboxRecipient=await tx.productRecipient.findUnique({where:{membershipId_recipientKey:{membershipId:membership.id,recipientKey:'inbox'}}});if(inboxRecipient&&inboxRecipient.email===recipient.email)existing=await tx.productRecipient.update({where:{id:inboxRecipient.id},data:{recipientKey:recipient.recipientKey,contactId:recipient.contactId}});}
      if(existing&&existing.email!==recipient.email)existing=await syncUnstartedRecipientEmail(tx,existing,recipient.email);
      if(existing)await tx.productRecipient.update({where:{id:existing.id},data:{selected:true}});
      else await tx.productRecipient.create({data:{membershipId:membership.id,productId,...recipient,selected:true}});
    }
    await P.syncDraftGreetings(tx,{productId,membershipId:membership.id,contactIds:selected.map(r=>r.contactId)});
    return {productId,prospectId,selected:selected.length};
  });
}
async function enrollRecipient(db,{productId,recipientId,sequenceId}) {
  return db.$transaction(async tx=> {
    await requireProduct(tx,productId);
    const recipient = await tx.productRecipient.findFirst({where:{id:recipientId,productId},include:{membership:{include:{prospect:true}}}});
    const sequence = await tx.productSequence.findFirst({where:{id:sequenceId,productId,approvedAt:{not:null}}});
    if (!recipient || !sequence) throw new Error('Recipient and approved sequence must belong to this product');
    if (!recipient.selected || recipient.repliedAt || recipient.membership.archivedAt || recipient.membership.prospect.doNotContact || recipient.membership.prospect.emailBouncedAt) throw new Error('Recipient is not eligible for enrollment');
    if (recipient.contactId) {
      const contact = await tx.contact.findFirst({where:{id:recipient.contactId,prospectId:recipient.membership.prospectId,setAsideAt:null,bouncedAt:null}});
      if (!contact || email(contact.email)!==recipient.email) throw new Error('Contact details changed; review before enrollment');
    } else if (email(recipient.membership.prospect.emailManualValue || recipient.membership.prospect.email)!==recipient.email) throw new Error('Inbox changed; review before enrollment');
    const enrollment=await tx.productEnrollment.upsert({where:{recipientId_sequenceId:{recipientId,sequenceId}},create:{productId,recipientId,sequenceId},update:{}});
    await cloneCompleteSiblingMessages(tx,{productId,membershipId:recipient.membershipId,enrollment,recipient,sequence});
    return enrollment;
  });
}
async function prepareRecipientCampaign(db,{productId,prospectId,recipientKey,sequenceId}) {
  if (!recipientKey || !sequenceId) throw new Error('Recipient and approved sequence are required');
  return db.$transaction(async tx=> {
    await requireProduct(tx,productId);
    const membership=await tx.productProspect.findUnique({where:{productId_prospectId:{productId,prospectId}}});
    if(!membership||membership.archivedAt)throw new Error('Company is not active in this product');
    const sequence=await tx.productSequence.findFirst({where:{id:sequenceId,productId,approvedAt:{not:null}}});
    if(!sequence)throw new Error('Approved sequence must belong to this product');
    const prospect=await tx.prospect.findUnique({where:{id:prospectId},include:{contacts:true}});
    if(!prospect)throw new Error('Company no longer exists');
    if(prospect.doNotContact||prospect.emailBouncedAt)throw new Error('Company is blocked for email');
    let contactId=null,address='';
    if(recipientKey==='inbox')address=email(prospect.emailManualValue||prospect.email);
    else if(recipientKey.startsWith('contact:')){
      contactId=recipientKey.slice('contact:'.length);
      const contact=prospect.contacts.find(c=>c.id===contactId&&!c.setAsideAt&&!c.bouncedAt&&email(c.email));
      if(!contact)throw new Error('Contact does not belong to this company or cannot receive email');
      address=email(contact.email);
    } else throw new Error('Unknown recipient choice');
    if(!address)throw new Error('No recipient email is available');
    const existing=await tx.productRecipient.findUnique({where:{membershipId_recipientKey:{membershipId:membership.id,recipientKey}}});
    const current=existing&&existing.email!==address?await syncUnstartedRecipientEmail(tx,existing,address):existing;
    const recipient=current||await tx.productRecipient.create({data:{membershipId:membership.id,productId,recipientKey,contactId,email:address,selected:false}});
    const enrollment=await tx.productEnrollment.upsert({where:{recipientId_sequenceId:{recipientId:recipient.id,sequenceId}},create:{productId,recipientId:recipient.id,sequenceId},update:{}});
    await cloneCompleteSiblingMessages(tx,{productId,membershipId:membership.id,enrollment,recipient:{...recipient,membership:{prospectId}},sequence});
    return {recipient,enrollment};
  });
}
module.exports={addMembership,saveRecipientChoices,enrollRecipient,prepareRecipientCampaign};
