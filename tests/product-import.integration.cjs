const {test}=require('node:test');const assert=require('node:assert/strict');const {PrismaClient}=require('@prisma/client');const {applyImport}=require('../src/hoursback/crm/productImport.js');
test('operator import remains unselected, unread, isolated and idempotent',async()=>{
 const db=new PrismaClient({datasources:{db:{url:'postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test'}}});
 try{await db.$transaction(async tx=>{
  const scope=new Proxy(tx,{get:(t,k)=>k==='$transaction'?fn=>fn(tx):t[k]});
  await tx.cRMProduct.create({data:{id:'stockerai',name:'StockerAI'}});
  const rows=[{name:'Test import operator',location:'Test City',website:'https://operator.example.test',candidateEmails:['office@operator.example.test'],suppliedContact:'office@operator.example.test',suppliedFit:'Supplied estimate'}];
  const result=await applyImport(scope,rows);assert.equal(result.imported.length,1);assert.equal(result.unresolved.length,0);
  const p=await tx.prospect.findUnique({where:{id:result.imported[0].id},include:{readings:true,messages:true,contacts:true,productMemberships:true}});
  assert.equal(p.emailInboxSelected,false);assert.equal(p.readings.length,0);assert.equal(p.messages.length,0);assert.equal(p.contacts.length,0);assert.equal(p.productMemberships[0].productId,'stockerai');
  assert.equal((await applyImport(scope,rows)).imported.length,0);
  throw Error('ROLLBACK_IMPORT');
 },{timeout:30000});}catch(e){if(e.message!=='ROLLBACK_IMPORT')throw e;}finally{await db.$disconnect();}
});

test('all 70 supplied operators reconcile in a rolled-back import rehearsal',async()=>{
 const db=new PrismaClient({datasources:{db:{url:'postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test'}}});
 try{await db.$transaction(async tx=>{
  const scope=new Proxy(tx,{get:(t,k)=>k==='$transaction'?fn=>fn(tx):t[k]});
  await tx.cRMProduct.create({data:{id:'stockerai',name:'StockerAI'}});
  const rows=require('../docs/hoursback/stockerai-import-preview.json').operators;
  assert.equal(rows.length,70);assert.equal(rows.filter(r=>r.candidateEmails.length).length,43);
  const result=await applyImport(scope,rows);assert.equal(result.imported.length,70);assert.equal(result.unresolved.length,0);
  assert.equal(await tx.productRecipient.count({where:{productId:'stockerai',selected:true}}),0);
  assert.equal(await tx.reading.count({where:{prospectId:{in:result.imported.map(r=>r.id)}}}),0);
  assert.equal((await applyImport(scope,rows)).imported.length,0);
  throw Error('ROLLBACK_ALL_OPERATORS');
 },{timeout:30000});}catch(e){if(e.message!=='ROLLBACK_ALL_OPERATORS')throw e;}finally{await db.$disconnect();}
});
