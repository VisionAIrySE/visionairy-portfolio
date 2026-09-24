'use strict';

const DEMO_URL='https://www.stocker-ai.com/demo';

function occurrences(text,needle){return String(text||'').split(needle).length-1;}

function duplicateContentIssue(body){
 const text=String(body||'').trim();
 if(occurrences(text,DEMO_URL)>1)return 'repeats the live demo link and appears to contain duplicated email copy';
 if((text.match(/\b(?:I['’]?m|I am)\s+Russ\b/gi)||[]).length>1)return 'repeats the sender introduction and appears to contain duplicated email copy';
 const paragraphs=text.split(/\n\s*\n/).map(value=>value.trim().replace(/\s+/g,' ')).filter(value=>value.length>=60);
 if(new Set(paragraphs.map(value=>value.toLowerCase())).size!==paragraphs.length)return 'contains a repeated paragraph';
 return null;
}

module.exports={DEMO_URL,duplicateContentIssue};
