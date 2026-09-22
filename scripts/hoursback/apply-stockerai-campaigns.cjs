#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');process.chdir(path.resolve(__dirname,'../..'));
try{for(const line of fs.readFileSync(process.env.CRM_ENV_FILE||'.env','utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);if(m&&process.env[m[1]]===undefined)process.env[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}}catch{}
const arg=(name,fallback='')=>{const p='--'+name+'=';const hit=process.argv.slice(2).find(x=>x.startsWith(p));return hit?hit.slice(p.length):fallback;};
const file=path.resolve(arg('file','.local-test-runtime/stockerai-generated-campaigns.json'));const batch=JSON.parse(fs.readFileSync(file,'utf8'));const B=require('../../src/hoursback/crm/productCampaignBatch.js');
B.validateBatch(batch);
if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'PREVIEW',file,model:batch.model,intended:batch.intended,messages:batch.results.reduce((n,x)=>n+x.messages.length,0),selectedRecipientsToCreate:0,writesProduction:false},null,2));process.exit(0);}
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();B.applyBatch(db,batch).then(result=>console.log(JSON.stringify({...result,file},null,2))).catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
