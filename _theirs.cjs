const {PrismaClient}=require('@prisma/client'); const db=new PrismaClient();
const U=require('./scripts/hoursback/understand-businesses.js');
(async()=>{
 for(const n of ['3DEXPERIENCE','Lar-Moon','Cascade Pump']){
   const p=await db.prospect.findFirst({where:{name:{contains:n}}});
   if(!p){ console.log(`${n}: not found`); continue; }
   const t0=Date.now();
   const v=await U.visitOneBusiness(db,p,{});
   console.log(`${String(p.name).slice(0,34).padEnd(36)} ${String(v.outcome).padEnd(16)} ${v.fetched} pages  ${v.modelCalls} questions  ${Math.round((Date.now()-t0)/1000)}s${v.whoseSiteItIs?`  -> ${v.whoseSiteItIs}`:''}`);
 }
 await db.$disconnect();
})();
