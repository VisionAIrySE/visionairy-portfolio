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
 assert.equal(C.validEmail(' Maria@Example.Test '),'maria@example.test');
 assert.throws(()=>C.validEmail('not-an-email'),/valid email/);
 assert.equal(C.validWebsite('example.com'),'https://example.com');
 assert.equal(C.validWebsite('https://example.com/routes#top'),'https://example.com/routes');
 assert.throws(()=>C.validWebsite('javascript:alert(1)'),/valid website/);
 assert.equal(C.validPhone('(503) 555-1212 x4'),'(503) 555-1212 x4');
 assert.equal(C.validPhone(''),null);
 assert.equal(C.validLinkedIn('linkedin.com/in/maria-lopez?trk=test','person'),'https://linkedin.com/in/maria-lopez');
 assert.equal(C.validLinkedIn('https://www.linkedin.com/company/cascade-vending/','company'),'https://www.linkedin.com/company/cascade-vending');
 assert.throws(()=>C.validLinkedIn('https://example.com/in/maria','person'),/LinkedIn/);
 assert.throws(()=>C.validLinkedIn('https://linkedin.com/company/cascade','person'),/person/);
});

test('product workspace keeps company and contact editing inside the StockerAI company list',()=>{
 const html=renderWorkspace({product:{id:'stockerai',name:'StockerAI'},count:1,page:1,memberships:[{prospectId:'p1',stage:'NO_CONTACT',activities:[],tasks:[],prospect:{id:'p1',name:'Cascade Vending',address:'10 Main St',website:'https://cascade.example',phone:'503-555-0100',contacts:[{id:'c1',name:'Maria Lopez',role:'Operations Manager',email:null,phone:null,linkedIn:null}]},recipients:[]}]},{csrf:'token'});
 assert.match(html,/Company details and contacts/);assert.match(html,/503-555-0100/);
 assert.match(html,/Maria Lopez/);assert.match(html,/No email address on file/);
 assert.match(html,/Find this person on LinkedIn/);assert.match(html,/Mark LinkedIn message sent/);
 assert.match(html,/Record LinkedIn reply and stop email sequence/);
 assert.match(html,/Add a person/);assert.match(html,/name="email" type="email"/);
 assert.match(html,/Company website/);assert.match(html,/Open company website/);assert.match(html,/cascade\.example/);
 assert.match(html,/Company name/);assert.match(html,/Company address/);assert.match(html,/10 Main St/);
});
