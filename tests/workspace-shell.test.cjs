const {test}=require('node:test');
const assert=require('node:assert/strict');
const {navigation}=require('../src/hoursback/crm/workspaceShell.js');
test('shared navigation is organized around work and switches products',()=>{
 const vision=navigation({productId:'visionairy',active:'outreach'});
 assert.match(vision,/Today/);assert.match(vision,/Outreach/);assert.match(vision,/Activity/);assert.match(vision,/Companies/);
 assert.match(vision,/href="\/email" aria-current="page"/);assert.match(vision,/VisionAIry<\/a><a href="\/products\/stockerai"/);
 assert.doesNotMatch(vision,/<nav[^>]*>[\s\S]*Needs email/);
 const stocker=navigation({productId:'stockerai',active:'activity'});
 assert.match(stocker,/href="\/products\/stockerai\?filter=activity" aria-current="page"/);
 assert.match(stocker,/href="\/products\/stockerai\?filter=today">Today/);
 assert.match(stocker,/StockerAI<\/a>/);
});
