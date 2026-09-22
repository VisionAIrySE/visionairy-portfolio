#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');
process.chdir(path.resolve(__dirname,'../..'));
const DAYS=[1,4,9,16,25];const DEMO='https://www.stocker-ai.com/demo';
const arg=(name,fallback='')=>{const p='--'+name+'=';const hit=process.argv.slice(2).find(x=>x.startsWith(p));return hit?hit.slice(p.length):fallback;};
const clean=value=>String(value||'').trim();
function privateSettings(){const out={};try{for(const line of fs.readFileSync(process.env.CRM_ENV_FILE||'.env','utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);if(m)out[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}}catch{}return out;}
function evidence(record){return record.evidence.slice(0,12).map(x=>`- ID ${x.id}\n  Published fact: ${x.value||(x.number==null?'':x.number)}\n  Page: ${x.url}\n  Exact evidence: ${x.quote}`).join('\n');}
function prompt(record){
 const recipient=record.recipient.kind==='company_inbox'?`the ${record.company.name} team at a general company inbox. Do not invent a person.`:`${record.recipient.name||'name unavailable'}${record.recipient.role?', '+record.recipient.role:', role unavailable'}`;
 return [
  'Write a five-email founder-to-vending-operator outreach campaign for StockerAI.',
  `Company: ${record.company.name}`,
  `Recipient: ${recipient}`,
  '',
  'Verified website evidence:',evidence(record),'',
  'Product facts:',
  '- StockerAI reads a route picking report aloud on a smartphone. The picker keeps both hands working and says "next" to advance.',
  '- Parlevel printed prekitting reports are the only report format already proven. Ask about compatibility with every other report or system.',
  `- The live demo is ${DEMO}. It is the main invitation. A reply is also welcome and no meeting is required.`,
  '- The approved cadence is business days 1, 4, 9, 16, and 25.',
  '- Touch 1 introduces Russ as the founder, connects one verified company fact to the familiar route-picking task, and invites the live demo.',
  '- Touch 2 asks what report or vending system drives picking and explains that compatibility can be checked.',
  '- Touch 3 gives this transparent example only: five drivers, one route per driver per workday, 1.5 picking hours per route, $21 per hour, five workdays per week, 35% less picking time, $1,194.38 monthly time value, $100 subscription, and $1,094.38 after subscription.',
  '- Touch 4 explains that setup begins with a real report and asks what format they use.',
  '- Touch 5 is a respectful final note with the demo and an easy way to decline.',
  '',
  'Writing rules:',
  '- Make each email useful on its own while advancing the sequence. Do not assume the reader remembers an earlier email.',
  '- Use concise, natural, credible language from one business owner to another.',
  '- Ground company-specific wording only in the evidence above. Do not invent routes, systems, customers, problems, people, roles, employee counts, or results.',
  '- Describe the calculation as illustrative time value, not guaranteed payroll savings and not a claim about this company.',
  '- Do not use em dashes or en dashes. Do not use a person name in any subject line.',
  '- Do not include a signature. The CRM appends the approved StockerAI signature during delivery.',
  '- Avoid hype, generic AI language, pressure, fake familiarity, and claims that StockerAI replaces their vending system.',
  '- Keep each body between 90 and 190 words.',
  '',
  'Return JSON only: {"messages":[{"touch":1,"business_day":1,"subject":"...","body":"..."}]}',
 ].join('\n');
}
function validate(sequence,record){
 const failures=[];const messages=sequence?.messages;
 if(!Array.isArray(messages)||messages.length!==5)return ['campaign does not contain exactly five messages'];
 if(JSON.stringify(messages.map(x=>Number(x.touch)))!==JSON.stringify([1,2,3,4,5]))failures.push('message order is wrong');
 if(JSON.stringify(messages.map(x=>Number(x.business_day)))!==JSON.stringify(DAYS))failures.push('business-day cadence is wrong');
 const recipientNames=clean(record.recipient.name).toLowerCase().split(/\s+/).filter(x=>x.length>2);
 for(const [index,message] of messages.entries()){
  const subject=clean(message.subject),body=clean(message.body),words=body.split(/\s+/).filter(Boolean).length;
  if(!subject||!body)failures.push(`message ${index+1} is empty`);
  if(/[\r\n—–]/.test(subject)||/[—–]/.test(body))failures.push(`message ${index+1} has prohibited formatting`);
  if(recipientNames.some(name=>subject.toLowerCase().includes(name)))failures.push(`message ${index+1} uses the person’s name in its subject`);
  if(words<75||words>210)failures.push(`message ${index+1} is outside the acceptable length`);
  if(!body.includes(DEMO))failures.push(`message ${index+1} is missing the live demo`);
  if(/guarantee|guaranteed payroll|replace your (?:vending )?system|35% faster/i.test(body))failures.push(`message ${index+1} contains an unsupported claim`);
  if(/\bHi\s+[A-Z][a-z]+[,!]/.test(body)&&record.recipient.kind==='company_inbox')failures.push(`message ${index+1} invents a person for the company inbox`);
  if(/Russ Wright|Founder,? StockerAI|503-621-8000|russ@visionairy\.biz/i.test(body))failures.push(`message ${index+1} duplicates the delivery signature`);
 }
 return [...new Set(failures)];
}
async function modelInfo(model){const response=await fetch('https://openrouter.ai/api/v1/models',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('OpenRouter model catalog returned '+response.status);const found=(await response.json()).data.find(x=>x.id===model);if(!found)throw Error('OpenRouter does not currently list '+model);return found;}
function worstCase(record,model){const input=Math.ceil(prompt(record).length/3),output=3000;return input*Number(model.pricing.prompt||0)+output*Number(model.pricing.completion||0);}
async function main(){
 const cohortFile=path.resolve(arg('cohort','.local-test-runtime/stockerai-message-cohort.json'));const outputFile=path.resolve(arg('out','.local-test-runtime/stockerai-generated-campaigns.json'));
 const cohort=JSON.parse(fs.readFileSync(cohortFile,'utf8'));if(cohort.productId!=='stockerai'||!cohort.records?.length)throw Error('A current StockerAI cohort is required');
 if(cohort.protectedCounts?.selectedRecipients||cohort.protectedCounts?.campaigns||cohort.protectedCounts?.messages)throw Error('StockerAI production preparation is no longer empty; audit before generating');
 const modelName=arg('model','openai/gpt-5');const catalog=await modelInfo(modelName);const estimate=cohort.records.reduce((sum,r)=>sum+worstCase(r,catalog),0);
 if(!process.argv.includes('--run')){console.log(JSON.stringify({mode:'PREVIEW',model:modelName,records:cohort.records.length,companies:new Set(cohort.records.map(x=>x.prospectId)).size,currentPricing:catalog.pricing,worstCaseEstimateUsd:Number(estimate.toFixed(4)),writesToCRM:false,outputFile},null,2));return;}
 const maxSpend=Number(arg('max-spend',''));if(!Number.isFinite(maxSpend)||maxSpend<=0)throw Error('--run requires Russ’s explicit --max-spend amount');
 if(estimate>maxSpend)throw Error(`The $${maxSpend.toFixed(2)} approved ceiling is below the $${estimate.toFixed(2)} worst-case reservation`);
 const settings=privateSettings(),apiKey=settings.OPENROUTER_API_KEY||process.env.OPENROUTER_API_KEY;if(!apiKey)throw Error('OpenRouter access is not configured');
 const results=[];let spent=0;
 for(const [index,record] of cohort.records.entries()){
  const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:modelName,messages:[{role:'system',content:'You are an expert B2B email strategist. Follow every factual, structural, and formatting rule. Return JSON only.'},{role:'user',content:prompt(record)}],reasoning:{effort:'medium'},max_tokens:3000,response_format:{type:'json_object'},usage:{include:true}}),signal:AbortSignal.timeout(240000)});
  if(!response.ok)throw Error(`${modelName} returned ${response.status} while writing ${record.company.name}`);const payload=await response.json();spent+=Number(payload.usage?.cost||0);if(spent>maxSpend)throw Error('OpenRouter reported spending above the approved ceiling; generation stopped');
  let sequence;try{sequence=JSON.parse(payload.choices?.[0]?.message?.content||'{}');}catch{sequence={};}
  results.push({prospectId:record.prospectId,membershipId:record.membershipId,sequenceId:record.sequenceId,company:record.company,recipient:record.recipient,evidenceFindingIds:record.evidence.map(x=>x.id),messages:sequence.messages||[],failures:validate(sequence,record),costUsd:Number(payload.usage?.cost||0)});
  fs.writeFileSync(outputFile,JSON.stringify({productId:'stockerai',model:modelName,cohortPreparedAt:cohort.preparedAt,generatedAt:new Date().toISOString(),approvedCeilingUsd:maxSpend,spentUsd:Number(spent.toFixed(6)),intended:cohort.records.length,completed:results.length,results},null,2));
  console.log(`${index+1}/${cohort.records.length} ${record.company.name}: ${results.at(-1).failures.length?'needs review':'passed checks'}`);
 }
 const failed=results.filter(x=>x.failures.length);console.log(JSON.stringify({outputFile,intended:cohort.records.length,completed:results.length,passed:results.length-failed.length,needsReview:failed.map(x=>({company:x.company.name,reasons:x.failures})),spentUsd:Number(spent.toFixed(6)),approvedCeilingUsd:maxSpend},null,2));if(failed.length)process.exitCode=2;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={prompt,validate,worstCase};
