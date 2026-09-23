const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PrismaClient}=require('@prisma/client');
const C=require('../src/hoursback/crm/productChannels.js');

test('StockerAI phone and LinkedIn work stays scoped and a LinkedIn reply stops only that product campaign',async()=>{
 const db=new PrismaClient({datasources:{db:{url:'postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test'}}});
 try{await db.$transaction(async tx=>{
  const scope=new Proxy(tx,{get:(target,key)=>key==='$transaction'?fn=>fn(tx):target[key]});const suffix=String(Date.now());
  const prospect=await tx.prospect.create({data:{placeId:'channels-'+suffix,name:'Cascade Vending'}});
  const contact=await tx.contact.create({data:{prospectId:prospect.id,name:'Maria Lopez',role:'Operations Manager',email:'maria@example.test'}});
  const other=await tx.contact.create({data:{prospectId:prospect.id,name:'Alex Reed'}});
  const records=[];
  for(const prefix of ['vision','stock']){
   const product=await tx.cRMProduct.create({data:{id:prefix+suffix,name:prefix}});
   const member=await tx.productProspect.create({data:{productId:product.id,prospectId:prospect.id}});
   const recipient=await tx.productRecipient.create({data:{productId:product.id,membershipId:member.id,recipientKey:'contact:'+contact.id,contactId:contact.id,email:contact.email,selected:true}});
   const sequence=await tx.productSequence.create({data:{productId:product.id,version:1,dayNumbers:[1,4],businessDaysOnly:true}});
   const enrollment=await tx.productEnrollment.create({data:{productId:product.id,recipientId:recipient.id,sequenceId:sequence.id}});
   records.push({product,member,recipient,enrollment});
  }
  const [vision,stock]=records;const base={productId:stock.product.id,prospectId:prospect.id};
  await tx.productMessage.createMany({data:[vision,stock].map(row=>({productId:row.product.id,enrollmentId:row.enrollment.id,touch:1,subject:'Route picking',body:'Hi Cascade Vending team,\n\nA practical route-picking idea.'}))});
  await C.saveCompanyChannels(scope,{...base,name:'Cascade Vending & Coffee',address:'10 Main St, Portland, OR',website:'cascadevending.example/routes',phone:'503-555-0100',linkedInUrl:'https://linkedin.com/company/cascade-vending'});
  await C.saveContactChannels(scope,{...base,contactId:contact.id,phone:'503-555-0101',linkedIn:'https://linkedin.com/in/maria-lopez'});
  await C.saveContactChannels(scope,{...base,contactId:contact.id,name:'Marisol Lopez',role:'Operations Manager',email:'maria@example.test',phone:'503-555-0101',linkedIn:'https://linkedin.com/in/maria-lopez'});
  await C.saveContactChannels(scope,{...base,contactId:other.id,phone:'503-555-0102',linkedIn:'https://linkedin.com/in/alex-reed'});
  const added=await C.addContact(scope,{...base,name:'Taylor Reed',role:'Owner',email:'TAYLOR@example.test',phone:'503-555-0103',linkedIn:'https://linkedin.com/in/taylor-reed'});
  assert.equal(added.email,'taylor@example.test');assert.equal(added.prospectId,prospect.id);
  const savedProspect=await tx.prospect.findUnique({where:{id:prospect.id}});assert.equal(savedProspect.nameManualValue,'Cascade Vending & Coffee');assert.equal(savedProspect.addressManualValue,'10 Main St, Portland, OR');assert.equal(savedProspect.phoneManualValue,'503-555-0100');assert.equal(savedProspect.websiteManualValue,'https://cascadevending.example/routes');
  assert.equal((await tx.contact.findUnique({where:{id:contact.id}})).linkedIn,'https://linkedin.com/in/maria-lopez');
  assert.match((await tx.productMessage.findFirst({where:{enrollmentId:stock.enrollment.id}})).body,/^Hi Marisol,/);
  assert.match((await tx.productMessage.findFirst({where:{enrollmentId:vision.enrollment.id}})).body,/^Hi Cascade Vending team,/);
  await assert.rejects(C.saveContactChannels(scope,{...base,contactId:'missing',phone:'',linkedIn:''}),/does not belong/);
  const sent=await C.recordLinkedIn(scope,{...base,contactId:contact.id,status:'SENT',eventKey:'li-sent'});
  assert.equal((await C.recordLinkedIn(scope,{...base,contactId:contact.id,status:'SENT',eventKey:'li-sent'})).id,sent.id);
  await C.recordLinkedIn(scope,{...base,contactId:contact.id,status:'REPLIED',eventKey:'li-reply'});
  assert.equal((await tx.productEnrollment.findUnique({where:{id:stock.enrollment.id}})).state,'STOPPED');
  assert.equal((await tx.productEnrollment.findUnique({where:{id:vision.enrollment.id}})).state,'DRAFT');
  assert.equal((await tx.productRecipient.findUnique({where:{id:vision.recipient.id}})).repliedAt,null);
  assert.equal(await tx.productActivity.count({where:{productId:stock.product.id,kind:'LINKEDIN_RESPONSE'}}),1);
  throw new Error('ROLLBACK_CHANNELS');
 },{timeout:20000});}catch(error){if(error.message!=='ROLLBACK_CHANNELS')throw error;}finally{await db.$disconnect();}
});
