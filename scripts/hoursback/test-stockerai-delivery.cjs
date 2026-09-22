#!/usr/bin/env node
'use strict';
const {PrismaClient}=require('@prisma/client');const T=require('../../src/hoursback/crm/productDeliveryTest.js');
const {TEST_TO,SIGNATURE,prepare}=T;
async function main(){if(!process.argv.includes('--send')||!process.argv.includes('--confirm-to='+TEST_TO)){console.log(JSON.stringify({mode:'PREVIEW',to:TEST_TO,productionChanges:['configure the approved StockerAI sender and signature','create one clearly named test campaign','select and release only the test recipient'],realEmails:1,customerEmails:0,requiredArguments:['--send','--confirm-to='+TEST_TO]},null,2));return;}const db=new PrismaClient();try{console.log(JSON.stringify(await T.sendApprovedTest(db,{apiKey:process.env.RESEND_API_KEY,inboundKey:process.env.RESEND_INBOUND_API_KEY}),null,2));}finally{await db.$disconnect();}}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={prepare,SIGNATURE,TEST_TO};
