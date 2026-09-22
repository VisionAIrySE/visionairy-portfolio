'use strict';
const crypto=require('node:crypto');
const R=require('./productReadiness.js');
const C=require('./productChannels.js');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function productWorkspace(db, productId, {page=1}={}) {
  if(!Number.isSafeInteger(page)||page<1) throw new Error('Invalid page');
  const product=await db.cRMProduct.findUnique({where:{id:productId}});
  if(!product) return null;
  const where={productId};
  const [count,memberships,preparation]=await Promise.all([
    db.productProspect.count({where}),
    db.productProspect.findMany({where,orderBy:{id:'asc'},skip:(page-1)*25,take:25,include:{activities:{orderBy:[{occurredAt:'desc'},{id:'desc'}],take:50},tasks:{where:{completedAt:null},orderBy:[{dueDate:'asc'},{id:'asc'}]},_count:{select:{activities:true,tasks:{where:{completedAt:null}}}},prospect:{include:R.prospectInclude},recipients:{include:{enrollments:{include:{sequence:true,messages:{orderBy:{touch:'asc'}}}}}}}}),
    require('./productProgress.js').productPreparationSummary(db,productId),
  ]);
  const emails=[...new Set(memberships.flatMap(m=>m.recipients.map(r=>R.norm(r.email))))];
  const stops=await db.emailAddressStop.findMany({where:{email:{in:emails}}});
  const stopped=new Map(stops.map(s=>[s.email,s]));
  const unresolved=await db.productMailEvent.findMany({where:{fromAddress:{in:emails},eventType:'email.received',state:{in:['PENDING','UNMATCHED']}},select:{fromAddress:true}});
  const replyHolds=new Set(unresolved.map(e=>e.fromAddress));
  for(const m of memberships)for(const r of m.recipients)for(const e of r.enrollments){
    e.readiness=R.readiness({...e,sequence:{...e.sequence,product},recipient:{...r,membership:m},addressStop:stopped.get(R.norm(r.email)),replyNeedsReview:replyHolds.has(R.norm(r.email))});
  }
  return {product,count,memberships,page,preparation};
}
function renderReadiness(result){
 if(!result)return '<p>Readiness has not been checked.</p>';
 return result.ready?'<p>All preparation checks pass. Sending still requires release.</p>':'<p>Not ready to send:</p><ul>'+result.reasons.map(reason=>'<li>'+esc(reason)+'</li>').join('')+'</ul>';
}
const hidden=(name,value)=>`<input type="hidden" name="${name}" value="${esc(value)}">`;
const linkedInSearch=(type,keywords)=>`https://www.linkedin.com/search/results/${type}/?keywords=${encodeURIComponent(keywords)}`;
function renderOutreachChannels(m,forms){
 const p=m.prospect;const activities=m.activities||[];const companyPhone=p.phoneManualValue||p.phone||'';
 const companyLink=p.linkedInUrl?`<a href="${esc(p.linkedInUrl)}" target="_blank" rel="noopener">Open company LinkedIn page</a>`:`<a href="${esc(linkedInSearch('companies',p.name))}" target="_blank" rel="noopener">Find company on LinkedIn</a>`;
 const companyForm=forms('company-channels',`${hidden('prospectId',p.id)}<label>Company phone<input name="phone" value="${esc(companyPhone)}" placeholder="Company phone"></label><label>Company LinkedIn page<input name="linkedInUrl" value="${esc(p.linkedInUrl||'')}" placeholder="https://www.linkedin.com/company/..."></label><button type="submit">Save company details</button>`);
 const contacts=(p.contacts||[]).filter(c=>!c.setAsideAt&&c.name).map(contact=>{
  const drafts=C.linkedinDrafts(p,contact);const search=linkedInSearch('people',contact.name+' '+p.name);
  const sent=activities.find(a=>a.contactId===contact.id&&a.kind==='LINKEDIN_SENT');const replied=activities.find(a=>a.contactId===contact.id&&a.kind==='LINKEDIN_RESPONSE');
  const details=forms('contact-channels',`${hidden('prospectId',p.id)}${hidden('contactId',contact.id)}<label>Direct phone<input name="phone" value="${esc(contact.phone||'')}" placeholder="Direct phone"></label><label>LinkedIn profile<input name="linkedIn" value="${esc(contact.linkedIn||'')}" placeholder="https://www.linkedin.com/in/..."></label><button type="submit">Save contact details</button>`);
  const sentForm=forms('linkedin-sent',`${hidden('prospectId',p.id)}${hidden('contactId',contact.id)}${hidden('eventKey',crypto.randomUUID())}<button type="submit">Mark LinkedIn message sent</button>`);
  const replyForm=forms('linkedin-reply',`${hidden('prospectId',p.id)}${hidden('contactId',contact.id)}${hidden('eventKey',crypto.randomUUID())}<button type="submit">Record LinkedIn reply and stop email sequence</button>`);
  return `<article class="contact-card"><h4>${esc(contact.name)}${contact.role?' · '+esc(contact.role):''}</h4><p>${contact.email?`Email: ${esc(contact.email)}`:'No email address on file'}${contact.phone?` · Phone: ${esc(contact.phone)}`:''}</p><p>${contact.linkedIn?`<a href="${esc(contact.linkedIn)}" target="_blank" rel="noopener">Open LinkedIn profile</a>`:`<a href="${esc(search)}" target="_blank" rel="noopener">Find this person on LinkedIn</a>`}</p>${details}<details><summary>LinkedIn message drafts</summary><p>Copy these into LinkedIn. The CRM does not send LinkedIn messages automatically.</p><label>Connection note<textarea rows="4">${esc(drafts.invite)}</textarea><small>${drafts.invite.length} of 300 characters</small></label><label>Message after connecting<textarea rows="7">${esc(drafts.followUp)}</textarea></label><div class="channel-actions">${sentForm}${replyForm}</div>${replied?'<p class="notice">LinkedIn reply recorded. This contact’s StockerAI email sequence is stopped.</p>':sent?'<p>LinkedIn message recorded as sent.</p>':''}</details></article>`;
 }).join('');
 return `<details class="outreach"><summary>Phone and LinkedIn outreach</summary><p>${companyPhone?`Company phone: <a href="tel:${esc(companyPhone.replace(/[^0-9+]/g,''))}">${esc(companyPhone)}</a>`:'No company phone is saved.'} · ${companyLink}</p>${companyForm}<h3>Named contacts</h3>${contacts||'<p>No named contacts are on file yet. Company inboxes are not treated as people.</p>'}</details>`;
}
function renderWorkspace(model,{csrf=''}={}) {
  const {product,memberships,count,page,preparation}=model;
  const base='/products/'+encodeURIComponent(product.id);
  const forms=(action,body)=>`<form method="post" action="${base}/${action}">${hidden('csrf',csrf)}${body}<span role="status" class="save-status"></span></form>`;
  const companies=memberships.map(m=>{
    const selected=new Set(m.recipients.filter(r=>r.selected).map(r=>r.recipientKey));
    const inbox=m.prospect.emailManualValue || m.prospect.email;
    const blocked=Boolean(m.archivedAt || m.prospect.doNotContact || m.prospect.emailBouncedAt);
    const choices=m.prospect.contacts.filter(c=>c.email&&!c.setAsideAt).map(c=>`<label class="recipient"><input type="checkbox" name="contacts" value="${esc(c.id)}" ${selected.has('contact:'+c.id)?'checked':''} ${c.bouncedAt?'disabled':''}> ${esc(c.name || c.email)} ${c.role?'· '+esc(c.role):''}<small>${esc(c.email)}${c.bouncedAt?' · bounced':''}</small></label>`).join('');
    const picker=forms('choices',`${hidden('prospectId',m.prospectId)}<fieldset ${m.archivedAt?'disabled':''}><legend>Choose recipients</legend>${choices}${inbox?`<label class="recipient"><input type="checkbox" name="inbox" value="1" ${selected.has('inbox')?'checked':''}> Company inbox<small>${esc(inbox)}</small></label>`:''}${!choices&&!inbox?'<p>No email addresses on file.</p>':''}<button type="submit">Save recipient choices</button></fieldset>`);
    const campaigns=m.recipients.map(r=>{
      const person=m.prospect.contacts.find(c=>c.id===r.contactId);
      const label=r.recipientKey==='inbox'?'Company inbox':person?.name||r.email;
      return `<details class="campaign" data-recipient-key="${esc(r.recipientKey)}"><summary>${esc(label)} · ${esc(r.email)} · <span class="recipient-status">${r.selected?'Selected':'Not selected'}</span></summary>${r.enrollments.map(e=>{
        const editable=e.state==='DRAFT'&&!e.startedAt&&!e.stoppedAt;
        return `<section data-enrollment="${esc(e.id)}"><h3>Sequence ${e.sequence.version}</h3><p><span class="saved-count">${e.messages.length}</span> of ${e.sequence.dayNumbers.length} messages saved. </p><div class="readiness" role="status">${renderReadiness(e.readiness)}</div>${e.sequence.dayNumbers.map((day,i)=>{
          const msg=e.messages.find(x=>x.touch===i+1);
          const body=`${hidden('enrollmentId',e.id)}${hidden('touch',i+1)}<h4>Message ${i+1} · ${e.sequence.businessDaysOnly?'Business day':'Day'} ${day}</h4><label>Subject<input name="subject" required value="${esc(msg?.subject||'')}" ${editable?'':'disabled'}></label><label>Message<textarea name="body" required rows="9" ${editable?'':'disabled'}>${esc(msg?.body||'')}</textarea></label>${editable?'<button type="submit">Save message</button>':'<p>This campaign has started or stopped; its messages are locked.</p>'}`;
          return forms('draft',body);
        }).join('')}</section>`;
      }).join('')||'<p>No campaign prepared yet. Save recipient choices to prepare a draft sequence when an approved sequence is configured.</p>'}</details>`;
    }).join('');
    return `<details class="company" data-company="${esc(m.prospectId)}"><summary>${esc(m.prospect.name)} · <span class="selected-count">${selected.size}</span> selected</summary>${blocked?'<p class="notice">Sending is blocked for this company. No messages will be sent.</p>':''}${renderOutreachChannels(m,forms)}${require('./productSalesView.js').renderSales(m,forms)}${picker}${campaigns}</details>`;
  }).join('');
  const sendState=product.sendingEnabled?'Sending is enabled. Selected campaigns that pass every check begin at 10:00 AM Pacific on a scheduled business day.':'Sending is paused. You can review and select recipients, but no StockerAI email can leave until launch is explicitly enabled.';
  const deliveryTest=product.id==='stockerai'?`<section class="delivery-test" aria-label="Controlled delivery test"><h2>Delivery and reply test</h2><p>This sends exactly one clearly labeled test email to russ@visionairy.biz. It cannot target a customer or send twice.</p>${forms('test-delivery','<button type="submit">Send one test email to Russ</button>')}</section>`:'';
  return `<main><h1>${esc(product.name)}</h1><p class="notice">${sendState}</p>${deliveryTest}<p>${count} companies in this product</p>${preparation?`<section aria-label="Whole product research progress"><h2>Preparation overview</h2><p>${preparation.researched} of ${preparation.total} active companies fully researched · ${preparation.unresearched} still need research.</p><p>${preparation.withEmail} have an email address on file; ${preparation.researchedWithEmail} of those are researched. Addresses still require review. ${preparation.archived} companies are archived.</p></section>`:''}<aside class="bulk-save"><button type="button" id="save-recipient-choices">Save all recipient choices</button><p id="bulk-status" role="status">Only changed recipient choices on this page are saved.</p></aside>${companies||'<p>No companies imported for this product yet.</p>'}${page>1?`<a href="${base}?page=${page-1}">Previous</a>`:''} ${page*25<count?`<a href="${base}?page=${page+1}">Next</a>`:''}</main>`;
}
const styles=`.delivery-test{background:#fff8e6;border:1px solid #d9a514;border-radius:10px;padding:16px;margin:14px 0}.delivery-test form{margin-bottom:0}.bulk-save{position:sticky;top:12px;float:right;max-width:240px;background:#fff;padding:12px;border:1px solid #d2dbe3;border-radius:8px;z-index:2}.bulk-save p{font-size:13px} @media(max-width:700px){.bulk-save{float:none;max-width:none;top:0}}body{font:16px system-ui,sans-serif;background:#f5f7fa;color:#172b3a;margin:0}nav,main{max-width:1000px;margin:auto;padding:20px}nav a{display:inline-block;padding:12px;background:white;border-radius:8px;margin-right:12px}h1{margin-top:0}.notice{background:#e9eff7;padding:12px;border-radius:8px}.company,.campaign,.outreach{background:white;border:1px solid #d2dbe3;border-radius:10px;padding:16px;margin:14px 0}.contact-card{border-top:1px solid #d2dbe3;padding-top:10px;margin-top:16px}.channel-actions{display:flex;gap:10px;flex-wrap:wrap}.channel-actions form{margin:0}summary{cursor:pointer;font-weight:600}fieldset{border:0;padding:12px 0}label{display:block;margin:12px 0}small{display:block;margin-left:24px;color:#536575}input:not([type=checkbox]):not([type=hidden]),textarea{display:block;box-sizing:border-box;width:100%;padding:10px;margin-top:6px;border:1px solid #aab7c3;border-radius:6px;font:inherit}button{padding:10px 16px;border:0;border-radius:6px;background:#174e70;color:white;cursor:pointer}button:disabled{opacity:.6}.save-status{display:block;margin:10px 0}form{margin-bottom:24px}a{color:#174e70}`;
const script=`<script>
const dirty=new Set();
const today=new Date();const localDay=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
document.querySelectorAll('[data-timestamp]').forEach(t=>t.textContent=new Date(t.dataset.timestamp).toLocaleString());
document.querySelectorAll('[data-due-date]').forEach(t=>{if(t.dataset.dueDate<localDay)t.append(' (overdue)');else if(t.dataset.dueDate===localDay)t.append(' (today)');});
function wireForm(form){
 form.addEventListener('input',()=>{dirty.add(form);form.editVersion=(form.editVersion||0)+1;});
 form.saveChanges=async event=>{
  event.preventDefault(); if(form.saving)return;form.saving=true;const version=form.editVersion||0; const button=form.querySelector('button'); const status=form.querySelector('[role=status]');
  button.disabled=true; status.textContent='Saving…';
  try {
   const values=new URLSearchParams(new FormData(form));
   if(values.get('occurredAt')) values.set('occurredAt',new Date(values.get('occurredAt')).toISOString());
   const response=await fetch(form.action,{method:'POST',body:values,headers:{Accept:'application/json'}});
   const result=await response.json(); if(!response.ok) throw new Error(result.error||'Save failed. Your changes are still here.');
   if((form.editVersion||0)===version)dirty.delete(form);status.textContent=result.message+(dirty.has(form)?' Newer changes still need saving.':'');
   if(result.refreshSales){
    const oldPanel=form.closest('.sales');
    if(![...dirty].some(f=>oldPanel.contains(f))){
     try{
      const response=await fetch(location.href,{headers:{Accept:'text/html'}});if(!response.ok)throw new Error('refresh');
      const page=new DOMParser().parseFromString(await response.text(),'text/html');
      const company=[...page.querySelectorAll('[data-company]')].find(c=>c.dataset.company===form.closest('.company').dataset.company);
      const replacement=company?.querySelector('.sales');if(!replacement)throw new Error('refresh');
      replacement.open=true;oldPanel.replaceWith(replacement);
      replacement.querySelectorAll('form').forEach(wireForm);
      replacement.querySelectorAll('[data-timestamp]').forEach(t=>t.textContent=new Date(t.dataset.timestamp).toLocaleString());
      replacement.querySelectorAll('[data-due-date]').forEach(t=>{if(t.dataset.dueDate<localDay)t.append(' (overdue)');else if(t.dataset.dueDate===localDay)t.append(' (today)');});
      const confirmation=document.createElement('p');confirmation.setAttribute('role','status');confirmation.textContent=result.message;replacement.querySelector('summary').after(confirmation);
      return;
     }catch{status.textContent=result.message+' Refresh the page to see the saved details.';}
    }else result.refresh=true;
   }
   if(result.readiness){
    const company=form.closest('.company');
    for(const [id,check] of Object.entries(result.readiness)){
     const panel=[...company.querySelectorAll('[data-enrollment]')].find(e=>e.dataset.enrollment===id)?.querySelector('.readiness');
     if(!panel)continue;panel.replaceChildren();
     const title=document.createElement('p');title.textContent=check.ready?'All preparation checks pass. Sending still requires release.':'Not ready to send:';panel.append(title);
     if(!check.ready){const list=document.createElement('ul');for(const reason of check.reasons){const item=document.createElement('li');item.textContent=reason;list.append(item);}panel.append(list);}
    }
   }
   if(result.selected!==undefined) {
    const company=form.closest('.company');company.querySelector('.selected-count').textContent=result.selected;
    const keys=new Set(values.getAll('contacts').map(id=>'contact:'+id));if(values.get('inbox')==='1')keys.add('inbox');
    company.querySelectorAll('[data-recipient-key]').forEach(c=>c.querySelector('.recipient-status').textContent=keys.has(c.dataset.recipientKey)?'Selected':'Not selected');
   }
   if(result.taskCompleted) {const count=form.closest('.sales').querySelector('.open-task-count');count.textContent=Math.max(0,Number(count.textContent)-1);form.closest('[data-task]').remove();}
   if(result.nextAction!==undefined) form.closest('.company').querySelector('.next-action-summary').textContent=result.nextAction;
   if(result.eventKey) form.querySelector('[name=eventKey]').value=result.eventKey;
   if(result.savedCount!==undefined) form.closest('[data-enrollment]').querySelector('.saved-count').textContent=result.savedCount;
   if(result.refresh){const link=document.createElement('a');link.href=location.href;link.textContent=' Refresh to see saved details';status.append(link);}
  }catch(error){status.textContent=error.message||'Save failed. Your changes are still here.';}
  finally{button.disabled=false;form.saving=false;}
 };
 form.addEventListener('submit',form.saveChanges);
}
document.querySelectorAll('form').forEach(wireForm);
document.querySelector('#save-recipient-choices')?.addEventListener('click',async event=>{
 const button=event.currentTarget;button.disabled=true;const status=document.querySelector('#bulk-status');
 const forms=[...dirty].filter(f=>new URL(f.action).pathname.endsWith('/choices'));let saved=0,failed=0;
 try{for(const form of forms){status.textContent='Saving choices '+(saved+failed+1)+' of '+forms.length+'…';await form.saveChanges({preventDefault(){}});if(dirty.has(form))failed++;else saved++;}
 status.textContent=forms.length?saved+' '+(saved===1?'company':'companies')+' saved.'+(failed?' '+failed+' could not be saved; their choices remain on screen.':''):'No recipient choices have changed.';
 }finally{button.disabled=false;}
});
window.addEventListener('beforeunload',event=>{if(dirty.size){event.preventDefault();event.returnValue='';}});
</script>`;
module.exports={productWorkspace,renderWorkspace,styles,script};
