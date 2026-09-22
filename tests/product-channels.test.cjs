const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../src/hoursback/crm/productChannels.js');
const {renderWorkspace}=require('../src/hoursback/crm/productWorkspace.js');

test('StockerAI LinkedIn drafts are concise, specific, and free of unsupported claims',()=>{
 const drafts=C.linkedinDrafts({name:'Cascade Vending'},{name:'Maria Lopez'});
 assert.match(drafts.invite,/StockerAI/);assert.match(drafts.invite,/Cascade Vending/);
 assert.ok(drafts.invite.length<=300);assert.doesNotMatch(drafts.invite+drafts.followUp,/[—–]/);
 assert.match(drafts.followUp,/short demo/i);assert.match(drafts.followUp,/system or report/i);
 assert.doesNotMatch(drafts.followUp,/guarantee|35%|save \$/i);
});

test('phone and LinkedIn validation accepts useful values and rejects wrong destinations',()=>{
 assert.equal(C.validPhone('(503) 555-1212 x4'),'(503) 555-1212 x4');
 assert.equal(C.validPhone(''),null);
 assert.equal(C.validLinkedIn('linkedin.com/in/maria-lopez?trk=test','person'),'https://linkedin.com/in/maria-lopez');
 assert.equal(C.validLinkedIn('https://www.linkedin.com/company/cascade-vending/','company'),'https://www.linkedin.com/company/cascade-vending');
 assert.throws(()=>C.validLinkedIn('https://example.com/in/maria','person'),/LinkedIn/);
 assert.throws(()=>C.validLinkedIn('https://linkedin.com/company/cascade','person'),/person/);
});

test('product workspace shows phone and LinkedIn tools for named contacts, including contacts without email',()=>{
 const html=renderWorkspace({product:{id:'stockerai',name:'StockerAI'},count:1,page:1,memberships:[{prospectId:'p1',stage:'NO_CONTACT',activities:[],tasks:[],prospect:{id:'p1',name:'Cascade Vending',phone:'503-555-0100',contacts:[{id:'c1',name:'Maria Lopez',role:'Operations Manager',email:null,phone:null,linkedIn:null}]},recipients:[]}]},{csrf:'token'});
 assert.match(html,/Phone and LinkedIn outreach/);assert.match(html,/503-555-0100/);
 assert.match(html,/Maria Lopez/);assert.match(html,/No email address on file/);
 assert.match(html,/Find this person on LinkedIn/);assert.match(html,/Mark LinkedIn message sent/);
 assert.match(html,/Record LinkedIn reply and stop email sequence/);
});
