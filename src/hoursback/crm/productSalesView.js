'use strict';
const {randomUUID}=require('node:crypto');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>x?new Date(x).toISOString().slice(0,10):'';
const hidden=(name,value)=>`<input type="hidden" name="${name}" value="${esc(value)}">`;
const stageLabels={NO_CONTACT:'Not contacted',NEEDS_REVIEW:'Needs review',INITIAL_CONTACT:'Contact started',ACTIVE:'Active conversation',IN_PROCESS:'In progress',CUSTOMER:'Customer',EXPANDED_CUSTOMER:'Expanded customer',DORMANT:'Dormant'};
function readableActivity(a) {
 if(a.kind==='NEXT_ACTION_CHANGED') {try{const n=JSON.parse(a.notes);return 'Next action: '+n.after.title+' · due '+n.after.date;}catch{return 'Next action updated';}}
 if(a.kind==='STATUS_CHANGED')return a.notes.split(' to ').map(x=>stageLabels[x]||x).join(' to ');
 return a.notes;
}
function renderSales(m,forms) {
 const who=m.prospect.contacts.map(c=>`<option value="${esc(c.id)}">${esc(c.name||c.email||'Unnamed contact')}</option>`).join('');
 const recipients=m.recipients.map(r=>`<option value="${esc(r.id)}">${esc(r.email)}</option>`).join('');
 const common=hidden('prospectId',m.prospectId);
 const next=forms('next-action',`${common}<label>Next action<input name="title" required value="${esc(m.nextAction||'')}"></label><label>Due date<input type="date" name="dueDate" required value="${date(m.nextActionDate)}"></label><button>Save next action</button>`);
 const complete=m.nextAction&&m.nextActionDate?forms('complete-next-action',`${common}${hidden('expectedTitle',m.nextAction)}${hidden('expectedDate',date(m.nextActionDate))}<button>Mark next action complete</button>`):'';
 const activity=forms('activity',`${common}${hidden('eventKey',randomUUID())}<label>Activity<select name="kind"><option value="CALL">Call</option><option value="RESPONSE">Response received</option><option value="ACTION">Completed action</option><option value="NOTE">Note</option></select></label><label>Person (if known)<select name="contactId"><option value="">Company / not specified</option>${who}</select></label><label>Reply from (required for a response)<select name="recipientId"><option value="">Choose recipient</option>${recipients}</select></label><label>Call outcome (required for a call)<input name="outcome" placeholder="For example: left voicemail"></label><label>When (leave blank for now)<input type="datetime-local" name="occurredAt"></label><label>Notes<textarea name="notes" required rows="4"></textarea></label><button>Save activity</button><p>Recording a response stops follow-ups to that recipient for this product.</p>`);
 const newTask=forms('task',`${common}<label>Task<input name="title" required></label><label>Task due date<input name="dueDate" type="date" required></label><button>Add task</button>`);
 const tasks=(m.tasks||[]).map(t=>`<li data-task="${esc(t.id)}">${esc(t.title)} · due <time data-due-date="${date(t.dueDate)}">${date(t.dueDate)}</time>${forms('complete-task',`${hidden('taskId',t.id)}<button>Mark task complete</button>`)}</li>`).join('');
 const history=(m.activities||[]).map(a=>{
 const person=m.prospect.contacts.find(c=>c.id===a.contactId);const recipient=m.recipients.find(r=>r.id===a.recipientId);
 return `<li><strong>${esc({CALL:'Call',RESPONSE:'Response',ACTION:'Action completed',NOTE:'Note',NEXT_ACTION_CHANGED:'Next action',STATUS_CHANGED:'Sales status',LINKEDIN_SENT:'LinkedIn sent',LINKEDIN_RESPONSE:'LinkedIn reply'}[a.kind]||a.kind)}</strong> · <time data-timestamp="${new Date(a.occurredAt).toISOString()}">${new Date(a.occurredAt).toISOString()}</time>${person?' · '+esc(person.name||person.email):''}${recipient?' · '+esc(recipient.email):''}${a.outcome?' · '+esc(a.outcome):''}<p style="white-space:pre-wrap">${esc(readableActivity(a))}</p></li>`;
 }).join('');
 const stage=forms('sales-stage',`${common}<label>Sales status<select name="stage">${Object.entries(stageLabels).map(([v,l])=>`<option value="${v}" ${m.stage===v?'selected':''}>${l}</option>`).join('')}</select></label><button>Save status</button>`);
 return `<details class="sales"><summary>Responses, calls &amp; follow-up</summary><p class="next-action-summary">${m.nextAction?esc(m.nextAction)+' · due '+date(m.nextActionDate):'No next action set.'}</p>${next}${complete}${stage}<details><summary>Log a call, response or action</summary>${activity}</details><h3>Open tasks (<span class="open-task-count">${m._count?.tasks??(m.tasks||[]).length}</span>)</h3><ul>${tasks||'<li>No open tasks.</li>'}</ul>${newTask}<h3>Recent activity</h3><p>Showing ${(m.activities||[]).length} of ${m._count?.activities??(m.activities||[]).length} recorded activities.</p><ol>${history||'<li>No activity recorded yet.</li>'}</ol></details>`;
}
module.exports={renderSales,readableActivity};
