(function(){
'use strict';
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function playerRows(names,playerRenderer){return (names||[]).map(n=>playerRenderer?playerRenderer(n):esc(n)).join('')}
function court(o){
 if(!o.match)return '<div class="scs-tm-court-card is-free"><div class="scs-tm-court-head"><strong>COURT '+o.number+'</strong><span>FREE</span></div><p>— Empty Court —</p></div>';
 let m=o.match;
 if(m.ready&&m.score){return '<div class="scs-tm-court-card is-ready scs-tm-court-result"><div class="scs-tm-court-head"><strong>COURT '+o.number+'</strong><span>'+esc(m.status)+'</span></div><small>'+esc(m.label)+'</small>'+scoredBody({left:m.leftText||((m.left||[]).join(' / ')),right:m.rightText||((m.right||[]).join(' / ')),leftPlayers:m.left||[],rightPlayers:m.right||[],score:m.score,winner:m.winner})+(m.action?'<button type="button" class="scs-tm-approve" '+m.action+'>'+esc(m.actionLabel)+'</button>':'')+'</div>';}
 return '<div class="scs-tm-court-card '+(m.ready?'is-ready':'')+'"><div class="scs-tm-court-head"><strong>COURT '+o.number+'</strong><span>'+esc(m.status)+'</span></div><small>'+esc(m.label)+'</small><div class="scs-tm-court-teams"><b>'+playerRows(m.left,o.playerRenderer)+'</b><em>VS</em><b>'+playerRows(m.right,o.playerRenderer)+'</b></div>'+(m.score?'<div class="scs-tm-court-score">'+esc(m.score)+'</div>':'')+(m.action?'<button type="button" class="'+(m.ready?'scs-tm-approve':'scs-tm-score-open')+'" '+m.action+'>'+esc(m.actionLabel)+'</button>':'')+(m.secondaryAction?'<button type="button" class="scs-tm-score-open" '+m.secondaryAction+'>'+esc(m.secondaryLabel)+'</button>':'')+'</div>';
}
function waiting(o){
 return '<div class="scs-tm-waiting-match"><b>'+esc(o.number)+'</b><span>'+(o.heading?'<small>'+esc(o.heading)+'</small><br>':'')+esc(o.left)+' <em>vs</em> '+esc(o.right)+'</span>'+(o.action?'<button type="button" class="scs-tm-match-assign '+(o.assigned?'is-assigned':'')+'" '+o.action+'>'+esc(o.label)+'</button>':'<strong class="is-progress">'+esc(o.label)+'</strong>')+'</div>';
}
// One shared scored-match renderer. Completed, awaiting approval and Conduct Match reuse this exact body.
function scoredBody(o){
 const names=(v,fallback)=>Array.isArray(v)&&v.length?v:[fallback];
 const sets=String(o.score||'').split(/\s*\|\s*/).map(x=>x.match(/^\s*(\d+)\s*[-–—:]\s*(\d+)\s*$/)).filter(Boolean);
 const teamScore=i=>sets.length?sets.map(x=>x[i+1]).join(' | '):'';
 const line=(team,raw,score,win)=>'<div class="scs-tm-completed-team '+(win?'is-winner':'')+'"><div class="scs-tm-completed-players">'+names(team,raw).map(n=>'<span class="scs-tm-shared-player"><span class="scs-tm-ring-slot" data-tm-player="'+esc(n)+'"></span><span class="scs-tm-shared-name">'+esc(n)+'</span></span>').join('')+'</div>'+(score?'<strong class="scs-tm-completed-team-score">'+esc(score)+'</strong>':'')+'</div>';
 const winner=o.winner==='left'?o.left:o.winner==='right'?o.right:'';
 return '<div class="scs-tm-completed-content"><div class="scs-tm-completed-teams">'+line(o.leftPlayers,o.left,teamScore(0),o.winner==='left')+'<span class="scs-tm-completed-vs">VS</span>'+line(o.rightPlayers,o.right,teamScore(1),o.winner==='right')+'</div>'+(winner?'<div class="scs-tm-completed-winner"><span aria-hidden="true">🏆</span><span><small>Winner</small><b>'+esc(winner)+'</b></span></div>':'')+'</div>';
}
function completed(o){
 const title=o.title||('Match '+esc(o.number));
 const action=o.action?'<button type="button" class="'+esc(o.actionClass||'scs-tm-score-open')+'" '+o.action+'>'+esc(o.actionLabel||'Continue')+'</button>':'';
 return '<article class="scs-tm-completed-row"><div class="scs-tm-completed-title"><span class="scs-tm-completed-check">✓</span><b>'+esc(title)+'</b></div>'+scoredBody(o)+action+'</article>';
}

// Grouping belongs to the shared Match Center, not a second Group renderer.
// A groupIndex is supplied only by round-robin fixtures; knockout stays unchanged.
function waitingContent(items){
 const groups=new Map(),parts=[];
 for(const item of items){
  if(typeof item==='string'||item.groupIndex==null){parts.push({plain:item});continue}
  const key=String(item.groupIndex);
  if(!groups.has(key)){const block={key,title:item.heading||('Group '+key),items:[]};groups.set(key,block);parts.push({group:block})}
  groups.get(key).items.push(item);
 }
 return parts.map(part=>{
  if(Object.prototype.hasOwnProperty.call(part,'plain'))return typeof part.plain==='string'?part.plain:waiting(part.plain);
  const g=part.group;
  return '<section class="scs-tm-group-fixtures scs-tm-group-tone-'+(Number(g.key)%8)+'"><h4>'+esc(g.title)+' <span>'+g.items.length+' matches</span></h4><div class="scs-tm-group-fixtures-list">'+g.items.map(x=>waiting({...x,heading:''})).join('')+'</div></section>';
 }).join('');
}
function panel(o){
 const count=Math.max(1,Number(o.courtCount)||1),items=o.courts||[],wait=o.waiting||[],done=o.completed||[];
 const attrs=o.attrs||{};
 const btn=(label,attr,cls)=>'<button type="button" '+attr+(cls?' class="'+cls+'"':'')+'>'+label+'</button>';
 const chooser=o.assigning?'<div class="scs-tm-court-select"><strong>Assign Match '+esc(o.assigning)+' — Choose court</strong><div class="scs-tm-court-options">'+Array.from({length:count},(_,i)=>{const n=i+1,g=items.find(x=>x.number===n),m=g&&g.match,locked=m&&(m.started||m.ready);return btn('Court '+n+' · '+(locked?'In Progress':m?'Replace '+esc(m.label):'Free'),(locked?'disabled ':'')+attrs.choose(n))}).join('')+'</div>'+btn('Cancel',attrs.cancel)+'</div>':'';
 const current=o.tab||'waiting';
 return '<section class="scs-tm-live-center"><div class="scs-tm-live-center-head"><div><small>LIVE TOURNAMENT</small><h3>Courts &amp; Match Assignment</h3></div><div class="scs-tm-court-picker scs-tm-live-count">'+btn('−',attrs.change(-1))+'<b>'+count+'</b>'+btn('+',attrs.change(1))+'</div></div><div class="scs-tm-live-courts">'+Array.from({length:count},(_,i)=>{const c=items.find(x=>x.number===i+1);return court(c||{number:i+1})}).join('')+'</div>'+chooser+'<div class="scs-tm-live-tabs">'+[['waiting','Waiting',wait.length],['completed','Completed',done.length],['ranking','Ranking',null]].map(([id,label,n])=>btn(label+(n===null?'':' <b>'+n+'</b>'),attrs.tab(id),current===id?'active':'')).join('')+'</div>'+(current==='ranking'?(o.ranking||'<div class="scs-tm-live-empty">Ranking updates from approved results.</div>'):current==='completed'?(done.map(completed).join('')||'<div class="scs-tm-live-empty">No approved matches yet.</div>'):(waitingContent(wait)||'<div class="scs-tm-live-empty">No matches awaiting play.</div>'))+'</section>';
}
window.SCSSharedMatchCenter={court,waiting,completed,panel};
})();