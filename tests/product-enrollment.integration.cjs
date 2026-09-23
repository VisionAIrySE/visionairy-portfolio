const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const S=require('../src/hoursback/crm/productEnrollment.js');
// Never inherit application credentials. All writes stay in the named disposable schema.
const db=new PrismaClient({datasources:{db:{url:'postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test'}}});
test('product choices and enrollments are isolated in the real test database',async()=> {
 try {
  await db.$transaction(async tx=> {
   const scope=new Proxy(tx,{get:(target,key)=>key==='$transaction'?fn=>fn(tx):target[key]});
   const suffix=Date.now().toString();
   const a=await tx.cRMProduct.create({data:{id:'vision-'+suffix,name:'VisionAIry'}});
   const b=await tx.cRMProduct.create({data:{id:'stock-'+suffix,name:'StockerAI'}});
   assert.equal(b.sendingEnabled,false);
   const company=await tx.prospect.create({data:{placeId:'product-test-'+suffix,name:'Fixture',email:'office@example.test',emailInboxSelected:true,contacts:{create:{name:'Person',email:'person@example.test',isPrimary:true}}},include:{contacts:true}});
   const other=await tx.prospect.create({data:{placeId:'other-'+suffix,name:'Other',contacts:{create:{email:'other@example.test'}}},include:{contacts:true}});
   const person=company.contacts[0];
   await S.addMembership(scope,a.id,company.id); await S.addMembership(scope,b.id,company.id);
   assert.equal(await tx.productRecipient.count(),0);
   await S.saveRecipientChoices(scope,{productId:a.id,prospectId:company.id,contactIds:[person.id]});
   await S.saveRecipientChoices(scope,{productId:b.id,prospectId:company.id,chooseInbox:true});
   await S.saveRecipientChoices(scope,{productId:b.id,prospectId:company.id});
   assert.equal(await tx.productRecipient.count({where:{productId:a.id,selected:true}}),1);
   assert.equal(await tx.productRecipient.count({where:{productId:b.id,selected:true}}),0);
   assert.equal((await tx.contact.findUnique({where:{id:person.id}})).isPrimary,true);
   assert.equal((await tx.prospect.findUnique({where:{id:company.id}})).emailInboxSelected,true);
   await assert.rejects(S.saveRecipientChoices(scope,{productId:b.id,prospectId:company.id,contactIds:[other.contacts[0].id]}),/Contact does not belong/);
   await assert.rejects(S.addMembership(scope,'unknown',company.id),/Unknown product/);
   const seqA=await tx.productSequence.create({data:{productId:a.id,version:1,dayNumbers:[1,5,9,15],businessDaysOnly:false,approvedAt:new Date()}});
   const seqB=await tx.productSequence.create({data:{productId:b.id,version:1,dayNumbers:[1,4,9,16,25],businessDaysOnly:true,approvedAt:new Date()}});
   const prepared=await S.prepareRecipientCampaign(scope,{productId:b.id,prospectId:company.id,recipientKey:'inbox',sequenceId:seqB.id});
   assert.equal(prepared.recipient.selected,false,'preparing a draft must not select its recipient');
   assert.equal(prepared.enrollment.state,'DRAFT');
   const preparedAgain=await S.prepareRecipientCampaign(scope,{productId:b.id,prospectId:company.id,recipientKey:'inbox',sequenceId:seqB.id});
   assert.equal(preparedAgain.enrollment.id,prepared.enrollment.id,'draft preparation must be idempotent');
   await assert.rejects(S.prepareRecipientCampaign(scope,{productId:b.id,prospectId:company.id,recipientKey:'contact:'+other.contacts[0].id,sequenceId:seqB.id}),/Contact does not belong/);
   const A=require('../src/hoursback/crm/productActions.js');
   const select=await A.handleProductPost(scope,{productId:b.id,action:'choices',form:{csrf:A.formToken(b.id),prospectId:company.id,inbox:'1'}});
   assert.equal(select.status,200);assert.equal(select.refresh,false,'selecting an already prepared campaign must not create a second enrollment');
   const selectedInbox=await tx.productRecipient.findFirst({where:{productId:b.id}});
   assert.equal(await tx.productEnrollment.count({where:{recipientId:selectedInbox.id}}),1);
   const clear=await A.handleProductPost(scope,{productId:b.id,action:'choices',form:{csrf:A.formToken(b.id),prospectId:company.id}});
   assert.equal(clear.selected,0);
   assert.equal((await tx.productRecipient.findUnique({where:{id:selectedInbox.id}})).selected,false);
   const recipient=await tx.productRecipient.findFirst({where:{productId:a.id}});
   await assert.rejects(S.enrollRecipient(scope,{productId:b.id,recipientId:recipient.id,sequenceId:seqB.id}),/must belong/);
   await assert.rejects(S.enrollRecipient(scope,{productId:a.id,recipientId:recipient.id,sequenceId:seqB.id}),/must belong/);
   const first=await S.enrollRecipient(scope,{productId:a.id,recipientId:recipient.id,sequenceId:seqA.id});
   const again=await S.enrollRecipient(scope,{productId:a.id,recipientId:recipient.id,sequenceId:seqA.id});
   assert.equal(first.id,again.id); assert.equal(first.state,'DRAFT');
   const {saveProductDraft}=require('../src/hoursback/crm/productMessages.js');
   const {productWorkspace,renderWorkspace}=require('../src/hoursback/crm/productWorkspace.js');
   const draft={productId:a.id,enrollmentId:first.id,touch:1,subject:'A subject',body:'A body'};
   await assert.rejects(saveProductDraft(scope,{...draft,productId:b.id}),/does not belong/);
   await assert.rejects(saveProductDraft(scope,{...draft,touch:5}),/outside/);
   await saveProductDraft(scope,{...draft,manual:true});
   await assert.rejects(saveProductDraft(scope,{...draft,body:'Generated replacement'}),/manually edited/);
   const viewA=await productWorkspace(tx,a.id);
   const viewB=await productWorkspace(tx,b.id);
   assert.equal(viewA.memberships[0].recipients[0].enrollments[0].messages[0].body,'A body');
   assert.equal(viewB.memberships[0].recipients[0].enrollments[0].messages.length,0);
   assert.equal(await tx.outreachMessage.count(),0,'new drafts must not enter legacy sender storage');
   assert.match(renderWorkspace(viewA),/A body/);
   assert.doesNotMatch(renderWorkspace(viewB),/A body/);
   await tx.productEnrollment.update({where:{id:first.id},data:{state:'STARTED',startedAt:new Date()}});
   await assert.rejects(saveProductDraft(scope,{...draft,manual:true}),/unstarted/);
   await tx.productRecipient.update({where:{id:recipient.id},data:{repliedAt:new Date()}});
   await assert.rejects(S.enrollRecipient(scope,{productId:a.id,recipientId:recipient.id,sequenceId:seqA.id}),/not eligible/);
   throw new Error('ROLLBACK_FIXTURES');
  },{timeout:20000});
 } catch(e) {if(e.message!=='ROLLBACK_FIXTURES') throw e;}
 finally {await db.$disconnect();}
});

test('database rejects cross-product enrollment even without the service',async()=> {
 const isolated=new PrismaClient({datasources:{db:{url:'postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test'}}});
 const suffix='constraint-'+Date.now();
 try {
  await assert.rejects(isolated.$transaction(async tx=>{
   const a=await tx.cRMProduct.create({data:{id:'a-'+suffix,name:'A'}});
   const b=await tx.cRMProduct.create({data:{id:'b-'+suffix,name:'B'}});
   const p=await tx.prospect.create({data:{placeId:suffix,name:'Constraint fixture'}});
   const membership=await tx.productProspect.create({data:{productId:a.id,prospectId:p.id}});
   const recipient=await tx.productRecipient.create({data:{productId:a.id,membershipId:membership.id,recipientKey:'inbox',email:'office@example.test'}});
   const sequence=await tx.productSequence.create({data:{productId:b.id,version:1,dayNumbers:[1],businessDaysOnly:true}});
   await tx.productEnrollment.create({data:{productId:a.id,recipientId:recipient.id,sequenceId:sequence.id}});
  }),error=>error.code==='P2003');
  assert.equal(await isolated.cRMProduct.count({where:{id:{in:['a-'+suffix,'b-'+suffix]}}}),0,'this test’s fixtures must roll back independently of concurrent tests');
 } finally {await isolated.$disconnect();}
});

test('a verified person at the company inbox is selected as the person',async()=>{
 const suffix='named-inbox-'+Date.now();
 try{await db.$transaction(async tx=>{
  const scope=new Proxy(tx,{get:(target,key)=>key==='$transaction'?fn=>fn(tx):target[key]});
  const product=await tx.cRMProduct.create({data:{id:suffix,name:'StockerAI'}});
  const prospect=await tx.prospect.create({data:{placeId:suffix,name:'Denver’s Best Vending',email:'stephen@example.test',contacts:{create:{name:'Stephen',email:'stephen@example.test'}}},include:{contacts:true}});
  const membership=await S.addMembership(scope,product.id,prospect.id);
  const oldRecipient=await tx.productRecipient.create({data:{productId:product.id,membershipId:membership.id,recipientKey:'inbox',email:prospect.email}});
  const sequence=await tx.productSequence.create({data:{productId:product.id,version:1,dayNumbers:[1],businessDaysOnly:true,approvedAt:new Date()}});
  const enrollment=await tx.productEnrollment.create({data:{productId:product.id,recipientId:oldRecipient.id,sequenceId:sequence.id}});
  await tx.productMessage.create({data:{productId:product.id,enrollmentId:enrollment.id,touch:1,subject:'Route picking',body:'Hi Denver’s Best Vending team,\n\nA practical route-picking idea.'}});
  const saved=await S.saveRecipientChoices(scope,{productId:product.id,prospectId:prospect.id,chooseInbox:true});assert.equal(saved.selected,1);
  const recipient=await tx.productRecipient.findFirst({where:{productId:product.id,selected:true}});assert.equal(recipient.id,oldRecipient.id);assert.equal(recipient.recipientKey,'contact:'+prospect.contacts[0].id);assert.equal(recipient.contactId,prospect.contacts[0].id);
  assert.equal((await tx.productEnrollment.findUnique({where:{id:enrollment.id}})).recipientId,oldRecipient.id);assert.match((await tx.productMessage.findFirst({where:{enrollmentId:enrollment.id}})).body,/^Hi Stephen,/);
  throw new Error('ROLLBACK_NAMED_INBOX');
 });}catch(error){if(error.message!=='ROLLBACK_NAMED_INBOX')throw error;}
});
