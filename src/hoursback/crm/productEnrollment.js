'use strict';
// New product services are deliberately not wired into the legacy sender yet.
const email = value => String(value || '').trim().toLowerCase();
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
      selected.push({recipientKey:'inbox',contactId:null,email:inbox});
    }
    if (new Set(selected.map(r=>r.email)).size !== selected.length) throw new Error('Choose each email address only once');
    // Selection is atomic and scoped. Clearing choices never queues or generates.
    await tx.productRecipient.updateMany({where:{membershipId:membership.id,productId},data:{selected:false}});
    for (const recipient of selected) {
      const existing = await tx.productRecipient.findUnique({where:{membershipId_recipientKey:{membershipId:membership.id,recipientKey:recipient.recipientKey}}});
      if (existing && existing.email !== recipient.email) throw new Error('Recipient email changed; review the existing campaign before replacing its address');
      await tx.productRecipient.upsert({where:{membershipId_recipientKey:{membershipId:membership.id,recipientKey:recipient.recipientKey}},create:{membershipId:membership.id,productId,...recipient,selected:true},update:{selected:true}});
    }
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
    return tx.productEnrollment.upsert({where:{recipientId_sequenceId:{recipientId,sequenceId}},create:{productId,recipientId,sequenceId},update:{}});
  });
}
module.exports={addMembership,saveRecipientChoices,enrollRecipient};
