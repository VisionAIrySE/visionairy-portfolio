const {test}=require('node:test');const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');const path=require('node:path');const fs=require('node:fs');
const {PrismaClient}=require('@prisma/client');
const url='postgresql://postgres:test@localhost:55432/hoursback_test?schema=product_build_test';
test('authenticated product routes save choices, reject bad tokens, and preserve legacy choices',async()=>{
 const root=path.resolve(__dirname,'..');assert.equal(fs.existsSync(path.join(root,'.env')),false,'Full-server test must run in the isolated checkout without production environment files');
 const db=new PrismaClient({datasources:{db:{url}}});const id='route-test-'+Date.now();let child,p;
 try{
  await db.cRMProduct.create({data:{id,name:'Route Test'}});
  p=await db.prospect.create({data:{placeId:id,name:'HTTP Test Company',email:'office@example.test'}});
  await db.productProspect.create({data:{productId:id,prospectId:p.id}});
  await db.productSequence.create({data:{productId:id,version:1,dayNumbers:[1,4,9,16,25],businessDaysOnly:true,approvedAt:new Date()}});
  child=spawn(process.execPath,['scripts/hoursback/crm-app.js'],{cwd:root,windowsHide:true,env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,NODE_PATH:process.env.NODE_PATH,DATABASE_URL:url,DIRECT_URL:url,HOST:'127.0.0.1',PORT:'3321',CRM_PASSWORD:'local-route-test',CRM_PRODUCT_PREVIEW:'1',HOURSBACK_CUSTOMER_EMAIL_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Test server did not start')),15000);child.stdout.on('data',d=>{if(String(d).includes('on port')){clearTimeout(timer);resolve();}});child.on('exit',()=>{clearTimeout(timer);reject(Error('Test server exited'));});});
  const base='http://127.0.0.1:3321';const target=base+'/products/'+id;
  const anonymous=await (await fetch(target)).text();assert.match(anonymous,/action="\/login"/);assert.doesNotMatch(anonymous,/HTTP Test Company/);
  const login=await fetch(base+'/login',{method:'POST',body:new URLSearchParams({pw:'local-route-test'}),redirect:'manual'});assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={cookie};const page=await(await fetch(target,{headers})).text();assert.match(page,/HTTP Test Company/);const csrf=page.match(/name="csrf" value="([a-f0-9]+)"/)[1];
  let response=await fetch(target+'/choices',{method:'POST',headers,body:new URLSearchParams({csrf:'bad',prospectId:p.id,inbox:'1'})});assert.equal(response.status,403);
  response=await fetch(target+'/choices',{method:'POST',headers,body:new URLSearchParams({csrf,prospectId:p.id,inbox:'1'})});assert.equal(response.status,200);assert.equal((await response.json()).selected,1);
  let updated=await(await fetch(target,{headers})).text();assert.match(updated,/Full website research/);assert.match(updated,/Message 5/);
  assert.equal((await db.prospect.findUnique({where:{id:p.id}})).emailInboxSelected,p.emailInboxSelected);
  response=await fetch(target+'/choices',{method:'POST',headers,body:new URLSearchParams({csrf,prospectId:p.id})});assert.equal((await response.json()).selected,0);
  updated=await(await fetch(target,{headers})).text();assert.match(updated,/Recipient is not selected/);
  assert.equal((await fetch(base+'/products/does-not-exist',{headers})).status,404);
  assert.equal((await fetch(base+'/product-mail-events',{method:'POST',body:'{}'})).status,401);
 }finally{
  if(child&&!child.killed){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
  await db.productMessage.deleteMany({where:{productId:id}});await db.productEnrollment.deleteMany({where:{productId:id}});await db.productRecipient.deleteMany({where:{productId:id}});await db.productProspect.deleteMany({where:{productId:id}});await db.productSequence.deleteMany({where:{productId:id}});await db.cRMProduct.deleteMany({where:{id}});if(p)await db.prospect.delete({where:{id:p.id}});await db.$disconnect();
 }
});
