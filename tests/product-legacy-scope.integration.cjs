const {test}=require('node:test');const assert=require('node:assert/strict');const {PrismaClient}=require('@prisma/client');
const {legacyClient}=require('../src/hoursback/crm/productLegacyScope.js');
test('legacy scope excludes StockerAI-only companies and preserves shared and historical companies',async()=>{
 const db=new PrismaClient({datasources:{db:{url:'postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test'}}});
 try{await db.$transaction(async tx=>{
  const suffix=Date.now();const legacy=legacyClient(tx,{enabled:true});
  await tx.cRMProduct.upsert({where:{id:'visionairy'},create:{id:'visionairy',name:'VisionAIry'},update:{}});
  const product=await tx.cRMProduct.create({data:{id:'scope-'+suffix,name:'Other product'}});
  const old=await legacy.prospect.create({data:{placeId:'old-'+suffix,name:'Historical'}});
  const stock=await tx.prospect.create({data:{placeId:'stock-'+suffix,name:'Stock only',contacts:{create:{name:'Hidden person',email:'hidden@example.test'}}},include:{contacts:true}});
  await tx.productProspect.create({data:{productId:product.id,prospectId:stock.id}});
  assert.equal(await legacy.prospect.findUnique({where:{id:stock.id}}),null);
  assert.equal(await legacy.contact.findUnique({where:{id:stock.contacts[0].id}}),null);
  assert.equal((await legacy.prospect.updateMany({where:{id:stock.id},data:{name:'Wrong'}})).count,0);
  await assert.rejects(legacy.contact.create({data:{prospectId:stock.id,name:'Wrong'}}),/does not belong/);
  assert.ok(await legacy.contact.create({data:{prospectId:old.id,name:'Created in same transaction'}}));
  assert.ok(await legacy.prospect.findUnique({where:{id:old.id}}));
  await tx.productProspect.create({data:{productId:'visionairy',prospectId:stock.id}});
  assert.ok(await legacy.prospect.findUnique({where:{id:stock.id}}));
  assert.ok(await legacy.contact.findUnique({where:{id:stock.contacts[0].id}}));
  throw Error('ROLLBACK_SCOPE');
 });}catch(e){if(e.message!=='ROLLBACK_SCOPE')throw e;}finally{await db.$disconnect();}
});
