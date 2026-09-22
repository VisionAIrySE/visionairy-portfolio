'use strict';
const crypto=require('node:crypto');
const host=v=>{try{return new URL(/^https?:\/\//i.test(v)?v:'https://'+v).hostname.toLowerCase().replace(/^www\./,'');}catch{return null;}};
const key=row=>'stockerai-supplied:'+crypto.createHash('sha256').update(row.name.toLowerCase()+'|'+row.location.toLowerCase()).digest('hex').slice(0,24);
function planImport(operators,existing){
 if(!Array.isArray(operators))throw new Error('An operator list is required');
 const seen=new Set();
 return operators.map(row=>{
  if(!row.name||!row.location||!Array.isArray(row.candidateEmails))throw new Error('Incomplete supplied operator row');
  const placeId=key(row);const domain=row.website?host(row.website):null;
  if(seen.has(placeId))return {row,placeId,status:'DUPLICATE_SOURCE'};seen.add(placeId);
  if(existing.some(p=>p.placeId===placeId))return {row,placeId,status:'ALREADY_IMPORTED'};
  const matches=existing.filter(p=>(domain&&[host(p.website||''),p.normalizedDomain].includes(domain))||p.name.toLowerCase()===row.name.toLowerCase());
  return {row,placeId,domain,status:matches.length?'EXISTING_REVIEW':'NEW',matches:matches.map(p=>({id:p.id,name:p.name}))};
 });
}
async function previewImport(db,operators){
 const existing=await db.prospect.findMany({select:{id:true,placeId:true,name:true,website:true,normalizedDomain:true}});
 return planImport(operators,existing);
}
// No website access or message generation. Production execution needs approval.
async function applyImport(db,operators){
 return db.$transaction(async tx=>{
  if(!await tx.cRMProduct.findUnique({where:{id:'stockerai'}}))throw new Error('Set up StockerAI before importing');
  if(await tx.prospect.count({where:{productMemberships:{none:{}}}}))throw new Error('Associate historical VisionAIry companies before importing');
  const plan=await previewImport(tx,operators);const imported=[];
  for(const item of plan.filter(p=>p.status==='NEW')){
   const row=item.row;const email=row.candidateEmails[0]||null;
   if(email&&!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email))throw new Error('Invalid supplied email for '+row.name);
   const company=await tx.prospect.create({data:{placeId:item.placeId,name:row.name,website:row.website,address:row.location,normalizedDomain:item.domain,email,emailInboxSelected:false}});
   const member=await tx.productProspect.create({data:{productId:'stockerai',prospectId:company.id,stage:'NEEDS_REVIEW'}});
   await tx.productActivity.create({data:{productId:'stockerai',membershipId:member.id,eventKey:'import:'+item.placeId,kind:'NOTE',occurredAt:new Date(),notes:'Supplied operator list dated 2026-06-30; not newly verified. Contact: '+row.suppliedContact+'. Supplied fit: '+row.suppliedFit+'. Website research and recipient review still required.'}});
   imported.push({id:company.id,name:row.name});
  }
  const after=await previewImport(tx,operators);
  const unresolved=after.filter(p=>!['ALREADY_IMPORTED'].includes(p.status));
  if(after.filter(p=>p.status==='ALREADY_IMPORTED').length!==imported.length+plan.filter(p=>p.status==='ALREADY_IMPORTED').length)throw new Error('Import reconciliation failed; changes rolled back');
  return {intended:operators.length,imported,unresolved:unresolved.map(p=>({name:p.row.name,status:p.status,matches:p.matches||[]}))};
 },{isolationLevel:'Serializable',timeout:120000});
}
module.exports={planImport,previewImport,applyImport};
