(function(){
'use strict';
// Club encounters extend the Group Tournament round-robin pattern and share its Match Center.
const KEY='scs_team_tournament_v1';
let state={title:'',clubs:[],encounters:[],courtCount:1,serial:0},tab='fixtures',matchTab='waiting',assigning=null,viewOnly=false;
const root=()=>document.getElementById('scsTeamTournament');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save=()=>{if(!viewOnly)localStorage.setItem(KEY,JSON.stringify(state))};
function load(){try{state=JSON.parse(localStorage.getItem(KEY))||state}catch(e){}state.clubs||=[];state.encounters||=[];state.courtCount||=1;state.serial||=0}
function open(mode){viewOnly=mode==='view';load();if(mode==='new'&&state.encounters.length){if(!confirm('Create a new Team Tournament? The current tournament will be replaced.'))return;state={title:'',clubs:[],encounters:[],courtCount:1,serial:0};save()}if(!root()){let d=document.createElement('div');d.id='scsTeamTournament';d.className='scs-gt-overlay scs-team-overlay';document.body.appendChild(d)}tab=state.encounters.length?'fixtures':'setup';render()}
function close(){root()?.remove();if(typeof window.scsReturnToTournamentParent==='function')window.scsReturnToTournamentParent()}
const allMatches=()=>state.encounters.flatMap(e=>e.matches);
const encounterFor=m=>state.encounters.find(e=>e.matches.includes(m));
const clubName=id=>state.clubs[id]?.name||'Club '+(id+1);
const matchName=m=>{let e=encounterFor(m);return clubName(e.a)+' vs '+clubName(e.b)+' · Doubles '+(m.index+1)};
function standings(){let rows=state.clubs.map((c,i)=>({i,name:c.name,w:0,l:0,points:0,mw:0,ml:0,played:0}));for(let e of state.encounters){let done=e.matches.filter(m=>m.status==='approved');for(let m of done){let a=rows[e.a],b=rows[e.b];if(m.winner==='L'){a.mw++;b.ml++;a.points+=2}else if(m.winner==='R'){b.mw++;a.ml++;b.points+=2}}if(done.length===3){let aw=done.filter(m=>m.winner==='L').length,bw=3-aw;rows[e.a].played++;rows[e.b].played++;if(aw>bw){rows[e.a].w++;rows[e.b].l++}else{rows[e.b].w++;rows[e.a].l++}}}rows.sort((a,b)=>b.w-a.w||b.points-a.points||(b.mw-b.ml)-(a.mw-a.ml)||a.i-b.i);return '<section class="scs-gt-card"><h3>Club standings</h3><div style="overflow-x:auto"><table style="width:100%;text-align:left"><thead><tr><th>#</th><th>Club</th><th>Played</th><th>Wins</th><th>Lost</th><th>Points</th></tr></thead><tbody>'+rows.map((r,i)=>'<tr><td>'+(i+1)+'</td><td>'+esc(r.name)+'</td><td>'+r.played+'</td><td><b>'+r.w+'</b></td><td>'+r.l+'</td><td>'+r.points+'</td></tr>').join('')+'</tbody></table></div></section>'}
let expandedClubs=new Set();
// Each club owns a separate roster of references to the existing Players Manager records.
const playerKey=name=>String(name||'').trim().toLocaleLowerCase();
function clubColor(c,i){return Number.isInteger(c.colorIndex)?c.colorIndex%8:i%8;}
function reservedByOtherClub(name,clubIndex){return state.clubs.some((c,i)=>i!==clubIndex&&c.players.some(p=>playerKey(p)===playerKey(name)));}
function setup(){return '<section class="scs-gt-card scs-team-setup"><div class="scs-team-intro"><span class="scs-team-step">01</span><div><h2>Create Team Tournament</h2></div></div><label class="scs-team-field">Tournament name<input id="team-title" value="'+esc(state.title)+'" placeholder="Club championship"></label><div class="scs-team-section-title"><h3>Clubs <span class="scs-team-count">'+state.clubs.length+'</span></h3></div><div class="scs-team-club-list">'+(state.clubs.length?state.clubs.map((c,i)=>'<div class="scs-team-club scs-team-club-color-'+clubColor(c,i)+'"><div class="scs-team-club-head"><button type="button" class="scs-team-expand" data-expand="'+i+'" aria-expanded="'+expandedClubs.has(i)+'" aria-label="Toggle '+esc(c.name)+' players">'+(expandedClubs.has(i)?'⌃':'⌄')+'</button><div class="scs-team-club-name"><strong>'+esc(c.name)+'</strong><small>'+c.players.length+' players</small></div><button data-edit="'+i+'">Edit</button><button data-remove="'+i+'" aria-label="Remove club">×</button></div>'+(expandedClubs.has(i)?'<div class="scs-team-roster">'+c.players.map((name,j)=>'<div class="scs-team-roster-player"><span class="scs-team-player-number">'+(j+1)+'</span>'+playerRow(name)+'</div>').join('')+'</div>':'')+'</div>').join(''):'<div class="scs-team-empty"><strong>No clubs added yet</strong><small>Add a club and select players using Players Manager.</small></div>')+'</div><button class="scs-gt-secondary scs-team-add" data-add>＋ Add club and players</button><div class="scs-team-footer"><button class="scs-gt-primary scs-team-generate" data-generate>Generate club fixtures →</button></div></section>'}

function registry(){
 // Read the same master player sources used by SCS Players Manager.
 // Never write to these stores or mutate their objects.
 const names=[];
 const add=items=>(Array.isArray(items)?items:[]).forEach(p=>{
  const n=typeof p==='string'?p:p&&(p.name||p.displayName);
  if(n&&String(n).trim())names.push(String(n).trim());
 });
 try{if(typeof schedulerState!=='undefined'&&schedulerState)add(schedulerState.allPlayers)}catch(e){}
 for(const key of ['newImportHistory','newImportFavorites','schedulerPlayers']){
  try{add(JSON.parse(localStorage.getItem(key)||'[]'))}catch(e){}
 }
 try{if(window.SCSCourtCenter&&typeof window.SCSCourtCenter.playerNames==='function')add(window.SCSCourtCenter.playerNames())}catch(e){}
 return [...new Map(names.map(n=>[playerKey(n),n])).values()].sort((a,b)=>a.localeCompare(b));
}
function playerRow(name){return '<span class="scs-tm-shared-player"><span class="scs-tm-ring-slot" data-tm-player="'+esc(name)+'"></span><span class="scs-tm-shared-name">'+esc(name)+'</span></span>'}
function hydratePlayerCards(){
 if(typeof createRatingRing!=='function')return;
 root()?.querySelectorAll('.scs-tm-ring-slot[data-tm-player]').forEach(slot=>{
  if(slot.firstChild)return;const name=slot.dataset.tmPlayer;const list=[];
  try{if(typeof schedulerState!=='undefined'&&schedulerState&&Array.isArray(schedulerState.allPlayers))list.push(...schedulerState.allPlayers)}catch(e){}
  for(const key of ['schedulerPlayers','newImportHistory','newImportFavorites']){try{let a=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(a))list.push(...a.map(p=>({...p,name:p.name||p.displayName})))}catch(e){}}
  const player=list.find(p=>p&&typeof p==='object'&&String(p.name||'').toLowerCase()===name.toLowerCase());
  const rating=Number(player&&(player.activeRating||player.clubRating||player.rating));
  try{slot.appendChild(createRatingRing(name,player&&(player.gender||player.sex)||'Male',Number.isFinite(rating)&&rating>=1?rating:null))}catch(e){}
 });
}
let editingClub=null,clubDraft=null;
function openPlayersManager(){
 window.__scsTeamPlayersReturn=true;
 if(root())root().hidden=true;
 if(typeof scsPushChildReturnState==='function')scsPushChildReturnState('playersPage');
 if(typeof homeHideScreen==='function')homeHideScreen();
 if(typeof showPage==='function')showPage('playersPage',null);
 else{const page=document.getElementById('playersPage');if(page)page.style.display='block'}
 if(typeof _updateDynamicBackBtns==='function')_updateDynamicBackBtns('playersPage');
}
function playersManagerReturned(){
 if(!window.__scsTeamPlayersReturn)return false;
 window.__scsTeamPlayersReturn=false;
 if(root()){root().hidden=false;render();if(editingClub!==null)clubEditor(editingClub)}
 return true;
}
function clubEditor(i){
 if(state.encounters.length){alert('Club rosters are locked after fixtures have been generated.');return}
 const c=clubDraft&&editingClub===i?clubDraft:(state.clubs[i]||{name:'',players:[]});
 editingClub=i;
 const selected=new Set((c.players||[]).filter(n=>!reservedByOtherClub(n,i)));
 const getNames=()=>[...new Map([...registry(),...selected].filter(n=>!reservedByOtherClub(n,i)||selected.has(n)).map(n=>[playerKey(n),n])).values()];
 const modal=document.createElement('section');modal.className='scs-tm-entry-modal';
 // Display the current club roster first. The shared registry is only a source for adding players.
 // Keep this dialog club-scoped; never modify the global player selection state.
 let showAvailable=false;
 const playerChoices=()=>{
  const names=getNames();
  const members=names.filter(n=>selected.has(n));
  const available=names.filter(n=>!selected.has(n));
  const row=n=>'<label class="scs-gt-player"><input type="checkbox" data-player-choice="'+esc(n)+'" '+(selected.has(n)?'checked':'')+'><span>'+playerRow(n)+'</span></label>';
  return members.map(row).join('')+(showAvailable?'<div class="scs-team-available-title">Available players · '+available.length+'</div>'+(available.length?available.map(row).join(''):'<p class="scs-team-no-available">All registered players are already assigned to clubs.</p>'):'');
 };
 modal.innerHTML='<div class="scs-tm-entry-editor scs-team-club-editor"><div class="scs-team-editor-head"><h3>Club players</h3><p>Register a club and choose its players</p></div><label>Club name<input data-club-name value="'+esc(c.name)+'"></label><div class="scs-tm-pool-heading"><h3>Select players ('+selected.size+')</h3><button type="button" class="scs-team-manager" data-open-manager>＋ Add players</button></div><p>This club has its own roster. Add players from the existing player list.</p><div class="scs-tm-pool" data-player-list>'+playerChoices()+'</div><div class="scs-tm-import-actions"><button type="button" data-cancel>Cancel</button><button type="button" class="scs-tm-primary" data-save>Done</button></div><p data-error role="status"></p></div>';
 root().appendChild(modal);
 const redraw=()=>{modal.querySelector('[data-player-list]').innerHTML=playerChoices();modal.querySelector('.scs-tm-pool-heading h3').textContent='Select players ('+selected.size+')';bindChoices();hydratePlayerCards()};
 const bindChoices=()=>modal.querySelectorAll('[data-player-choice]').forEach(btn=>btn.onchange=()=>{const n=btn.dataset.playerChoice;if(btn.checked)selected.add(n);else selected.delete(n);redraw()});
 bindChoices();hydratePlayerCards();
 modal.querySelector('[data-cancel]').onclick=()=>{editingClub=null;clubDraft=null;modal.remove()};
 modal.querySelector('[data-open-manager]').onclick=()=>{
  const available=getNames().filter(n=>!selected.has(n));
  // Never navigate to the global Players Manager: it shows the global selection.
  // The club-specific picker always stays within this modal.
  if(!showAvailable&&!available.length){
   modal.querySelector('[data-error]').textContent='No unassigned players in the SCS player database. Add new players in the main Players Manager, then reopen this club.';
   return;
  }
  modal.querySelector('[data-error]').textContent='';
  showAvailable=!showAvailable;
  modal.querySelector('[data-open-manager]').textContent=showAvailable?'Hide available players':'＋ Add players';
  redraw();
 };
 modal.querySelector('[data-save]').onclick=()=>{
  const name=modal.querySelector('[data-club-name]').value.trim(),players=[...selected];
  if(!name||players.length<6||players.some(p=>reservedByOtherClub(p,i))||state.clubs.some((x,j)=>j!==i&&x.name.toLowerCase()===name.toLowerCase())){modal.querySelector('[data-error]').textContent='Enter a unique club name and select at least six players.';return}
  if(i===state.clubs.length)state.clubs.push({name,players,colorIndex:state.serial++%8});else state.clubs[i]={...state.clubs[i],name,players};
  editingClub=null;clubDraft=null;save();modal.remove();render();
 };
}
function generate(){let name=root().querySelector('#team-title')?.value.trim();if(!name||state.clubs.length<2||state.clubs.some(c=>c.players.length<6)){alert('Enter a tournament name and at least two clubs with six players each.');return}state.title=name;state.encounters=[];let n=0;for(let i=0;i<state.clubs.length;i++)for(let j=i+1;j<state.clubs.length;j++){let id='E'+(++n);state.encounters.push({id,a:i,b:j,date:'',time:'',matches:Array.from({length:3},(_,k)=>({id:id+'-D'+(k+1),index:k,pairs:[[],[]],court:null,status:'pending'}))})}save();tab='fixtures';render()}
function editEncounter(id){let e=state.encounters.find(x=>x.id===id);if(!e)return;let modal=document.createElement('section');modal.className='scs-tm-entry-modal';let select=(side,m,slot)=>{let club=state.clubs[side==='L'?e.a:e.b];let chosen=m.pairs[side==='L'?0:1][slot]||'';return '<select aria-label="'+esc(club.name)+' player" data-pair="'+m.index+'-'+side+'-'+slot+'"><option value="" disabled>'+esc(club.name)+'</option><option value="">Select player</option>'+club.players.map(p=>'<option value="'+esc(p)+'" '+(p===chosen?'selected':'')+'>'+esc(p)+'</option>').join('')+'</select>'};modal.innerHTML='<div class="scs-tm-entry-editor scs-team-club-editor"><h3>'+esc(clubName(e.a))+' vs '+esc(clubName(e.b))+'</h3>'+e.matches.map(m=>'<h4>Doubles '+(m.index+1)+(m.status!=='pending'?' · '+esc(m.status):'')+'</h4><b>'+esc(clubName(e.a))+'</b>'+select('L',m,0)+select('L',m,1)+'<b>'+esc(clubName(e.b))+'</b>'+select('R',m,0)+select('R',m,1)).join('')+'<div class="scs-tm-import-actions"><button data-cancel>Cancel</button><button class="scs-tm-primary" data-save>Done</button></div><p data-error role="status"></p></div>';root().appendChild(modal);const refreshChoices=()=>{let selects=[...modal.querySelectorAll('select[data-pair]')];for(let sel of selects){let side=sel.dataset.pair.split('-')[1];let used=new Set(selects.filter(other=>other!==sel&&other.dataset.pair.split('-')[1]===side).map(other=>other.value).filter(Boolean));for(let opt of sel.options){if(opt.value)opt.disabled=used.has(opt.value)}}};modal.querySelectorAll('select[data-pair]').forEach(sel=>sel.addEventListener('change',refreshChoices));refreshChoices();modal.querySelector('[data-cancel]').onclick=()=>modal.remove();modal.querySelector('[data-save]').onclick=()=>{let pairs=e.matches.map(m=>[0,1].map((side)=>[0,1].map(slot=>modal.querySelector('[data-pair="'+m.index+'-'+(side?'R':'L')+'-'+slot+'"]')?.value||'')));let left=pairs.flatMap(p=>p[0]),right=pairs.flatMap(p=>p[1]);if([...left,...right].some(x=>!x)||new Set(left.map(x=>x.toLowerCase())).size!==6||new Set(right.map(x=>x.toLowerCase())).size!==6){modal.querySelector('[data-error]').textContent='Select six different players for each club, with no duplicates.';return}if(e.matches.some((m,i)=>m.status!=='pending'&&JSON.stringify(m.pairs)!==JSON.stringify(pairs[i]))){modal.querySelector('[data-error]').textContent='Players cannot be changed after a match has been assigned or started.';return}e.matches.forEach((m,i)=>m.pairs=pairs[i]);save();modal.remove();render()}}
function fixtures(){return '<section class="scs-gt-card"><h3>Club encounters</h3>'+state.encounters.map(e=>{let done=e.matches.filter(m=>m.status==='approved'),a=done.filter(m=>m.winner==='L').length,b=done.filter(m=>m.winner==='R').length;return '<div class="scs-gt-card" style="margin:10px 0"><strong>'+esc(clubName(e.a))+' vs '+esc(clubName(e.b))+'</strong><p>'+a+' – '+b+' · '+done.length+'/3 completed'+(e.date?' · '+esc(e.date)+' '+esc(e.time):'')+'</p>'+e.matches.map(m=>'<div style="padding:4px 0">Doubles '+(m.index+1)+' · '+esc(m.status)+(m.status==='approved'?' · Winner: '+esc(clubName(m.winner==='L'?e.a:e.b)):'')+'</div>').join('')+(viewOnly?'':'<button class="scs-gt-secondary" data-encounter="'+e.id+'">Select pairs / schedule</button>')+'</div>'}).join('')+'</section>'}
function scoreText(m){let sets=m.score?.completedSets||[];return sets.map(s=>(s.score||[]).join('–')).join(' | ')}
function matchCenter(){let matches=allMatches(),courts=Array.from({length:state.courtCount},(_,i)=>{let n=i+1,m=matches.find(x=>x.court===n&&x.status!=='approved');return m?{number:n,match:{status:m.status.toUpperCase(),label:matchName(m),left:m.pairs[0],right:m.pairs[1],started:m.status!=='assigned',ready:m.status==='score_ready',score:scoreText(m),winner:m.winner==='L'?'left':m.winner==='R'?'right':null,action:viewOnly?'':m.status==='assigned'?'data-start="'+m.id+'"':m.status==='playing'?'data-score="'+m.id+'"':m.status==='score_ready'?'data-approve="'+m.id+'"':'',actionLabel:m.status==='assigned'?'Start Match':m.status==='playing'?'Score Match':'Approve Result'}}:{number:n}});return SCSSharedMatchCenter.panel({courtCount:state.courtCount,courts,tab:matchTab,assigning,ranking:standings(),waiting:matches.filter(m=>m.status!=='approved').map(m=>({number:m.id,heading:matchName(m),left:m.pairs[0].join(' / '),right:m.pairs[1].join(' / '),label:m.court?'Court '+m.court:m.pairs.every(p=>p.length===2)?'Assign':'Select pairs',action:!viewOnly&&m.status==='pending'&&m.pairs.every(p=>p.length===2)?'data-assign="'+m.id+'"':''})),completed:matches.filter(m=>m.status==='approved').map(m=>({number:m.id,title:matchName(m),left:m.pairs[0].join(' / '),right:m.pairs[1].join(' / '),leftPlayers:m.pairs[0],rightPlayers:m.pairs[1],score:scoreText(m),winner:m.winner==='L'?'left':'right'})),attrs:{change:n=>viewOnly?'disabled':'data-courts="'+n+'"',choose:n=>viewOnly?'disabled':'data-choose="'+n+'"',cancel:'data-cancel',tab:t=>'data-matchtab="'+t+'"'}})}
function render(){let r=root();if(!r)return;r.innerHTML='<div class="scs-gt-sheet scs-team-sheet" role="dialog"><header><strong>'+esc(state.title||'Team Tournament')+'</strong><button data-close>✕</button></header>'+(state.encounters.length?'<nav class="scs-gt-context-tabs"><button data-tab="fixtures">Encounters</button><button data-tab="match">Match Center</button><button data-tab="ranking">Ranking</button></nav>':'')+(tab==='setup'?setup():tab==='match'?matchCenter():tab==='ranking'?standings():fixtures())+'</div>';r.querySelector('[data-close]').onclick=close;r.querySelector('#team-title')?.addEventListener('input',e=>{state.title=e.target.value;save()});hydratePlayerCards();r.querySelector('[data-add]')?.addEventListener('click',()=>clubEditor(state.clubs.length));r.querySelectorAll('[data-expand]').forEach(x=>x.onclick=()=>{let i=Number(x.dataset.expand);expandedClubs.has(i)?expandedClubs.delete(i):expandedClubs.add(i);render()});r.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>clubEditor(Number(x.dataset.edit)));r.querySelectorAll('[data-remove]').forEach(x=>x.onclick=()=>{if(state.encounters.length){alert('Club membership cannot be removed after fixtures have been generated.');return}if(!confirm('Remove this club and its roster from the tournament?'))return;state.clubs.splice(Number(x.dataset.remove),1);expandedClubs.clear();save();render()});r.querySelector('[data-generate]')?.addEventListener('click',generate);r.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{tab=x.dataset.tab;render()});r.querySelectorAll('[data-encounter]').forEach(x=>x.onclick=()=>editEncounter(x.dataset.encounter));r.querySelectorAll('[data-matchtab]').forEach(x=>x.onclick=()=>{matchTab=x.dataset.matchtab;render()});r.querySelectorAll('[data-courts]').forEach(x=>x.onclick=()=>{state.courtCount=Math.max(1,Math.min(12,state.courtCount+Number(x.dataset.courts),...allMatches().filter(m=>m.court).map(m=>m.court)));save();render()});r.querySelectorAll('[data-assign]').forEach(x=>x.onclick=()=>{assigning=x.dataset.assign;render()});r.querySelector('[data-cancel]')?.addEventListener('click',()=>{assigning=null;render()});r.querySelectorAll('[data-choose]').forEach(x=>x.onclick=()=>{let m=allMatches().find(y=>y.id===assigning),n=Number(x.dataset.choose);if(!m||m.status!=='pending')return;let occupying=allMatches().find(y=>y.court===n&&y.status!=='approved');if(occupying){alert('Court is occupied. Select a free court.');return}m.court=n;m.status='assigned';assigning=null;save();render()});r.querySelectorAll('[data-start]').forEach(x=>x.onclick=()=>{let m=allMatches().find(y=>y.id===x.dataset.start);m.status='playing';save();render()});r.querySelectorAll('[data-score]').forEach(x=>x.onclick=()=>{let m=allMatches().find(y=>y.id===x.dataset.score);if(!window.SCSScoring)return;root().hidden=true;SCSScoring.openGroupMatch({sessionId:'local-team-'+m.id,round:1,court:m.court,pair1:m.pairs[0],pair2:m.pairs[1],courtCenter:true,groupId:m.id})});r.querySelectorAll('[data-approve]').forEach(x=>x.onclick=()=>{let m=allMatches().find(y=>y.id===x.dataset.approve);if(m.status!=='score_ready'||!m.score?.finished)return;m.status='approved';m.court=null;save();render()});}
function scoreUpdate(id,score,winner){let m=allMatches().find(x=>x.id===id);if(!m||!['playing','score_ready'].includes(m.status))return false;m.score=score;if(winner){m.winner=winner;m.status='score_ready'}save();render();return true}
window.SCSTeamTournament={open,close,scoreUpdate,playersManagerReturned,returnFromScore(){if(root())root().hidden=false},getState(){load();return state}};
})();
