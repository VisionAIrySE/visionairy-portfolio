'use strict';
function validateDraft({subject,body}) {
  if (typeof subject!=='string' || !subject.trim() || typeof body!=='string' || !body.trim()) throw new Error('Subject and message are required');
  if (/[\r\n]/.test(subject)) throw new Error('Subject must be a single line');
  if (/\u2014/.test(subject+body)) throw new Error('Remove em dashes before saving');
}
async function saveProductDraft(db,{productId,enrollmentId,touch,subject,body,manual=false,evidenceFindingIds}) {
  validateDraft({subject,body});
  if (!productId || !Number.isInteger(touch) || touch<1) throw new Error('Product and valid message number are required');
  return db.$transaction(async tx=> {
    const enrollment=await tx.productEnrollment.findFirst({where:{id:enrollmentId,productId},include:{sequence:true}});
    if (!enrollment) throw new Error('Campaign does not belong to this product');
    if(enrollment.state!=='DRAFT' || enrollment.startedAt || enrollment.stoppedAt) throw new Error('Only an unstarted draft campaign can be edited');
    if(touch>enrollment.sequence.dayNumbers.length) throw new Error('Message number is outside this campaign sequence');
    const where={enrollmentId_touch:{enrollmentId,touch}};
    const existing=await tx.productMessage.findUnique({where});
    if(evidenceFindingIds!==undefined){
      if(!Array.isArray(evidenceFindingIds)||new Set(evidenceFindingIds).size!==evidenceFindingIds.length)throw new Error('Invalid evidence list');
      const recipient=await tx.productRecipient.findUnique({where:{id:enrollment.recipientId},include:{membership:true}});
      const count=await tx.finding.count({where:{id:{in:evidenceFindingIds},prospectId:recipient.membership.prospectId,retiredAt:null}});
      if(count!==evidenceFindingIds.length)throw new Error('Evidence does not belong to this company');
    }
    if(existing?.editedAt && !manual) throw new Error('Preserve the manually edited draft');
    const data={subject:subject.trim(),body:body.trim(),...(evidenceFindingIds!==undefined?{evidenceFindingIds}:{}),...(manual?{editedAt:new Date()}:{})};
    return tx.productMessage.upsert({where,create:{productId,enrollmentId,touch,...data},update:data});
  });
}
module.exports={saveProductDraft,validateDraft};
