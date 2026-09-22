'use strict';
const {prospectInclude}=require('./productReadiness.js');
async function productPreparationSummary(db,productId){
 const active={productId,archivedAt:null};
 const hasEmail={OR:[{email:{not:null}},{emailManualValue:{not:null}},{contacts:{some:{email:{not:null},setAsideAt:null,bouncedAt:null}}}]};
 const fullResearch={readings:{some:prospectInclude.readings.where}};
 const [total,archived,withEmail,researched,researchedWithEmail]=await Promise.all([
  db.productProspect.count({where:active}),db.productProspect.count({where:{productId,archivedAt:{not:null}}}),
  db.productProspect.count({where:{...active,prospect:hasEmail}}),db.productProspect.count({where:{...active,prospect:fullResearch}}),
  db.productProspect.count({where:{...active,prospect:{AND:[hasEmail,fullResearch]}}})
 ]);
 return {total,archived,withEmail,researched,researchedWithEmail,unresearched:total-researched};
}
module.exports={productPreparationSummary};
