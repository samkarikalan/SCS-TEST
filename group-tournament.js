(function(){
'use strict';
const KEY='scs_group_tournament_ui_v1';
 let title='Group Tournament',config={groups:4,per:4,knockouts:1,top:2,bottom:1},created=false,assistStep=0,assistPatternReady=false,assistMode=true,tab='main',pool=[],teamDrafts=[],assignments={},started=false,matches=[],courtCount=2,assignmentSerial=0,matchTab='waiting',assigningMatch=null;
const el=()=>document.getElementById('scsGroupTournament');
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function load(){try{let v=JSON.parse(localStorage.getItem(KEY));if(v){title=String(v.title||'Group Tournament');config=v.config||config;created=!!v.created;assistMode=typeof v.assistMode==='boolean'?v.assistMode:!created;assistPatternReady=!!v.assistPatternReady;pool=Array.isArray(v.pool)?v.pool:[];assignments=v.assignments||{};teamDrafts=Array.isArray(v.teamDrafts)?v.teamDrafts:Object.keys(assignments).sort().map(k=>assignments[k]).filter(x=>Array.isArray(x)&&x.length===2);started=!!v.started;matches=Array.isArray(v.matches)?v.matches:[];courtCount=Number(v.courtCount)||2;assignmentSerial=Number(v.assignmentSerial)||0}}catch(e){}}
 function save(){try{const state={title,config,created,assistMode,assistPatternReady,pool,teamDrafts,assignments,started,matches,courtCount,assignmentSerial};localStorage.setItem(KEY,JSON.stringify(state));if(typeof window.scsQueueTournamentCloudSave==='function')window.scsQueueTournamentCloudSave('group',state)}catch(e){}}
function open(mode){
 load();assistStep=0;
 // Creation must enter Assist, never the legacy organizer page.
 // Continue retains an existing started tournament's organizer interface.
 if(mode==='new'){
  if(started||created){
   if(!confirm('Start a new Group Tournament? Your existing saved tournament will be replaced.'))return;
    title='Group Tournament';config={groups:4,per:4,knockouts:1,top:2,bottom:1};pool=[];teamDrafts=[];assignments={};matches=[];
   started=false;created=false;assistPatternReady=false;assignmentSerial=0;
  }
  assistMode=true;save();
 }else if(!started){
  // Saved-but-unstarted tournaments return to the Assist index.
  assistMode=true;save();
 }
 if(!el()){let d=document.createElement('div');d.id='scsGroupTournament';d.className='scs-gt-overlay';document.body.appendChild(d)}
 render();
}
function close(){el()?.remove();if(window.scsTournamentReturnPage&&typeof window.scsReturnToTournamentParent==='function')window.scsReturnToTournamentParent()}
function card(title,body){return '<section class="scs-gt-card"><h3>'+title+'</h3>'+body+'</section>'}
function setup(){
let fields=[['groups','Number of groups',config.groups],['per','Teams per group',config.per],['knockouts','Number of knockouts (1 or 2)',config.knockouts],['top',config.knockouts===1?'Qualifiers per group':'Top knockout qualifiers per group',config.top]];
if(config.knockouts===2)fields.push(['bottom','Bottom knockout qualifiers per group',config.bottom]);
return card('Create Group Tournament','<label class="scs-gt-title-field">Tournament name<input type="text" maxlength="120" data-title value="'+escapeHTML(title)+'" placeholder="e.g. Autumn Club Championship"></label><div class="scs-gt-fields">'+fields.map(([key,label,val])=>'<label>'+label+'<input type="number" min="1" '+(key==='knockouts'?'max="2"':'')+' data-config="'+key+'" value="'+val+'"></label>').join('')+'</div><p>Top knockout selects the highest-ranked teams in each group. Bottom knockout selects the next positions, without duplicates.</p><button class="scs-gt-primary" data-action="create">Create Groups</button>');
}
function registry(){
 const names=[];function add(items){(Array.isArray(items)?items:[]).forEach(p=>{let n=typeof p==='string'?p:p&&p.name;if(n&&String(n).trim())names.push(String(n).trim())})}
 try{if(typeof schedulerState!=='undefined'&&schedulerState)add(schedulerState.allPlayers)}catch(e){}
 try{add(JSON.parse(localStorage.getItem('schedulerPlayers')||'[]'))}catch(e){}
 try{if(window.SCSCourtCenter&&typeof window.SCSCourtCenter.playerNames==='function')add(window.SCSCourtCenter.playerNames())}catch(e){}
 return [...new Map(names.map(n=>[n.toLocaleLowerCase(),n])).values()].sort((a,b)=>a.localeCompare(b));
}
function assignedNames(){return Object.values(assignments).flat().filter(Boolean)}
function groupLabel(i){let out='';do{out=String.fromCharCode(65+i%26)+out;i=Math.floor(i/26)-1}while(i>=0);return out}
// Approved scoreboard results are the single source for both group standings
// and Match Center Completed. Never use initial slot positions as rankings.
function groupResults(g){
 const teams=Array.from({length:config.per},(_,j)=>({id:g+':'+j,w:0,l:0,gw:0,gl:0,pf:0,pa:0,played:0}));
 const byId=new Map(teams.map(t=>[t.id,t]));
 const approved=matches.filter(m=>Number(m.group)===g&&m.status==='approved');
 for(const m of approved){
  const a=byId.get(m.a),b=byId.get(m.b);if(!a||!b)continue;
  const winner=m.winner==='L'?a:m.winner==='R'?b:null;
  if(!winner)continue;
  winner.w++;(winner===a?b:a).l++;a.played++;b.played++;
  const sets=m.score&&Array.isArray(m.score.completedSets)?m.score.completedSets:[];
  for(const set of sets){
   if(!Array.isArray(set.score)||set.score.length<2)continue;
   const x=Number(set.score[0]),y=Number(set.score[1]);
   if(!Number.isFinite(x)||!Number.isFinite(y))continue;
   a.pf+=x;a.pa+=y;b.pf+=y;b.pa+=x;
   if(x>y){a.gw++;b.gl++}else if(y>x){b.gw++;a.gl++}
  }
 }
 // For a two-team match-win tie, use head-to-head; larger ties use
 // game difference, then point difference. Exact unresolved ties stay tied.
 function compare(a,b){
  if(a.w!==b.w)return b.w-a.w;
  const tied=teams.filter(t=>t.w===a.w);
  if(tied.length===2){
   const head=approved.find(m=>(m.a===a.id&&m.b===b.id)||(m.a===b.id&&m.b===a.id));
   if(head&&['L','R'].includes(head.winner)){
    const winId=head.winner==='L'?head.a:head.b;
    return winId===a.id?-1:1;
   }
  }
  const gd=(b.gw-b.gl)-(a.gw-a.gl);if(gd)return gd;
  return (b.pf-b.pa)-(a.pf-a.pa);
 }
 return teams.sort(compare);
}
function groups(){
 return Array.from({length:config.groups},(_,g)=>{
   const ranked=started?groupResults(g):Array.from({length:config.per},(_,j)=>({id:g+':'+j,w:0,l:0,gw:0,gl:0,pf:0,pa:0,played:0}));
   if(!started){
    return '<section class="scs-tm-pool scs-gt-team-pool"><div class="scs-tm-pool-heading"><div><small>GROUP '+groupLabel(g)+' TEAMS</small><h3>Teams ('+ranked.length+')</h3></div></div><div class="scs-gt-team-card-list">'+ranked.map((t,i)=>{
     const players=assignments[t.id]||[];
     return '<button type="button" class="scs-gt-knockout-team-card" data-slot="'+t.id+'" aria-label="Edit team '+(i+1)+' in Group '+groupLabel(g)+'"><span class="scs-gt-team-card-number">'+(i+1)+'</span><span class="scs-gt-team-card-players">'+(players.length?players.map(playerRow).join(''):'<span class="scs-gt-unassigned">Select two players</span>')+'</span><span class="scs-gt-team-card-edit" aria-hidden="true">✎</span></button>';
    }).join('')+'</div></section>';
   }
   return card('Group '+groupLabel(g),'<div class="scs-gt-standings"><div class="scs-gt-head"><span>Position</span><span>Team</span><span>W</span><span>GD</span><span>PD</span></div>'+ranked.map((t,i)=>{
   const players=assignments[t.id]||[];
   const row='<span>'+(i+1)+'</span><span>'+(players.length?'<span class="scs-gt-team-players">'+players.map(playerRow).join('')+'</span>':'<span class="scs-gt-unassigned">Assign players</span>')+'</span><span>'+(started?t.w:'—')+'</span><span>'+(started?t.gw-t.gl:'—')+'</span><span>'+(started?t.pf-t.pa:'—')+'</span>';
   return started?'<div class="scs-gt-head scs-gt-team scs-gt-result-row">'+row+'</div>':'<button type="button" class="scs-gt-head scs-gt-team" data-slot="'+t.id+'">'+row+'</button>';
  }).join('')+'</div>');
 }).join('');
}

function playerRow(name){return '<span class="scs-tm-shared-player"><span class="scs-tm-ring-slot" data-tm-player="'+escapeHTML(name)+'"></span><span class="scs-tm-shared-name">'+escapeHTML(name)+'</span></span>'}
function hydratePlayerCards(){
 if(typeof createRatingRing!=='function')return;
 el().querySelectorAll('.scs-tm-ring-slot[data-tm-player]').forEach(slot=>{
  if(slot.firstChild)return;
  const name=slot.dataset.tmPlayer;
  const list=[];try{if(typeof schedulerState!=='undefined'&&schedulerState&&Array.isArray(schedulerState.allPlayers))list.push(...schedulerState.allPlayers)}catch(e){}
  try{let a=JSON.parse(localStorage.getItem('schedulerPlayers')||'[]');if(Array.isArray(a))list.push(...a)}catch(e){}
  const player=list.find(p=>p&&typeof p==='object'&&String(p.name||'').toLowerCase()===name.toLowerCase());
  const rating=Number(player&&(player.activeRating||player.clubRating||player.rating));
  try{slot.appendChild(createRatingRing(name,player&&(player.gender||player.sex)||'Male',Number.isFinite(rating)&&rating>=1?rating:null))}catch(e){}
 });
}
function players(){
  return '<section class="scs-tm-pool"><div class="scs-tm-pool-heading"><div><small>TOURNAMENT PLAYERS</small><h3>Players ('+pool.length+')</h3></div><div class="scs-tm-pool-actions"><button type="button" data-toggle-pool>'+(poolExpanded?'Hide ▲':'Show ▼')+'</button><button type="button" data-open-manager>+ Players Manager</button></div></div>'+(poolExpanded?(pool.length?'<div class="scs-tm-pool-chips">'+pool.map(playerRow).join('')+'</div>':'<p>Select players using the existing Players Manager.</p>'):'')+'</section>';
}
function teamsCard(){
 return '<section class="scs-tm-pool scs-gt-team-pool"><div class="scs-tm-pool-heading"><div><small>TOURNAMENT TEAMS</small><h3>Teams ('+teamDrafts.length+')</h3></div><div class="scs-tm-pool-actions"><button type="button" data-add-team aria-label="Add team" title="Add team">+</button></div></div>'+(teamDrafts.length?'<div class="scs-gt-team-card-list">'+teamDrafts.map((players,index)=>{
  const selected=players.filter(Boolean);
  return '<div class="scs-gt-knockout-team-card"><span class="scs-gt-team-card-number">'+(index+1)+'</span><button type="button" class="scs-gt-team-card-players" data-slot="draft:'+index+'" aria-label="Edit team '+(index+1)+'">'+(selected.length?selected.map(playerRow).join(''):'<span class="scs-gt-unassigned">Select two players</span>')+'</button><button type="button" class="scs-gt-team-card-edit" data-slot="draft:'+index+'" aria-label="Edit team '+(index+1)+'">✎</button><button type="button" class="scs-gt-team-card-remove" data-remove-team="'+index+'" aria-label="Remove team '+(index+1)+'">−</button></div>';
 }).join('')+'</div>':'<p>Create teams, then select two players for each team.</p>')+'</section>';
}
let poolExpanded=false;
function openPlayersManager(){
 window.__scsGroupPlayersReturn=true;
 el().hidden=true;
 if(typeof scsPushChildReturnState==='function')scsPushChildReturnState('playersPage');
 if(typeof homeHideScreen==='function')homeHideScreen();
 if(typeof showPage==='function')showPage('playersPage',null);
 else{const page=document.getElementById('playersPage');if(page)page.style.display='block'}
 if(typeof _updateDynamicBackBtns==='function')_updateDynamicBackBtns('playersPage');
}
function playersManagerReturned(){
 if(!window.__scsGroupPlayersReturn)return false;
 window.__scsGroupPlayersReturn=false;
 const names=registry();
 pool=names.filter(n=>{let p=null;try{p=(schedulerState.allPlayers||[]).find(x=>x.name===n)}catch(e){}return !p||p.active!==false});
 save();if(el()){el().hidden=false;render()}return true;
}
function editor(id){
 const draftMatch=/^draft:(\d+)$/.exec(id);
 if(draftMatch){
  const draftIndex=Number(draftMatch[1]);if(!Number.isInteger(draftIndex)||draftIndex<0||draftIndex>=teamDrafts.length)return;
  const old=teamDrafts[draftIndex]||[];
  const used=new Set(teamDrafts.filter((_,i)=>i!==draftIndex).flat().map(n=>String(n).toLowerCase()));
  const names=(pool.length?pool:registry()).filter(n=>!used.has(n.toLowerCase()));
  const modal=document.createElement('section');modal.className='scs-tm-entry-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.innerHTML='<div class="scs-tm-entry-editor"><button type="button" class="scs-tm-entry-close" data-cancel aria-label="Close player assignment">×</button><h3>Entry '+(draftIndex+1)+' · Assign Players</h3><p>Choose players from the tournament pool, or enter a name manually.</p>'+[1,2].map(num=>{let val=old[num-1]||'';return '<label>Player '+num+'<select class="scs-tm-player-select" data-player="'+num+'"><option value="">Select player</option>'+names.map(n=>'<option value="'+escapeHTML(n)+'"'+(n===val?' selected':'')+'>'+escapeHTML(n)+'</option>').join('')+'</select><input data-input="'+num+'" autocomplete="off" placeholder="Or type player name" value="'+escapeHTML(val)+'"></label>'}).join('')+'<div class="scs-tm-entry-player-preview">'+old.map(playerRow).join('')+'</div><div class="scs-tm-import-actions"><button type="button" data-add-next-team>+ Add Team</button><button type="button" class="scs-tm-primary" data-done>Done</button></div><p class="scs-tm-entry-status" role="status"></p></div>';
  el().appendChild(modal);modal.querySelector('[data-cancel]').onclick=()=>modal.remove();modal.querySelectorAll('[data-player]').forEach(select=>select.onchange=()=>{if(select.value)modal.querySelector('[data-input="'+select.dataset.player+'"]').value=select.value});
  const saveDraft=()=>{const picked=[1,2].map(n=>modal.querySelector('[data-input="'+n+'"]').value.trim()),error=modal.querySelector('.scs-tm-entry-status');if(picked.some(n=>!n)){error.textContent='Enter both player names to save this team.';return false}if(picked[0].toLowerCase()===picked[1].toLowerCase()){error.textContent='Choose two different players.';return false}if(picked.some(n=>used.has(n.toLowerCase()))){error.textContent='Player already assigned to another tournament team. Choose an available player.';return false}teamDrafts[draftIndex]=picked;save();return true};
  modal.querySelector('[data-add-next-team]').onclick=()=>{if(!saveDraft())return;if(teamDrafts.length>=64){modal.querySelector('.scs-tm-entry-status').textContent='Maximum 64 teams.';return}teamDrafts.push(['','']);save();modal.remove();render();editor('draft:'+(teamDrafts.length-1))};
  modal.querySelector('[data-done]').onclick=()=>{if(!saveDraft())return;modal.remove();render()};
  hydratePlayerCards();modal.onclick=e=>{if(e.target===modal)modal.remove()};return;
 }
 const [gi,ti]=id.split(':').map(Number);
 if(!Number.isInteger(gi)||!Number.isInteger(ti)||gi<0||ti<0||gi>=config.groups||ti>=config.per)return;
 const old=assignments[id]||[];
 const used=new Set(Object.entries(assignments).filter(([k])=>k!==id).flatMap(([,v])=>v).map(n=>n.toLowerCase()));
 const names=(pool.length?pool:registry()).filter(n=>!used.has(n.toLowerCase()));
 const modal=document.createElement('section');modal.className='scs-tm-entry-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 const opts=names.map(n=>'<option value="'+escapeHTML(n)+'">'+escapeHTML(n)+'</option>').join('');
 modal.innerHTML='<div class="scs-tm-entry-editor"><button type="button" class="scs-tm-entry-close" data-cancel aria-label="Close player assignment">×</button><h3>Group '+groupLabel(gi)+' · Team '+(ti+1)+' · Assign Players</h3><p>Choose players from the tournament pool, or enter a name manually.</p>'+[1,2].map(num=>{let val=old[num-1]||'';return '<label>Player '+num+'<select class="scs-tm-player-select" data-player="'+num+'"><option value="">Select player</option>'+names.map(n=>'<option value="'+escapeHTML(n)+'"'+(n===val?' selected':'')+'>'+escapeHTML(n)+'</option>').join('')+'</select><input data-input="'+num+'" autocomplete="off" placeholder="Or type player name" value="'+escapeHTML(val)+'"></label>'}).join('')+'<div class="scs-tm-entry-player-preview">'+old.map(playerRow).join('')+'</div><div class="scs-tm-import-actions"><button type="button" class="scs-tm-primary" data-done>Done</button></div><p class="scs-tm-entry-status" role="status"></p></div>';
 el().appendChild(modal);
 modal.querySelector('[data-cancel]').onclick=()=>modal.remove();
 modal.querySelectorAll('[data-player]').forEach(select=>select.onchange=()=>{if(select.value)modal.querySelector('[data-input="'+select.dataset.player+'"]').value=select.value});
 modal.querySelector('[data-done]').onclick=()=>{
  const picked=[1,2].map(n=>modal.querySelector('[data-input="'+n+'"]').value.trim());
  const error=modal.querySelector('.scs-tm-entry-status');
  if(picked.some(n=>!n)||picked[0].toLowerCase()===picked[1].toLowerCase()){error.textContent='Enter two different players.';return}
  if(picked.some(n=>used.has(n.toLowerCase()))){error.textContent='A player is already assigned to another group team.';return}
  if(started){error.textContent='Teams cannot be changed after the tournament starts.';return}assignments[id]=picked;save();modal.remove();render();
 };
 hydratePlayerCards();
 modal.onclick=e=>{if(e.target===modal)modal.remove()};
}
function startTournament(){
 if(started)return;
 for(let g=0;g<config.groups;g++)for(let t=0;t<config.per;t++)if(!Array.isArray(assignments[g+':'+t])||assignments[g+':'+t].length!==2){alert('Assign all teams before starting the tournament.');tab='groups';render();return}
 if(!confirm('Start Group Tournament and create all round-robin matches?'))return;
 matches=[];assignmentSerial=0;let n=1;
 for(let g=0;g<config.groups;g++)for(let i=0;i<config.per;i++)for(let j=i+1;j<config.per;j++)matches.push({id:'G'+(g+1)+'-M'+(n++),group:g,a:g+':'+i,b:g+':'+j,court:null,status:'pending'});
 started=true;assistMode=false;assistStep=0;tab='main';save();render();
}
function teamBusy(team){return matches.some(m=>['assigned','playing','score_ready'].includes(m.status)&&(m.a===team||m.b===team))}
function lastUse(team){return matches.reduce((n,m)=>Math.max(n,(m.a===team||m.b===team)?Number(m.completedOrder||m.assignedOrder)||0:0),0)}
function rankMatches(){
 const pending=matches.filter(m=>!m.court&&m.status==='pending');
 const available=pending.filter(m=>!teamBusy(m.a)&&!teamBusy(m.b));
 const ranked=available.map(m=>{
  const recent=Math.max(lastUse(m.a),lastUse(m.b));
  const combined=lastUse(m.a)+lastUse(m.b);
  return {m,recent,combined};
 }).sort((x,y)=>x.recent-y.recent||x.combined-y.combined||x.m.group-y.m.group||x.m.id.localeCompare(y.m.id));
 return {available,ranked};
}
function groupCompletedScore(m){
 const sc=m.score;
 if(!sc)return '';
 if(typeof sc==='string')return sc;
 const sets=Array.isArray(sc.completedSets)?sc.completedSets:(Array.isArray(sc.sets)?sc.sets:[]);
 if(sets.length)return sets.map(set=>{
  if(Array.isArray(set.score))return set.score.join('–');
  const a=set.a??set.left,b=set.b??set.right;
  return a!=null&&b!=null?a+'–'+b:'';
 }).filter(Boolean).join('  |  ');
 return Array.isArray(sc.currentScore)?sc.currentScore.join('–'):'';
}
function matchCenter(){
 if(!started)return card('Match Center','Start the tournament after assigning all teams.');
 const priority=new Map(rankMatches().ranked.map((x,i)=>[x.m.id,i]));
 const courts=Array.from({length:courtCount},(_,i)=>{
  const n=i+1,m=matches.find(x=>x.court===n&&x.status!=='approved');
  if(!m)return {number:n};
  const ready=m.status==='score_ready',playing=m.status==='playing';
  const sets=m.score&&m.score.completedSets;
  return {number:n,playerRenderer:playerRow,match:{status:ready?'AWAITING APPROVAL':playing?'IN PROGRESS':'ASSIGNED (Not Started)',label:m.id+' · Group '+groupLabel(m.group),groupIndex:m.group,left:assignments[m.a]||[],right:assignments[m.b]||[],ready,started:playing||ready,score:Array.isArray(sets)?sets.map(set=>(set.score||[]).join('–')).join(' | '):'',winner:m.winner==='L'?'left':m.winner==='R'?'right':null,action:ready?'data-approve="'+escapeHTML(m.id)+'"':playing?'data-score="'+escapeHTML(m.id)+'"':'data-start-match="'+escapeHTML(m.id)+'"',actionLabel:ready?'Approve Result':playing?'View Score':'Start Match'}};
 });
 const pending=matches.filter(m=>m.status==='pending'||m.status==='assigned'||m.status==='playing'||m.status==='score_ready');
 const done=matches.filter(m=>m.status==='approved');
 return SCSSharedMatchCenter.panel({courtCount,courts,tab:matchTab,assigning:assigningMatch,ranking:standings(),
  waiting:pending.sort((a,b)=>(priority.get(a.id)??99999)-(priority.get(b.id)??99999)).map(m=>({number:m.id,groupIndex:m.group,heading:'Group '+groupLabel(m.group),left:(assignments[m.a]||[]).join(' / '),right:(assignments[m.b]||[]).join(' / '),label:m.court?'Assigned · Court '+m.court:priority.has(m.id)?'Assign':'Waiting',assigned:!!m.court,action:m.status==='pending'&&priority.has(m.id)?'data-assign="'+escapeHTML(m.id)+'"':''})),
  completed:done.map(m=>({number:m.id,left:(assignments[m.a]||[]).join(' / '),right:(assignments[m.b]||[]).join(' / '),leftPlayers:assignments[m.a]||[],rightPlayers:assignments[m.b]||[],score:groupCompletedScore(m),winner:m.winner==='L'?'left':m.winner==='R'?'right':null})),
  attrs:{change:n=>'data-courts="'+n+'"',choose:n=>'data-choose-court="'+n+'"',cancel:'data-cancel-court',tab:id=>'data-match-tab="'+id+'"'}
 });
}
function standings(){
 return Array.from({length:config.groups},(_,g)=>'<section class="scs-gt-standings-summary"><h4>Group '+groupLabel(g)+'</h4>'+groupResults(g).map((t,i)=>'<p>'+(i+1)+'. '+(assignments[t.id]||[]).map(escapeHTML).join(' / ')+' · W '+t.w+' · GD '+(t.gw-t.gl)+' · PD '+(t.pf-t.pa)+'</p>').join('')+'</section>').join('');
}
function startMatch(id){const m=matches.find(x=>x.id===id);if(!m||m.status!=='assigned')return;m.status='playing';m.startedAt=Date.now();save();render()}
function scoreMatch(id){const m=matches.find(x=>x.id===id);if(!m||m.status!=='playing')return;if(!window.SCSScoring||!SCSScoring.openGroupMatch){alert('Scoreboard is unavailable.');return}el().hidden=true;SCSScoring.openGroupMatch({sessionId:'local-group-'+id,round:1,court:m.court,pair1:assignments[m.a],pair2:assignments[m.b],courtCenter:true,groupId:id})}
function scoreUpdate(id,score,winner){const m=matches.find(x=>x.id===id);if(!m||!['playing','score_ready'].includes(m.status))return false;m.score=score;if(winner){m.winner=winner;m.status='score_ready'}save();render();return true}
function approveMatch(id){const m=matches.find(x=>x.id===id);if(!m||m.status!=='score_ready'||!['L','R'].includes(m.winner)||!m.score||!m.score.finished)return; m.status='approved';m.completedOrder=++assignmentSerial;m.completedCourt=m.court;m.court=null;save();render()}
function assignCourt(id){let m=matches.find(x=>x.id===id);if(!m||m.court)return;if(teamBusy(m.a)||teamBusy(m.b)){alert('A team is already assigned to another court.');return}let free=Array.from({length:courtCount},(_,i)=>i+1).filter(n=>!matches.some(x=>x.court===n));assigningMatch=id;render()}
// Group Assist uses existing player, setup, group assignment and match cards.
// The local group record is a draft until Step 4 confirms it.
function assistComplete(step){
 if(step===1)return teamDrafts.length>=2&&teamDrafts.every(team=>Array.isArray(team)&&team.length===2&&team[0]&&team[1]);
 if(step===2)return assistPatternReady&&Number.isInteger(config.groups)&&config.groups>=1&&Number.isInteger(config.per)&&config.per>=2&&config.top+(config.knockouts===2?config.bottom:0)<=config.per;
 if(step===3){for(let g=0;g<config.groups;g++)for(let t=0;t<config.per;t++)if(!Array.isArray(assignments[g+':'+t])||assignments[g+':'+t].length!==2)return false;return true}
 if(step===4)return created;
 return false;
}
function assistIndex(){
 const names=['Players and Teams','Setup Groups','Assign Teams to Groups','Confirm and Save','Start'];
 const colors=['#0f766e','#47258b','#9a4e1a','#2145a0','#125b39'];
 return '<div class="scs-gt-assist"><header><h2>Group Tournament Assist</h2><button data-action="close">Close</button></header><p>Complete each step to unlock the next.</p>'+names.map((name,i)=>{const available=i===0||assistComplete(i);const done=assistComplete(i+1);return '<button type="button" class="scs-gt-assist-step" style="background:'+colors[i]+';opacity:'+(available?1:.45)+'" data-assist-step="'+(i+1)+'" '+(available?'':'disabled')+'><b>'+(i+1)+'</b><span><strong>'+name+'</strong><small>'+(done?'Completed':available?'Open step':'Locked until previous step is complete')+'</small></span><span>'+(available?'›':'🔒')+'</span></button>'}).join('')+'</div>';
}
function assistView(){
 const top='<div class="scs-gt-assist-top"><button type="button" data-assist-home>‹ Assist Home</button><small>GROUP TOURNAMENT · STEP '+assistStep+' OF 5</small></div>';
 if(assistStep===1)return top+players()+teamsCard()+'<button class="scs-gt-primary" data-assist-done="1">Done</button>';
 if(assistStep===2)return top+setup().replace('data-action="create"','data-assist-done="2"').replace('Create Groups</button>','Confirm Groups</button>');
 if(assistStep===3)return top+card('Assign Teams to Groups','<p>Tap each empty team position to select two players. All positions must be assigned before continuing.</p>')+groups()+'<button class="scs-gt-primary" data-assist-done="3">Done</button>';
 if(assistStep===4)return top+card('Confirm and Save','<h3>'+escapeHTML(title)+'</h3><p>'+config.groups+' groups · '+config.per+' teams per group · '+config.knockouts+' knockout tournament'+(config.knockouts===1?'':'s')+'</p><p>'+Object.keys(assignments).length+' / '+(config.groups*config.per)+' teams assigned.</p><button class="scs-gt-primary" data-assist-done="4">Save Tournament</button>');
 return top+card('Start Group Tournament','<p>Group tournament saved. Start when all teams are ready.</p><button class="scs-gt-primary" data-start>Start Tournament</button>');
}
function assistDone(step){
 if(step===1&&!assistComplete(1)){alert('Select players using Players Manager first.');return}
 if(step===2){if(config.per<2||config.groups<1||config.knockouts<1||config.knockouts>2||config.top+(config.knockouts===2?config.bottom:0)>config.per){alert('Check the group and qualifier settings.');return}if(teamDrafts.length!==config.groups*config.per){alert('Team count must equal Groups × Teams per group ('+(config.groups*config.per)+').');return}assistPatternReady=true;assignments={};teamDrafts.forEach((team,index)=>{const g=Math.floor(index/config.per),t=index%config.per;assignments[g+':'+t]=team.slice()});}
 if(step===3&&!assistComplete(3)){alert('Assign two players to every team position first.');return}
 if(step===4){if(!assistComplete(3)){alert('Complete team assignments first.');return}created=true;tab='main'}
 save();assistStep=0;render();
}
function view(){
if(tab==='main')return (started?card('Group Tournament Started','<p>'+matches.length+' round-robin matches generated.</p>'):card('Start Group Tournament','<p>Assign all teams before starting.</p><button class="scs-gt-primary" data-start>Start Group Tournament</button>'))+card('Tournament Overview','<p>'+config.groups+' groups · '+config.per+' teams per group · '+config.knockouts+' knockout tournament'+(config.knockouts===1?'':'s')+'</p><p>Teams assigned: '+Object.keys(assignments).length+' / '+config.groups*config.per+'</p>')+groups()+card('Knockout qualification','<p>Top: '+config.top+' per group'+(config.knockouts===2?' · Bottom: '+config.bottom+' per group':'')+'</p><p class="scs-gt-empty">Bracket will appear after qualification is implemented in Stage 2.</p>');
if(tab==='players')return players();
if(tab==='groups')return groups();
if(tab==='knockouts')return card('Knockout 1 — Top','<p>'+config.top+' qualifying positions per group</p><p class="scs-gt-empty">No qualified teams yet.</p>')+(config.knockouts===2?card('Knockout 2 — Bottom','<p>'+config.bottom+' qualifying positions per group</p><p class="scs-gt-empty">No qualified teams yet.</p>'):'');
return matchCenter();
}
function tournamentBottomNav(assisting){
 const active=assisting?(assistStep===1?'teams':assistStep>=2?'tournament':''):(tab==='players'?'teams':tab==='match'?'match':'tournament');
 const tournamentReady=!assisting||assistComplete(1);
 const liveReady=!assisting&&started;
 const items=[['home','Home','⌂',true],['teams','Teams','♙',true],['tournament','Tournament','⑂',tournamentReady],['match','Match Center','▣',liveReady]];
 return '<nav class="scs-tm-organized-tabs scs-tm-bottom-nav scs-gt-bottom-nav" aria-label="Group tournament sections">'+items.map(([key,label,icon,enabled])=>'<button type="button" data-group-nav="'+key+'" class="'+(active===key?'active':'')+'" '+(enabled?'':'disabled')+(active===key?' aria-current="page"':'')+'><span class="scs-tm-nav-icon" aria-hidden="true">'+icon+'</span><span class="scs-tm-nav-label">'+label+'</span></button>').join('')+'</nav>';
}
function render(){
if(!el())return;
const assisting=assistMode&&!started;
let body;
if(assisting)body=assistStep===0?assistIndex():assistView();
else body='<header><strong>'+escapeHTML(title)+'</strong><button data-action="close" aria-label="Close">✕</button></header>'+((tab==='main'||tab==='groups'||tab==='knockouts')?'<nav class="scs-gt-context-tabs" aria-label="Group tournament views"><button type="button" data-tab="groups" class="'+(tab!=='knockouts'?'active':'')+'">Groups</button><button type="button" data-tab="knockouts" class="'+(tab==='knockouts'?'active':'')+'">Knockouts</button></nav>':'')+view()+'<button class="scs-gt-secondary" data-action="new">New Group Tournament</button>';
el().innerHTML='<div class="scs-gt-sheet" role="dialog" aria-modal="true">'+body+'</div>'+tournamentBottomNav(assisting);
const closeButton=el().querySelector('[data-action="close"]');if(closeButton)closeButton.onclick=close;
el().querySelectorAll('[data-assist-step]').forEach(x=>x.onclick=()=>{assistStep=Number(x.dataset.assistStep);render()});
const back=el().querySelector('[data-assist-home]');if(back)back.onclick=()=>{assistStep=0;save();render()};
el().querySelectorAll('[data-assist-done]').forEach(x=>x.onclick=()=>assistDone(Number(x.dataset.assistDone)));
el().querySelectorAll('[data-config]').forEach(x=>x.onchange=()=>{let n=Number(x.value);if(!Number.isInteger(n)||n<1||n>64){alert('Enter a whole number between 1 and 64.');render();return}config[x.dataset.config]=x.dataset.config==='knockouts'?Math.min(2,n):n;assistPatternReady=false;save();render()});
 const titleInput=el().querySelector('[data-title]');if(titleInput)titleInput.onchange=()=>{title=titleInput.value.trim().slice(0,120)||'Group Tournament';save();render()};
 const toggle=el().querySelector('[data-toggle-pool]');if(toggle)toggle.onclick=()=>{poolExpanded=!poolExpanded;render()};const manager=el().querySelector('[data-open-manager]');if(manager)manager.onclick=openPlayersManager;hydratePlayerCards();
 const addTeam=el().querySelector('[data-add-team]');if(addTeam)addTeam.onclick=()=>{if(teamDrafts.length>=64){alert('Maximum 64 teams.');return}teamDrafts.push(['','']);save();render();editor('draft:'+(teamDrafts.length-1))};
 el().querySelectorAll('[data-remove-team]').forEach(x=>x.onclick=e=>{e.stopPropagation();teamDrafts.splice(Number(x.dataset.removeTeam),1);save();render()});
el().querySelectorAll('[data-slot]').forEach(x=>x.onclick=()=>{if(!started)editor(x.dataset.slot)});
let start=el().querySelector('[data-start]');if(start)start.onclick=startTournament;
 el().querySelectorAll('[data-assign]').forEach(x=>x.onclick=()=>assignCourt(x.dataset.assign));
 el().querySelectorAll('[data-start-match]').forEach(x=>x.onclick=()=>startMatch(x.dataset.startMatch));
 el().querySelectorAll('[data-score]').forEach(x=>x.onclick=()=>scoreMatch(x.dataset.score));
 el().querySelectorAll('[data-approve]').forEach(x=>x.onclick=()=>approveMatch(x.dataset.approve));
 
 el().querySelectorAll('[data-courts]').forEach(x=>x.onclick=()=>{courtCount=Math.max(1,Math.min(32,courtCount+Number(x.dataset.courts),...matches.filter(m=>m.court).map(m=>m.court)));save();render()});
 el().querySelectorAll('[data-match-tab]').forEach(x=>x.onclick=()=>{matchTab=x.dataset.matchTab;render()});
 el().querySelectorAll('[data-choose-court]').forEach(x=>x.onclick=()=>{const n=Number(x.dataset.chooseCourt),m=matches.find(y=>y.id===assigningMatch);if(!m||m.court||teamBusy(m.a)||teamBusy(m.b))return;const occupant=matches.find(y=>y.court===n);if(occupant){if(occupant.status!=='assigned'){alert('This court has a started match.');return}if(!confirm('Replace '+occupant.id+' on Court '+n+'?'))return;occupant.court=null;occupant.status='pending';occupant.assignedOrder=0;}m.court=n;m.status='assigned';m.assignedOrder=++assignmentSerial;assigningMatch=null;save();render()});
 const cancelCourt=el().querySelector('[data-cancel-court]');if(cancelCourt)cancelCourt.onclick=()=>{assigningMatch=null;render()};
 el().querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{tab=x.dataset.tab;render()});
 el().querySelectorAll('[data-group-nav]').forEach(x=>x.onclick=()=>{
  const target=x.dataset.groupNav;if(target==='home'){el()?.remove();if(typeof window.scsTournamentReturnManager==='function')window.scsTournamentReturnManager();else if(typeof window.scsOpenTournamentManager==='function')window.scsOpenTournamentManager();return}
  if(assisting){if(target==='teams')assistStep=1;else if(target==='tournament'&&assistComplete(1))assistStep=Math.max(2,Math.min(5,assistStep||2));else return;save();render();return}
  tab=target==='teams'?'players':target==='tournament'?(tab==='knockouts'?'knockouts':'groups'):target;save();render();
 });
let create=el().querySelector('[data-action="create"]');if(create)create.onclick=()=>{if(config.top+(config.knockouts===2?config.bottom:0)>config.per){alert('Qualifiers cannot exceed teams per group.');return}created=true;tab='main';save();render()};
 let fresh=el().querySelector('[data-action="new"]');if(fresh)fresh.onclick=()=>{if(confirm('Start a new group tournament setup?')){title='Group Tournament';created=false;assistMode=true;assistStep=0;assistPatternReady=false;started=false;matches=[];assignmentSerial=0;teamDrafts=[];assignments={};matchTab='waiting';assigningMatch=null;save();render()}};
}
window.SCSGroupTournament={open,close,playersManagerReturned,scoreUpdate,openSection:function(section){tab=section==='teams'?'players':section==='match'?'match':'groups';save();render()},returnFromScore:function(){if(el())el().hidden=false}};
})();
