const {test}=require('node:test');
const assert=require('node:assert/strict');
const {formToken,validToken,handleProductPost}=require('../src/hoursback/crm/productActions.js');
const {renderWorkspace,script}=require('../src/hoursback/crm/productWorkspace.js');
test('form token cannot authorize another product or a stale page',async()=>{
 assert.equal(validToken('stockerai',formToken('visionairy')),false);
 assert.equal(validToken('stockerai',''),false);
 assert.equal(validToken('stockerai',formToken('stockerai')),true);
 const result=await handleProductPost({}, {productId:'stockerai',action:'choices',form:{csrf:formToken('visionairy')}});
 assert.equal(result.status,403);
});
test('recipient form starts unchecked and escapes company and email content',()=>{
 const html=renderWorkspace({product:{id:'stockerai',name:'StockerAI'},count:1,page:1,memberships:[{prospectId:'p',prospect:{name:'<script>alert(1)</script>',email:'team@example.test',contacts:[{id:'c',name:'<b>Person</b>',email:'person@example.test',role:'Owner'}]},recipients:[]}]},{csrf:formToken('stockerai')});
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);
 assert.doesNotMatch(html,/checked/);assert.match(html,/Company inbox/);
 assert.match(html,/Save recipient choices/);assert.match(html,/name="csrf"/);
 assert.match(html,/Send one test email to Russ/);assert.match(html,/cannot target a customer or send twice/);
 assert.match(html,/StockerAI companies/);assert.match(html,/only companies assigned to StockerAI/);
 assert.match(html,/Company inbox/);assert.match(html,/Add a person/);
 assert.match(html,/Company type/);assert.match(html,/Vending operator/);assert.match(html,/Machine sales or leasing vendor/);assert.match(html,/Needs review · <span class="selected-count">0/);
 assert.match(script,/if\(!dirty\.size\)\{location\.reload\(\);return;\}/);
});
test('a named person at the company inbox is shown once as the person',()=>{
 const html=renderWorkspace({product:{id:'stockerai',name:'StockerAI'},count:1,page:1,memberships:[{prospectId:'p',prospect:{name:'Denver’s Best Vending',email:'stephen@example.test',contacts:[{id:'c',name:'Stephen',email:'stephen@example.test'}]},recipients:[{recipientKey:'inbox',selected:true,enrollments:[]}]}]},{csrf:formToken('stockerai')});
 assert.match(html,/name="contacts" value="c" checked/);assert.doesNotMatch(html,/> Company inbox/);
});
test('vending company classification stays out of the VisionAIry workspace',()=>{
 const html=renderWorkspace({product:{id:'visionairy',name:'VisionAIry'},count:1,page:1,memberships:[{prospectId:'p',companyType:'OPERATOR',prospect:{name:'Example Co',contacts:[]},recipients:[]}]},{csrf:formToken('visionairy')});
 assert.doesNotMatch(html,/Company type|Vending operator|Machine sales or leasing vendor/);
});
