#!/usr/bin/env node
'use strict';
// Only deploy/enable after the product launch gates and explicit approval.
const {PrismaClient}=require('@prisma/client');
const {scheduledProductRun}=require('../../src/hoursback/crm/productScheduler.js');
const {resendProvider}=require('../../src/hoursback/crm/productResend.js');
async function main(){
 if(process.env.STOCKERAI_CUSTOMER_EMAIL_ENABLED!=='true'){console.log('StockerAI scheduled sending is disabled');return;}
 if(process.env.CRM_PRODUCT_PREVIEW!=='1')throw new Error('Shared product scope must be enabled before StockerAI sending');
 const provider=resendProvider({apiKey:process.env.RESEND_API_KEY,inboundKey:process.env.RESEND_INBOUND_API_KEY});
 const db=new PrismaClient();
 try{const result=await scheduledProductRun(db,{productId:'stockerai',enabled:true,send:provider.send});console.log(JSON.stringify(result));}
 finally{await db.$disconnect();}
}
if(require.main===module)main().catch(()=>{console.error('StockerAI scheduled run failed; inspect saved audit before retrying');process.exitCode=1;});
module.exports={main};
