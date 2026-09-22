'use strict';
// Transitional scope: unassigned historical records belong to VisionAIry.
// Explicit memberships in another product alone are never legacy prospects.
const visionairyWhere={OR:[{productMemberships:{none:{}}},{productMemberships:{some:{productId:'visionairy'}}}]};
const related=new Set(['contact','outreachMessage','callLog','prospectFieldEdit','reading','finding']);
const filtered=new Set(['findMany','findFirst','findFirstOrThrow','findUnique','findUniqueOrThrow','count','aggregate','groupBy','update','updateMany','delete','deleteMany','upsert']);
function legacyClient(client,{enabled=false}={}){
 if(!enabled)return client;
 const cache=new Map();
 return new Proxy(client,{get(target,key){
  if(key==='$transaction')return (work,options)=>{
   if(typeof work!=='function')throw new Error('Scoped legacy transactions require a callback');
   return target.$transaction(tx=>work(legacyClient(tx,{enabled:true})),options);
  };
  if(['$queryRaw','$queryRawUnsafe','$executeRaw','$executeRawUnsafe'].includes(key))return (...args)=>{if(key==='$executeRawUnsafe'&&args.length===1&&args[0]==='SET TRANSACTION READ ONLY')return target[key](...args);throw new Error('Raw queries require an explicit product scope review');};
  const scope=key==='prospect'?visionairyWhere:related.has(key)?{prospect:visionairyWhere}:key==='readingPage'?{reading:{prospect:visionairyWhere}}:null;
  if(!scope){const value=target[key];return typeof value==='function'?value.bind(target):value;}
  if(cache.has(key))return cache.get(key);
  const delegate=new Proxy(target[key],{get(model,operation){
   if(typeof model[operation]!=='function')return model[operation];
   return (input={})=>{
    let args={...input};
    if(filtered.has(operation))args.where={...args.where,AND:[...(args.where?.AND?[].concat(args.where.AND):[]),scope]};
    const creation=['create','createMany','upsert'].includes(operation);
    const rows=[].concat(operation==='upsert'?args.create:args.data||[]);
    const needsCheck=related.has(key)&&(creation||rows.some(row=>row.prospectId||row.prospect));
    if(!needsCheck)return model[operation](args);
    return (async()=>{
     for(const row of rows){
      const id=row.prospectId||row.prospect?.connect?.id;
      if(!id)throw new Error('Legacy creation requires an explicit VisionAIry company');
      if(!await target.prospect.findFirst({where:{id,...visionairyWhere},select:{id:true}}))throw new Error('Company does not belong to VisionAIry');
     }
     return model[operation](args);
    })();
   };
  }});cache.set(key,delegate);return delegate;
 }});
}
module.exports={legacyClient,visionairyWhere};
