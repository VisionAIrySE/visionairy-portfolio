#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');
process.chdir(path.resolve(__dirname,'../..'));
const DAYS=[1,4,9,16,25];const DEMO='https://www.stocker-ai.com/demo';
const arg=(name,fallback='')=>{const p='--'+name+'=';const hit=process.argv.slice(2).find(x=>x.startsWith(p));return hit?hit.slice(p.length):fallback;};
const clean=value=>String(value||'').trim();
const escapeRegex=value=>String(value||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function normalizeMessage(message){
 const normalized={...message};
 normalized.subject=clean(message?.subject).replace(/[‐‑‒–—−]/g,'-');
 normalized.body=clean(message?.body).replace(/[‐‑‒–—−]/g,'-');
 normalized.body=normalized.body
  .replace(/It fits right into existing prep without changing your vending system\./gi,'It is designed for the picking step and does not replace your vending system.')
  .replace(/this can speed up your picking process/gi,'this is worth testing for your picking process')
  .replace(/No software change, no scanner needed\./gi,'The demo shows the phone-based voice workflow.')
  .replace(/It fits right into existing prekitting and warehouse flow, without adding a screen to tap\./gi,'It is designed for the picking step, with the report read aloud instead of another screen to tap.')
  .replace(/will slot in cleanly/gi,'may be compatible');
 const closing=/(?:\n\s*)+(?:Best(?: regards)?|Regards|Sincerely|Thanks|Thank you|Thanks for considering it)[,!]?\s*(?:(?:\n\s*)+Russ(?: Wright)?)?\s*$/i;
 while(closing.test(normalized.body))normalized.body=normalized.body.replace(closing,'').trim();
 const words=normalized.body.split(/\s+/).filter(Boolean).length;
 if(words<75){
  const addition=Number(message?.touch)===5
   ? 'You can use the demo to judge the workflow on your own time, with no meeting required.'
   : 'The demo lets you hear the workflow before deciding whether a report compatibility review is worthwhile.';
  normalized.body=`${normalized.body}\n\n${addition}`;
 }
 return normalized;
}
function normalizeSequence(sequence){return {...sequence,messages:Array.isArray(sequence?.messages)?sequence.messages.map(normalizeMessage):[]};}
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
 const recipientName=clean(record.recipient.name);const firstName=recipientName.split(/\s+/)[0]||'';
 for(const [index,message] of messages.entries()){
  const subject=clean(message.subject),body=clean(message.body),words=body.split(/\s+/).filter(Boolean).length;
  if(!subject||!body)failures.push(`message ${index+1} is empty`);
  if(/[\r\n‐‑‒–—−]/.test(subject)||/[‐‑‒–—−]/.test(body))failures.push(`message ${index+1} has prohibited formatting`);
  if(record.recipient.kind!=='company_inbox'&&((firstName.length>2&&new RegExp(`\\b${escapeRegex(firstName)}\\b`,'i').test(subject))||(recipientName&&new RegExp(`\\b${escapeRegex(recipientName)}\\b`,'i').test(subject))))failures.push(`message ${index+1} uses the person’s name in its subject`);
  if(words<75||words>210)failures.push(`message ${index+1} is outside the acceptable length`);
  if(!body.includes(DEMO))failures.push(`message ${index+1} is missing the live demo`);
  const claimText=body.replace(/\b(?:not|never|is not|isn't|isn’t|does not|doesn't|doesn’t)\s+(?:a\s+)?(?:company\s+result\s+or\s+)?(?:guarantee(?:d)?|replace\s+your\s+(?:vending\s+)?system)\b/gi,'');
  if(/\bguarantee(?:d|s)?\b|\b35% faster\b|\b(?:will|can)\s+(?:save|speed up)\b|\bno scanner needed\b|\bfits right into\b/i.test(claimText))failures.push(`message ${index+1} contains an unsupported claim`);
  if(/\bHi\s+[A-Z][a-z]+[,!]/.test(body)&&record.recipient.kind==='company_inbox')failures.push(`message ${index+1} invents a person for the company inbox`);
  if(/Russ Wright|Founder,? StockerAI|503-621-8000|russ@visionairy\.biz|(?:^|\n)\s*(?:Best(?: regards)?|Regards|Sincerely|Thanks|Thank you)[,!]?\s*(?:\n\s*Russ)?\s*$/i.test(body))failures.push(`message ${index+1} duplicates the delivery signature`);
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
 let prior=null;try{prior=JSON.parse(fs.readFileSync(outputFile,'utf8'));}catch{}
 const resumable=prior?.productId==='stockerai'&&prior.model===modelName&&prior.cohortPreparedAt===cohort.preparedAt&&prior.approvedCeilingUsd===maxSpend;
 let results=resumable&&Array.isArray(prior.results)?prior.results:[];let spent=resumable?Number(prior.spentUsd||0):0;
 results=results.map(row=>{const record=cohort.records.find(x=>x.prospectId===row.prospectId&&x.recipient.recipientKey===row.recipient?.recipientKey);const normalized=normalizeSequence(row);return {...row,messages:normalized.messages,failures:record?validate(normalized,record):['recipient is no longer in the prepared cohort']};});
 if(process.argv.includes('--retry-incomplete'))results=results.filter(row=>row.messages.length===5);
 const completedKeys=new Set(results.map(x=>x.prospectId+'|'+x.recipient.recipientKey));const remaining=cohort.records.filter(x=>!completedKeys.has(x.prospectId+'|'+x.recipient.recipientKey));
 const remainingEstimate=remaining.reduce((sum,r)=>sum+worstCase(r,catalog),0);if(spent+remainingEstimate>maxSpend)throw Error(`The approved ceiling cannot reserve the remaining calls. Already spent $${spent.toFixed(4)}; remaining worst case $${remainingEstimate.toFixed(4)}`);
 const settings=privateSettings(),apiKey=settings.OPENROUTER_API_KEY||process.env.OPENROUTER_API_KEY;if(!apiKey)throw Error('OpenRouter access is not configured');
 let reserved=0,cursor=0,finished=results.length;const save=()=>fs.writeFileSync(outputFile,JSON.stringify({productId:'stockerai',model:modelName,cohortPreparedAt:cohort.preparedAt,generatedAt:new Date().toISOString(),approvedCeilingUsd:maxSpend,spentUsd:Number(spent.toFixed(6)),intended:cohort.records.length,completed:results.length,results},null,2));
 async function worker(){while(cursor<remaining.length){const record=remaining[cursor++],reserve=worstCase(record,catalog);if(spent+reserved+reserve>maxSpend)throw Error('The approved spending ceiling cannot reserve the next call');reserved+=reserve;
   let payload;try{const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:modelName,messages:[{role:'system',content:'You are an expert B2B email strategist. Follow every factual, structural, and formatting rule. Return JSON only.'},{role:'user',content:prompt(record)}],reasoning:{effort:'minimal'},max_tokens:3000,response_format:{type:'json_object'},usage:{include:true}}),signal:AbortSignal.timeout(240000)});if(!response.ok){const detail=(await response.text()).slice(0,500);throw Error(`${modelName} returned ${response.status} while writing ${record.company.name}: ${detail}`);}payload=await response.json();}finally{reserved-=reserve;}
   spent+=Number(payload.usage?.cost||0);if(spent>maxSpend)throw Error('OpenRouter reported spending above the approved ceiling; generation stopped');let sequence;const raw=payload.choices?.[0]?.message?.content||'';try{sequence=JSON.parse(raw||'{}');}catch{sequence={};}
   sequence=normalizeSequence(sequence);
   const row={prospectId:record.prospectId,membershipId:record.membershipId,sequenceId:record.sequenceId,company:record.company,recipient:record.recipient,evidenceFindingIds:record.evidence.map(x=>x.id),messages:sequence.messages||[],failures:validate(sequence,record),costUsd:Number(payload.usage?.cost||0),finishReason:payload.choices?.[0]?.finish_reason||null,usage:payload.usage||null};results.push(row);finished++;save();console.log(`${finished}/${cohort.records.length} ${record.company.name}: ${row.failures.length?'needs review':'passed checks'}`);
  }}
 await Promise.all(Array.from({length:Math.min(3,remaining.length)},()=>worker()));
 results.sort((a,b)=>cohort.records.findIndex(x=>x.prospectId===a.prospectId&&x.recipient.recipientKey===a.recipient.recipientKey)-cohort.records.findIndex(x=>x.prospectId===b.prospectId&&x.recipient.recipientKey===b.recipient.recipientKey));save();
 const failed=results.filter(x=>x.failures.length);console.log(JSON.stringify({outputFile,intended:cohort.records.length,completed:results.length,passed:results.length-failed.length,needsReview:failed.map(x=>({company:x.company.name,reasons:x.failures})),spentUsd:Number(spent.toFixed(6)),approvedCeilingUsd:maxSpend},null,2));if(failed.length)process.exitCode=2;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={prompt,validate,worstCase,normalizeMessage,normalizeSequence};
