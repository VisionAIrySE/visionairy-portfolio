'use strict';
const firstName=value=>String(value||'').trim().split(/\s+/)[0]||'';
function roiEmail(record){
 const named=record?.recipient?.kind==='named_contact';
 const greeting=named&&firstName(record.recipient.name)?`Hi ${firstName(record.recipient.name)},`:`Hi ${String(record?.company?.name||'there').trim()} team,`;
 return {
  touch:2,
  business_day:4,
  subject:'Could faster pre-kitting deliver over 1,000% ROI?',
  body:[
   greeting,
   'Here is the simple math behind StockerAI.',
   'If one daily route takes about 1.5 hours to pre-kit, reducing that time by 35% returns about 136.5 hours a year. At $21 per hour across 260 workdays, that is roughly $2,867 in annual labor-time value.',
   'StockerAI costs $240 per year per driver. Under those assumptions, that leaves about $2,627 in net annual value, or approximately 1,094% net ROI for each supported daily route.',
   'StockerAI reads the pick list aloud on a phone so the picker can keep both hands working. I built and tested it with an active vending operator.',
   'Hear the workflow: https://www.stocker-ai.com/demo',
   'The first 14 days are free. If the math is close to your operation, reply with the report or vending system you use, and I will confirm whether it can be tested.',
  ].join('\n\n'),
 };
}
function workflowEmail(record){
 const named=record?.recipient?.kind==='named_contact';
 const greeting=named&&firstName(record.recipient.name)?`Hi ${firstName(record.recipient.name)},`:`Hi ${String(record?.company?.name||'there').trim()} team,`;
 return {
  touch:3,
  business_day:9,
  subject:'Why StockerAI uses voice for route picking',
  body:[
   greeting,
   'The part of route picking StockerAI changes is intentionally narrow: the picker does not have to keep stopping, finding their place on paper or a screen, and then returning to the product.',
   'StockerAI reads the next item and quantity aloud on a phone. The picker keeps both hands working and says "next" when they are ready to move on.',
   'It does not replace your vending system. It starts with the picking report your system already creates. Parlevel printed pre-kitting reports are the only format already proven. Every other report or system needs a compatibility check first.',
   'If your system exports a PDF, reply with the report name or send a redacted sample. I will tell you whether it can be tested before you spend anything.',
   'You can hear the workflow here: https://www.stocker-ai.com/demo',
   'The first 14 days are free, so the useful question is whether it saves measurable time in your own operation.',
  ].join('\n\n'),
 };
}
function insertRoiEmail(sequence,record){
 const messages=Array.isArray(sequence?.messages)?sequence.messages.slice():[];
 messages[1]=roiEmail(record);
 messages[2]=workflowEmail(record);
 return {...sequence,messages};
}
module.exports={roiEmail,workflowEmail,insertRoiEmail};
