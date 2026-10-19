(function(){
'use strict';
// Club encounters extend the Group Tournament round-robin pattern and share its Match Center.
const KEY='scs_team_tournament_v1';
let state={title:'',clubs:[],encounters:[],courtCount:1,serial:0,matchesPerEncounter:3},tab='fixtures',matchTab='waiting',assigning=null,viewOnly=false,selectedEncounterId=null;
const root=()=>document.getElementById('scsTeamTournament');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const save=()=>{if(!viewOnly){if(state._scsTeamMainId&&state._scsClientTournamentId)localStorage.setItem('scs_team_event_'+state._scsClientTournamentId,JSON.stringify(state));localStorage.setItem(KEY,JSON.stringify(state));if(typeof window.scsQueueTournamentCloudSave==='function')window.scsQueueTournamentCloudSave('team',state);if(state._scsTeamMainId)saveEventIndex()}};
let teamSaveBusy=false;
async function saveTeamTournamentNow(){
 if(viewOnly)return;
 const indicator=root()?.querySelector('[data-team-save-status]');
 if(teamSaveBusy)return;
 if(!String(state.title||'').trim()){if(indicator)indicator.textContent='Enter a tournament name first.';return;}
 teamSaveBusy=true;
 const btn=root()?.querySelector('[data-team-save]');
 if(btn)btn.disabled=true;
 if(indicator)indicator.textContent='Saving…';
 try{
  localStorage.setItem(KEY,JSON.stringify(state));
  if(typeof window.dbSaveTournamentState!=='function')throw Error('Server save is unavailable. Saved on this device only.');
  const id=await window.dbSaveTournamentState('team',state);if(id){state._scsCloudTournamentId=id;if(state._scsTeamMainId)saveEventIndex();}
  if(!id)throw Error('Server save unavailable. Check your club login and connection. Saved on this device only.');
  if(indicator)indicator.textContent='✓ Saved to server';
 }catch(err){if(indicator)indicator.textContent='⚠ '+(err?.message||'Server save failed; local copy retained.');}
 finally{teamSaveBusy=false;if(btn)btn.disabled=false;}
}
function load(){try{state=JSON.parse(localStorage.getItem(KEY))||state}catch(e){}state.clubs||=[];state.encounters||=[];state.courtCount||=1;state.serial||=0;state.matchesPerEncounter=[3,5,7,9].includes(Number(state.matchesPerEncounter))?Number(state.matchesPerEncounter):3}
const MAIN_KEY='scs_team_main_tournament_v1';
let main=null, mainMode=false;
function newId(){return typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'scs-'+Date.now()+'-'+Math.random().toString(36).slice(2)}
function persistMain(){
 if(!main||viewOnly)return;
 localStorage.setItem(MAIN_KEY,JSON.stringify(main));
 if(typeof window.scsQueueTournamentCloudSave==='function')window.scsQueueTournamentCloudSave('team',main);
}
function saveEventIndex(){
 if(!main||!state._scsTeamMainId)return;
 let entry=main.events.find(e=>e.id===state._scsClientTournamentId);
 if(!entry){entry={id:state._scsClientTournamentId};main.events.push(entry)}
 entry.title=state.title||'New Event';
 entry.clubs=state.clubs.map(c=>c.name);
 entry.completed=state.encounters.reduce((n,e)=>n+(e.matches||[]).filter(m=>m.status==='approved').length,0);
 entry.matches=state.encounters.reduce((n,e)=>n+(e.matches||[]).length,0);
 entry.cloudId=state._scsCloudTournamentId||entry.cloudId||'';
 entry.updatedAt=new Date().toISOString();
 persistMain();
}
function openMain(){
 mainMode=true;tab='home';selectedEncounterId=null;
 if(!root()){let d=document.createElement('div');d.id='scsTeamTournament';d.className='scs-gt-overlay scs-team-overlay';document.body.appendChild(d)}
 render();
}
function createMain(){
 const name=prompt('Main Tournament name (e.g. Spring Tournament 2027)');
 if(!name||!name.trim())return;
 main={title:name.trim(),_scsMainTournament:true,_scsClientTournamentId:newId(),events:[],createdAt:new Date().toISOString()};
 persistMain();if(typeof window.dbSaveTournamentState==='function')window.dbSaveTournamentState('team',main).then(id=>{if(id){main._scsCloudTournamentId=id;persistMain()}}).catch(e=>console.warn('Main tournament save:',e));openMain();
}
function addEvent(){
 if(viewOnly)return;
 const name=prompt('Event name (e.g. Men’s Doubles or Team Championship A)');
 if(!name||!name.trim())return;
 state={title:name.trim(),clubs:[],encounters:[],courtCount:1,serial:0,matchesPerEncounter:3,
 _scsClientTournamentId:newId(),_scsTeamMainId:main._scsClientTournamentId};
 localStorage.setItem(KEY,JSON.stringify(state));
 mainMode=false;tab='setup';save();if(typeof window.dbSaveTournamentState==='function')window.dbSaveTournamentState('team',state).then(id=>{if(id){state._scsCloudTournamentId=id;saveEventIndex()}}).catch(e=>console.warn('New event save:',e));render();
}
async function openEvent(id){
 const event=main?.events.find(e=>e.id===id);if(!event)return;
 let saved=null;
 if(event.cloudId&&typeof window.dbLoadTournamentById==='function'){
  try{const row=await window.dbLoadTournamentById(event.cloudId);saved=row?.state||null;if(saved)saved._scsCloudTournamentId=row.id}catch(e){console.warn('Event load',e)}
 }
 if(!saved){try{saved=JSON.parse(localStorage.getItem('scs_team_event_'+id)||'null')}catch(_){}}
 if(!saved){alert('This event is not available on this device yet. Connect to the server and try again.');return}
 state=saved;state._scsTeamMainId=main._scsClientTournamentId;
 localStorage.setItem(KEY,JSON.stringify(state));
 mainMode=false;tab=state.encounters?.length?'fixtures':'setup';render();
}
function open(mode){
 viewOnly=mode==='view';load();
 if(mode==='new'){createMain();return}
 try{const stored=JSON.parse(localStorage.getItem(MAIN_KEY)||'null');if(stored?._scsMainTournament)main=stored}catch(_){}
 if(state._scsMainTournament){main=state;localStorage.setItem(MAIN_KEY,JSON.stringify(main))}else if(state._scsTeamMainId&&main&&state._scsTeamMainId!==main._scsClientTournamentId){main=null}
 if(main){openMain();return}
 // Legacy standalone Team Tournaments remain accessible.
 mainMode=false;
 if(!root()){let d=document.createElement('div');d.id='scsTeamTournament';d.className='scs-gt-overlay scs-team-overlay';document.body.appendChild(d)}
 tab=state.encounters.length?'fixtures':'setup';render();
}
function close(){if(!mainMode&&state._scsTeamMainId&&main){saveEventIndex();mainMode=true;tab='home';render();return}root()?.remove();if(typeof window.scsReturnToTournamentParent==='function')window.scsReturnToTournamentParent()}
const allMatches=()=>state.encounters.flatMap(e=>e.matches);
const encounterFor=m=>state.encounters.find(e=>e.matches.includes(m));
const clubName=id=>state.clubs[id]?.name||'Club '+(id+1);
const matchName=m=>{let e=encounterFor(m);return clubName(e.a)+' vs '+clubName(e.b)+' · Doubles '+(m.index+1)};
function standingsData(){
 const rows=state.clubs.map((c,i)=>({i,name:c.name,w:0,l:0,points:0,mw:0,ml:0,played:0,setsWon:0,setsLost:0,rallyFor:0,rallyAgainst:0,rank:0}));
 for(const e of state.encounters){
  const done=e.matches.filter(m=>m.status==='approved'&&(m.winner==='L'||m.winner==='R'));
  for(const m of done){
   const a=rows[e.a],b=rows[e.b];if(!a||!b)continue;
   if(m.winner==='L'){a.mw++;b.ml++;a.points+=2}else{b.mw++;a.ml++;b.points+=2}
   for(const set of (m.score?.completedSets||[])){
    const scores=set.score||[];const left=Number(scores[0]),right=Number(scores[1]);
    if(!Number.isFinite(left)||!Number.isFinite(right))continue;
    a.rallyFor+=left;a.rallyAgainst+=right;b.rallyFor+=right;b.rallyAgainst+=left;
    if(left>right){a.setsWon++;b.setsLost++}else if(right>left){b.setsWon++;a.setsLost++}
   }
  }
  if(e.matches.length&&done.length===e.matches.length){
   const aw=done.filter(m=>m.winner==='L').length,bw=done.length-aw;
   rows[e.a].played++;rows[e.b].played++;
   if(aw>bw){rows[e.a].w++;rows[e.b].l++}else if(bw>aw){rows[e.b].w++;rows[e.a].l++}
  }
 }
 const key=r=>[r.w,r.setsWon,r.rallyFor];
 const baseCompare=(a,b)=>b.w-a.w||b.setsWon-a.setsWon||b.rallyFor-a.rallyFor;
 rows.sort((a,b)=>baseCompare(a,b)||a.i-b.i);
 // Head-to-head breaks a complete two-club tie only. Three-way cycles remain tied.
 const h2h=(a,b)=>{
  const encounters=state.encounters.filter(e=>(e.a===a.i&&e.b===b.i)||(e.a===b.i&&e.b===a.i));
  if(!encounters.length||encounters.some(e=>!e.matches.length||e.matches.some(m=>m.status!=='approved')))return 0;
  let aw=0,bw=0;
  for(const e of encounters){const left=e.matches.filter(m=>m.winner==='L').length,right=e.matches.filter(m=>m.winner==='R').length;
   const winner=left>right?e.a:right>left?e.b:null;
   if(winner===a.i)aw++;else if(winner===b.i)bw++;
  }
  return aw>bw?-1:bw>aw?1:0;
 };
 for(let i=0;i<rows.length;){let j=i+1;while(j<rows.length&&baseCompare(rows[i],rows[j])===0)j++;
  if(j-i===2&&h2h(rows[i],rows[i+1])>0)[rows[i],rows[i+1]]=[rows[i+1],rows[i]];
  if(j-i===2&&h2h(rows[i],rows[i+1])!==0){rows[i].rank=i+1;rows[i+1].rank=i+2}
  else for(let k=i;k<j;k++)rows[k].rank=i+1;
  i=j;
 }
 return rows;
}
const resultOf=(e,id)=>{const done=e.matches.filter(m=>m.status==='approved'&&(m.winner==='L'||m.winner==='R'));const own=done.filter(m=>(m.winner==='L'?e.a:e.b)===id).length;return {done:done.length,own,other:done.length-own,complete:e.matches.length>0&&done.length===e.matches.length}};
const matchOutcome=(m,id,e)=>m.status!=='approved'?'Pending':(m.winner==='L'?e.a:e.b)===id?'Won':'Lost';
const matchScore=m=>{const sets=m.score?.completedSets||[];return sets.length?sets.map(x=>(x.score||[]).join('–')).join(' | '):'—'};
let expandedStandings=new Set();
function standings(){const rows=standingsData();return '<section class="scs-team-ranking"><h3>Club standings</h3><p class="scs-team-ranking-help">Rank: encounter wins → sets won → rally points → head-to-head · 2 points per approved doubles win</p>'+rows.map((r,pos)=>{const expanded=expandedStandings.has(r.i),encounters=state.encounters.filter(e=>e.a===r.i||e.b===r.i);return '<article class="scs-team-standing" style="--club-accent:'+esc(clubAccent(r.i))+'"><button type="button" class="scs-team-standing-head" data-standing="'+r.i+'" aria-expanded="'+expanded+'"><span class="scs-team-rank">'+(pos+1)+'</span><span class="scs-team-standing-info"><strong>'+esc(r.name)+'</strong><small>Encounters: Played '+r.played+' · Won '+r.w+' · Lost '+r.l+'</small><small>Doubles: Played '+(r.mw+r.ml)+' · Won '+r.mw+' · Lost '+r.ml+'</small></span><span class="scs-team-standing-points"><b>'+r.points+'</b><small>Points</small></span><span aria-hidden="true">'+(expanded?'⌃':'⌄')+'</span></button>'+(expanded?'<div class="scs-team-standing-history">'+(encounters.length?encounters.map(e=>{const opp=e.a===r.i?e.b:e.a,rs=resultOf(e,r.i);return '<div class="scs-team-opponent" style="--opponent-accent:'+esc(clubAccent(opp))+'"><div class="scs-team-opponent-head"><strong>vs '+esc(clubName(opp))+'</strong><span>'+(rs.complete?(rs.own>rs.other?'Won ':'Lost '):'In progress ')+rs.own+'–'+rs.other+'</span></div>'+e.matches.map(m=>'<div class="scs-team-result-line"><span>Doubles '+(m.index+1)+'</span><span>'+esc((m.pairs[e.a===r.i?0:1]||[]).join(' / ')||'Not selected')+'</span><span class="scs-team-result-status">'+matchOutcome(m,r.i,e)+' · '+esc(matchScore(m))+'</span></div>').join('')+'</div>'}).join(''):'<p>No encounters yet</p>')+'</div>':'')+'</article>'}).join('')+'</section>'}
function matrix(){
 const rows=standingsData(),rank=new Map(rows.map(r=>[r.i,r.rank]));
 return '<section class="scs-team-matrix"><h3>Round-robin results matrix</h3><p>Rank: encounter wins → sets won → rally points → head-to-head. Swipe horizontally; tap an encounter for doubles results.</p><div class="scs-team-matrix-scroll"><table class="scs-team-matrix-table"><thead><tr><th class="scs-team-matrix-sticky">Club</th>'+state.clubs.map((c,i)=>'<th style="--matrix-accent:'+esc(clubAccent(i))+'">'+esc(c.name)+'</th>').join('')+'<th>Encounter W–L</th><th>Doubles W–L</th><th>Match points</th><th>Sets W–L</th><th>Rally points F–A</th><th>Point diff.</th><th>Rank</th></tr></thead><tbody>'+state.clubs.map((c,i)=>{
  const row=rows.find(x=>x.i===i);
  return '<tr><th class="scs-team-matrix-sticky" style="--matrix-accent:'+esc(clubAccent(i))+'">'+esc(c.name)+'</th>'+state.clubs.map((other,j)=>{
   if(i===j)return '<td class="scs-team-matrix-self">╲</td>';
   const e=state.encounters.find(x=>(x.a===i&&x.b===j)||(x.a===j&&x.b===i));if(!e)return '<td>—</td>';
   const rs=resultOf(e,i),label=rs.complete?(rs.own>rs.other?'Won ':rs.own<rs.other?'Lost ':'Tied '):rs.done?rs.done+'/'+e.matches.length+' played':'Pending';
   return '<td><button class="scs-team-matrix-cell" data-matrix-encounter="'+esc(e.id)+'" aria-label="'+esc(clubName(i)+' versus '+clubName(j))+'"><small>'+esc(e.id)+'</small><strong>'+label+'</strong><span>'+rs.own+'–'+rs.other+'</span></button></td>';
  }).join('')+'<td>'+row.w+'–'+row.l+'</td><td>'+row.mw+'–'+row.ml+'</td><td>'+row.points+'</td><td>'+row.setsWon+'–'+row.setsLost+'</td><td>'+row.rallyFor+'–'+row.rallyAgainst+'</td><td>'+(row.rallyFor-row.rallyAgainst)+'</td><td>'+rank.get(i)+'</td></tr>';
 }).join('')+'</tbody></table></div></section>';
}
function matrixDetails(id){const e=state.encounters.find(x=>x.id===id);if(!e)return '';const rs=resultOf(e,e.a);return '<h3>'+clubLabel(e.a)+' vs '+clubLabel(e.b)+' · '+rs.own+'–'+rs.other+'</h3>'+e.matches.map(m=>'<div class="scs-team-matrix-detail-row"><strong>Doubles '+(m.index+1)+'</strong><span>'+esc((m.pairs[0]||[]).join(' / ')||'Not selected')+' vs '+esc((m.pairs[1]||[]).join(' / ')||'Not selected')+'</span><span>'+esc(m.status==='approved'?(m.winner==='L'?clubName(e.a):clubName(e.b))+' won · '+matchScore(m):m.status.replace(/_/g,' '))+'</span></div>').join('')}
let expandedClubs=new Set();
// Preserve the independent scroll position of every Team Tournament tab.
const teamScrollPositions=Object.create(null);
function rememberTeamScroll(){const sheet=root()?.querySelector('.scs-team-sheet');if(sheet)teamScrollPositions[tab]=sheet.scrollTop;}
function switchTeamTab(next){if(next===tab)return;rememberTeamScroll();if(next==='clubs'&&tab!=='clubs'&&expandedClubs.size===0)state.clubs.forEach((_,i)=>expandedClubs.add(i));tab=next;const oldSheet=root()?.querySelector('.scs-team-sheet');if(oldSheet)oldSheet.remove();render();}
// Each club owns a separate roster of references to the existing Players Manager records.
const playerKey=name=>String(name||'').trim().toLocaleLowerCase();
const CLUB_PALETTE=['#438ef1','#22bc91','#b28af0','#e6a34f','#ee789d','#41b7d1','#b3c65a','#df8c6e'];
function clubColor(c,i){return Number.isInteger(c.colorIndex)?c.colorIndex:i;}
function clubAccent(id){const c=state.clubs[id]||{},n=clubColor(c,id);return c.color|| (n<CLUB_PALETTE.length?CLUB_PALETTE[n]:`hsl(${Math.round((n*137.508)%360)} 72% 65%)`)}
function clubStyle(id){return 'style="--team-accent:'+esc(clubAccent(id))+'"'}
function clubLabel(id){return '<span class="scs-team-club-label" '+clubStyle(id)+'>'+esc(clubName(id))+'</span>'}
function winnerClub(m){const e=encounterFor(m);return e&&(m.winner==='L'?e.a:m.winner==='R'?e.b:null)}
function winnerNote(m){const id=winnerClub(m);return id===null?'':'<div class="scs-team-winner-note" '+clubStyle(id)+'>🏆 Winner — '+esc(clubName(id))+'<small>'+esc(m.pairs[m.winner==='L'?0:1].join(' / '))+'</small></div>'}
function reservedByOtherClub(name,clubIndex){return state.clubs.some((c,i)=>i!==clubIndex&&c.players.some(p=>playerKey(p)===playerKey(name)));}
function setup(){return '<section class="scs-gt-card scs-team-setup"><div class="scs-team-intro"><span class="scs-team-step">01</span><div><h2>Create Team Tournament</h2></div></div><label class="scs-team-field">Tournament name<input id="team-title" value="'+esc(state.title)+'" placeholder="Club championship"></label><label class="scs-team-field">Doubles matches per club encounter<select id="team-match-count">'+[3,5,7,9].map(n=>'<option value="'+n+'" '+(state.matchesPerEncounter===n?'selected':'')+'>'+n+' doubles matches · '+(Math.floor(n/2)+1)+' wins required</option>').join('')+'</select></label><p class="scs-team-match-count-hint">Each player can play once against the same opposing club. Minimum '+(state.matchesPerEncounter*2)+' players per club.</p><div class="scs-team-section-title"><h3>Clubs <span class="scs-team-count">'+state.clubs.length+'</span></h3></div><div class="scs-team-club-list">'+(state.clubs.length?state.clubs.map((c,i)=>'<div class="scs-team-club scs-team-club-color-'+clubColor(c,i)+'" style="--club-accent:'+esc(clubAccent(i))+'"><div class="scs-team-club-head"><button type="button" class="scs-team-expand" data-expand="'+i+'" aria-expanded="'+expandedClubs.has(i)+'" aria-label="Toggle '+esc(c.name)+' players">'+(expandedClubs.has(i)?'⌃':'⌄')+'</button><div class="scs-team-club-name"><strong>'+esc(c.name)+'</strong><small>'+c.players.length+' players</small></div><button data-edit="'+i+'">Edit</button><button data-remove="'+i+'" aria-label="Remove club">×</button></div>'+(expandedClubs.has(i)?'<div class="scs-team-roster">'+c.players.map((name,j)=>'<div class="scs-team-roster-player"><span class="scs-team-player-number">'+(j+1)+'</span>'+playerRow(name)+'</div>').join('')+'</div>':'')+'</div>').join(''):'<div class="scs-team-empty"><strong>No clubs added yet</strong><small>Add a club and select players using Players Manager.</small></div>')+'</div><button class="scs-gt-secondary scs-team-add" data-add>＋ Add club and players</button></section>'}

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
async function registeredClubChoices(){
 const parent=await scsResolveOrganizerClub();
 return dbGetSubClubs(parent.id);
}
async function registeredClubPlayers(id){
 if(!id||typeof sbGet!=='function')return [];
 const rows=await sbGet('memberships','club_id=eq.'+encodeURIComponent(id)+'&select=nickname,player_id');
 return [...new Map((rows||[]).map(r=>String(r.nickname||'').trim()).filter(Boolean).map(n=>[playerKey(n),n])).values()].sort((a,b)=>a.localeCompare(b));
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
 let showAvailable=false,registeredNames=[],registeredClubId=null;
 let registeredClubs=[];
 const playerChoices=()=>{
  const names=registeredNames;
  const members=names.filter(n=>selected.has(n));
  const available=names.filter(n=>!selected.has(n));
  const row=n=>'<label class="scs-gt-player"><input type="checkbox" data-player-choice="'+esc(n)+'" '+(selected.has(n)?'checked':'')+'><span>'+playerRow(n)+'</span></label>';
  return members.map(row).join('')+(showAvailable?'<div class="scs-team-available-title">Available players · '+available.length+'</div>'+(available.length?available.map(row).join(''):'<p class="scs-team-no-available">All registered players are already assigned to clubs.</p>'):'');
 };
 modal.innerHTML='<div class="scs-tm-entry-editor scs-team-club-editor"><div class="scs-team-editor-head"><h3>Club players</h3><p>Register a club and choose its players</p></div><label>Club name<input data-club-name readonly value="'+esc(c.name)+'"></label><div class="scs-team-registered-club"><label>Sub-club<select data-registered-club><option value="">Select a sub-club</option></select></label><small data-club-loading>Loading registered clubs…</small></div><div class="scs-tm-pool-heading"><h3>Select players ('+selected.size+')</h3><button type="button" class="scs-team-manager" data-open-manager>＋ Add players</button></div><p>This club has its own roster. Add players from the existing player list.</p><div class="scs-tm-pool" data-player-list>'+playerChoices()+'</div><div class="scs-tm-import-actions"><button type="button" data-cancel>Cancel</button><button type="button" class="scs-tm-primary" data-save>Done</button></div><p data-error role="status"></p></div>';
 root().appendChild(modal);
 const redraw=()=>{modal.querySelector('[data-player-list]').innerHTML=playerChoices();modal.querySelector('.scs-tm-pool-heading h3').textContent='Select players ('+selected.size+')';bindChoices();hydratePlayerCards()};
 const bindChoices=()=>modal.querySelectorAll('[data-player-choice]').forEach(btn=>btn.onchange=()=>{const n=btn.dataset.playerChoice;if(btn.checked)selected.add(n);else selected.delete(n);redraw()});
 bindChoices();hydratePlayerCards();
 const clubSelect=modal.querySelector('[data-registered-club]');
 const loading=modal.querySelector('[data-club-loading]');
 clubSelect.onchange=async()=>{
  const id=clubSelect.value;
  if(!id){registeredClubId=null;registeredNames=[];selected.clear();showAvailable=false;redraw();return}
  loading.textContent='Loading club players…';
  try{
   const names=await registeredClubPlayers(id);
   if(clubSelect.value!==id)return;
   registeredClubId=id;registeredNames=names;selected.clear();
   if(c.registeredClubId===id)(c.players||[]).forEach(n=>{if(names.some(x=>playerKey(x)===playerKey(n)))selected.add(n)});
   showAvailable=true;
   const item=registeredClubs.find(x=>x.id===id);
   modal.querySelector('[data-club-name]').value=item?.name||'';
   loading.textContent=names.length+' registered players · select at least '+(state.matchesPerEncounter*2);
   redraw();
  }catch(e){loading.textContent='Could not load players: '+(e.message||e)}
 };
 (async()=>{
  try{
   registeredClubs=await registeredClubChoices();
   registeredClubs.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;clubSelect.appendChild(o)});
   if(c.registeredClubId&&registeredClubs.some(x=>x.id===c.registeredClubId)){clubSelect.value=c.registeredClubId;await clubSelect.onchange()}
   else {selected.clear();redraw();loading.textContent=registeredClubs.length?'Select a sub-club to see its registered players.':'No sub-clubs registered. Create one in Tournament Players Manager.';}
  }catch(e){loading.textContent='Could not load registered clubs: '+(e.message||e)}
 })();
 modal.querySelector('[data-cancel]').onclick=()=>{editingClub=null;clubDraft=null;modal.remove()};
 modal.querySelector('[data-open-manager]').onclick=()=>{
  const available=registeredNames.filter(n=>!selected.has(n));
  // Never navigate to the global Players Manager: it shows the global selection.
  // The club-specific picker always stays within this modal.
  if(!registeredClubId){modal.querySelector('[data-error]').textContent='Select a sub-club first.';return;}
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
  const name=registeredClubs.find(x=>x.id===registeredClubId)?.name||'',players=[...selected];
  if(!registeredClubId||!name||players.length<6||players.some(p=>reservedByOtherClub(p,i))||state.clubs.some((x,j)=>j!==i&&(x.name.toLowerCase()===name.toLowerCase()||(registeredClubId&&x.registeredClubId===registeredClubId)))){modal.querySelector('[data-error]').textContent='Select a sub-club with at least six players and a unique name.';return}
  if(i===state.clubs.length)state.clubs.push({name,players,registeredClubId:registeredClubId||null,colorIndex:state.serial++});else state.clubs[i]={...state.clubs[i],name,players,registeredClubId:registeredClubId||null};
  editingClub=null;clubDraft=null;save();modal.remove();render();
 };
}
function generate(){let name=(root().querySelector('#team-title')?.value??state.title??'').trim();if(!name||state.clubs.length<2||state.clubs.some(c=>c.players.length<state.matchesPerEncounter*2)){alert('Enter a tournament name and at least two clubs with '+(state.matchesPerEncounter*2)+' players each.');return}state.title=name;state.encounters=[];let n=0;for(let i=0;i<state.clubs.length;i++)for(let j=i+1;j<state.clubs.length;j++){let id='E'+(++n);state.encounters.push({id,a:i,b:j,date:'',time:'',matches:Array.from({length:state.matchesPerEncounter},(_,k)=>({id:id+'-D'+(k+1),index:k,pairs:[[],[]],court:null,status:'pending'}))})}selectedEncounterId=null;save();switchTeamTab('fixtures');render()}
function editEncounter(id){
 const e=state.encounters.find(x=>x.id===id);if(!e)return;
 const modal=document.createElement('section');modal.className='scs-tm-entry-modal scs-team-pair-modal';
 const select=(side,m,slot)=>{
  const id=side==='L'?e.a:e.b,club=state.clubs[id],chosen=m.pairs[side==='L'?0:1][slot]||'';
  return '<div class="scs-team-pair-player"><span class="scs-team-pair-player-preview">'+(chosen?playerRow(chosen):'<span class="scs-team-pair-placeholder">Player '+(slot+1)+'</span>')+'</span><select aria-label="'+esc(club.name)+' player '+(slot+1)+'" data-pair="'+m.index+'-'+side+'-'+slot+'"><option value="">Select player</option>'+club.players.map(p=>'<option value="'+esc(p)+'" '+(p===chosen?'selected':'')+'>'+esc(p)+'</option>').join('')+'</select></div>';
 };
 const clubBlock=(id,side,m)=>'<section class="scs-team-pair-club" style="--team-accent:'+esc(clubAccent(id))+'"><h5>'+esc(clubName(id))+'</h5>'+select(side,m,0)+select(side,m,1)+'</section>';
 modal.innerHTML='<div class="scs-tm-entry-editor scs-team-club-editor scs-team-pair-editor"><h3>'+esc(clubName(e.a))+' vs '+esc(clubName(e.b))+'</h3><p class="scs-team-pair-help">Choose two different players from each club for every doubles match.</p><div class="scs-team-pair-scroll">'+e.matches.map(m=>'<article class="scs-team-pair-match"><h4>Doubles '+(m.index+1)+(m.status!=='pending'?' · '+esc(m.status):'')+'</h4>'+clubBlock(e.a,'L',m)+clubBlock(e.b,'R',m)+'</article>').join('')+'</div><div class="scs-tm-import-actions"><button data-cancel>Cancel</button><button class="scs-tm-primary" data-save>Done</button></div><p data-error role="status"></p></div>';
 root().appendChild(modal);
 const selects=[...modal.querySelectorAll('select[data-pair]')];
 const refreshChoices=()=>{
  for(const sel of selects){
   const side=sel.dataset.pair.split('-')[1];
   const used=new Set(selects.filter(other=>other!==sel&&other.dataset.pair.split('-')[1]===side).map(other=>other.value).filter(Boolean));
   for(const opt of sel.options)if(opt.value)opt.disabled=used.has(opt.value);
  }
 };
 const refreshPreview=sel=>{
  const slot=sel.closest('.scs-team-pair-player')?.querySelector('.scs-team-pair-player-preview');
  if(!slot)return;
  slot.innerHTML=sel.value?playerRow(sel.value):'<span class="scs-team-pair-placeholder">Choose a player</span>';
  hydratePlayerCards();
 };
 selects.forEach(sel=>sel.addEventListener('change',()=>{refreshChoices();refreshPreview(sel)}));
 refreshChoices();hydratePlayerCards();
 modal.querySelector('[data-cancel]').onclick=()=>modal.remove();
 modal.querySelector('[data-save]').onclick=()=>{
  const pairs=e.matches.map(m=>[0,1].map(side=>[0,1].map(slot=>modal.querySelector('[data-pair="'+m.index+'-'+(side?'R':'L')+'-'+slot+'"]')?.value||'')));
  const left=pairs.flatMap(p=>p[0]),right=pairs.flatMap(p=>p[1]);
  if([...left,...right].some(x=>!x)||new Set(left.map(x=>x.toLowerCase())).size!==e.matches.length*2||new Set(right.map(x=>x.toLowerCase())).size!==e.matches.length*2){
   modal.querySelector('[data-error]').textContent='Select '+(e.matches.length*2)+' different players for each club, with no duplicates.';return;
  }
  if(e.matches.some((m,i)=>m.status!=='pending'&&JSON.stringify(m.pairs)!==JSON.stringify(pairs[i]))){
   modal.querySelector('[data-error]').textContent='Players cannot be changed after a match has been assigned or started.';return;
  }
  e.matches.forEach((m,i)=>m.pairs=pairs[i]);save();modal.remove();render();
 };
}
function matchCard(m){
 const e=encounterFor(m),done=m.status==='approved',ready=m.pairs.every(p=>p.length===2);
 const pair=i=>m.pairs[i]||[];
 const base={number:m.id,title:clubName(e.a)+' vs '+clubName(e.b)+' · Doubles '+(m.index+1),left:pair(0).join(' / '),right:pair(1).join(' / '),leftPlayers:pair(0),rightPlayers:pair(1),score:scoreText(m),winner:done?(m.winner==='L'?'left':m.winner==='R'?'right':null):null};
 // Preserve the existing SCS scored match card. Only pending header state and club identity differ.
 let card=SCSSharedMatchCenter.completed(base);
 if(!done){
  const status=ready?m.status.replace(/_/g,' '):'Select pairs';
  card=card.replace('<span class="scs-tm-completed-check">✓</span>','<span class="scs-team-pending-icon" aria-hidden="true">○</span>')
   .replace('</b></div><div class="scs-tm-completed-content">','</b><span class="scs-team-header-status">'+esc(status)+'</span></div><div class="scs-tm-completed-content">');
 }
 const assignAction=!viewOnly&&m.status==='pending'&&ready?'<button type="button" class="scs-gt-secondary scs-team-court-assign" data-assign="'+esc(m.id)+'">Assign Court</button>':'';
 return '<div class="scs-team-match-shell" '+(done&&!viewOnly?'role="button" tabindex="0" aria-label="Open saved scoreboard" ':'')+'style="--team-left:'+esc(clubAccent(e.a))+';--team-right:'+esc(clubAccent(e.b))+'" data-match-id="'+esc(m.id)+'">'+card+assignAction+'</div>';
}
function tournamentCourtChooser(){
 if(!assigning||viewOnly)return '';
 const m=allMatches().find(x=>x.id===assigning);
 if(!m||m.status!=='pending')return '';
 const courts=Array.from({length:state.courtCount},(_,i)=>{
  const n=i+1,occupied=allMatches().some(x=>x.court===n&&x.status!=='approved');
  return '<button type="button" class="scs-gt-secondary" data-choose="'+n+'" '+(occupied?'disabled':'')+'>Court '+n+' · '+(occupied?'Occupied':'Free')+'</button>';
 }).join('');
 return '<div class="scs-gt-card scs-team-court-chooser" role="group" aria-label="Assign match to court"><strong>Assign '+esc(matchName(m))+' — Choose court</strong>'+courts+'<button type="button" data-cancel>Cancel</button></div>';
}
function fixtures(){
 if(!state.encounters.length)return '<section class="scs-gt-card scs-team-setup scs-team-fixture-setup"><h2>Generate club fixtures</h2><p>Confirm the tournament name, number of doubles matches, and club rosters in Clubs before generating fixtures.</p><p><strong>'+esc(state.title||'Tournament name not entered')+'</strong> · '+state.clubs.length+' clubs · '+state.matchesPerEncounter+' doubles per encounter</p>'+(viewOnly?'':'<button class="scs-gt-primary scs-team-generate" data-generate>Generate club fixtures →</button>')+'</section>';
 const selected=state.encounters.find(e=>e.id===selectedEncounterId);
 const tabs='<nav class="scs-team-encounter-tabs" aria-label="Club encounters"><button type="button" data-back-encounters class="'+(!selected?'active':'')+'" aria-current="'+(!selected?'page':'false')+'">All</button>'+(selected?'<button type="button" class="active" aria-current="page">'+esc(clubName(selected.a))+' vs '+esc(clubName(selected.b))+'</button>':'')+'<button type="button" data-team-section="ranking" class="'+(tab==='ranking'?'active':'')+'">Ranking</button><button type="button" data-team-section="matrix" class="'+(tab==='matrix'?'active':'')+'">Matrix</button></nav>';
 if(selected){const e=selected,done=e.matches.filter(m=>m.status==='approved'),a=done.filter(m=>m.winner==='L').length,b=done.filter(m=>m.winner==='R').length,winning=done.length===e.matches.length?(a>b?e.a:e.b):null;
  return '<section class="scs-team-fixtures scs-team-encounter-detail">'+tabs+'<h3>'+clubLabel(e.a)+' vs '+clubLabel(e.b)+'</h3><p class="scs-team-encounter-progress">'+a+' – '+b+' · '+done.length+'/'+e.matches.length+' completed</p>'+tournamentCourtChooser()+(viewOnly||done.length===e.matches.length?'':'<button class="scs-gt-secondary scs-team-pair-action" data-encounter="'+esc(e.id)+'">Select / Edit Pairs</button>')+e.matches.map(matchCard).join('')+(winning===null?'':'<div class="scs-team-encounter-winner" '+clubStyle(winning)+'>🏆 Encounter winner: '+esc(clubName(winning))+'</div>')+'</section>';
 }
 return '<section class="scs-team-fixtures scs-team-encounter-list">'+tabs+'<h3>Club encounters</h3>'+state.encounters.map(e=>{const done=e.matches.filter(m=>m.status==='approved'),a=done.filter(m=>m.winner==='L').length,b=done.filter(m=>m.winner==='R').length,finished=done.length===e.matches.length,started=e.matches.some(m=>m.status!=='pending');const status=finished?'completed':started?'live':'not-started';const label=finished?'COMPLETED':started?'LIVE':'NOT STARTED';const symbol=finished?'✓':started?'●':'◷';const action=finished?'View Results':started?'Continue':'Start';return '<button type="button" class="scs-team-encounter-card scs-team-encounter-'+status+'" data-open-encounter="'+esc(e.id)+'" style="--team-left:'+esc(clubAccent(e.a))+';--team-right:'+esc(clubAccent(e.b))+'"><span class="scs-team-encounter-card-status"><span aria-hidden="true">'+symbol+'</span> '+label+'</span><span class="scs-team-encounter-clubs"><strong>'+esc(clubName(e.a))+'</strong><span>VS</span><strong>'+esc(clubName(e.b))+'</strong></span><span class="scs-team-encounter-card-footer"><span>'+a+' – '+b+' · '+done.length+'/'+e.matches.length+' completed'+(finished?' · 🏆 '+esc(clubName(a>b?e.a:e.b))+' won':'')+'</span><strong>'+action+' →</strong></span></button>'}).join('')+'</section>';
}
function showMatrixEncounter(id){
 const r=root(),e=state.encounters.find(x=>x.id===id);if(!r||!e)return;
 r.querySelector('.scs-team-matrix-overlay')?.remove();
 const oldSelected=selectedEncounterId;selectedEncounterId=id;
 const existing=fixtures();selectedEncounterId=oldSelected;
 const overlay=document.createElement('div');overlay.className='scs-team-matrix-overlay';
 overlay.innerHTML='<div class="scs-team-matrix-backdrop" data-matrix-dismiss></div><section class="scs-team-matrix-bottom-sheet" role="dialog" aria-modal="true" aria-label="Encounter details"><div class="scs-team-matrix-sheet-head"><span class="scs-team-matrix-sheet-label" aria-hidden="true"></span><button type="button" data-matrix-dismiss aria-label="Close encounter details">✕</button></div><div class="scs-team-matrix-sheet-content">'+existing+'</div></section>';
 // Mount inside the existing Tournament sheet so its proven match-card styles and actions are inherited.
 r.querySelector('.scs-team-sheet').appendChild(overlay);
 // Apply the SAME post-render card decoration used by the Tournament encounter page.
 // Without this, the shared raw match-card HTML appears as a different design.
 decorateMatchCenter(overlay);
 hydratePlayerCards();
 const close=()=>{overlay.remove();document.removeEventListener('keydown',onKey)};
 const onKey=ev=>{if(ev.key==='Escape')close()};document.addEventListener('keydown',onKey);
 overlay.querySelectorAll('[data-matrix-dismiss]').forEach(b=>b.addEventListener('click',close));
 overlay.querySelectorAll('[data-encounter]').forEach(b=>b.addEventListener('click',()=>{close();editEncounter(b.dataset.encounter)}));
 overlay.querySelectorAll('.scs-team-match-shell[data-match-id]').forEach(el=>{
  const m=allMatches().find(x=>x.id===el.dataset.matchId);
  if(!m||!['approved','score_ready'].includes(m.status)||viewOnly||!m.score?.finished)return;
  const openSaved=()=>{if(!window.SCSScoring?.openTeamCompleted)return;const host=root();if(host)host.hidden=true;try{if(!SCSScoring.openTeamCompleted(m.id,m.score)&&host)host.hidden=false;else close()}catch(err){if(host)host.hidden=false;console.error(err)}};
  el.addEventListener('click',ev=>{if(!ev.target.closest('button,a,select,input'))openSaved()});
  el.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();openSaved()}});
 });
 let startY=0;const sheet=overlay.querySelector('.scs-team-matrix-bottom-sheet');sheet.addEventListener('touchstart',ev=>{startY=ev.touches[0].clientY},{passive:true});sheet.addEventListener('touchend',ev=>{if(ev.changedTouches[0].clientY-startY>110&&sheet.querySelector('.scs-team-matrix-sheet-content').scrollTop===0)close()},{passive:true});
 overlay.querySelector('[data-matrix-dismiss].scs-team-matrix-sheet-head button')?.focus();
}
function scoreText(m){let sets=m.score?.completedSets||[];return sets.map(s=>(s.score||[]).join('–')).join(' | ')}
// Extend the shared Match Center locally; other tournament types keep their existing tabs.
function teamMatchCenterPanel(options){
 const html=SCSSharedMatchCenter.panel(options);
 return html.replace(/<div class="scs-tm-live-tabs">[\s\S]*?<\/div>/,
  '<div class="scs-tm-live-tabs"><button type="button" class="active" data-matchtab="waiting">Waiting <b>'+options.waiting.length+'</b></button></div>');
}
function matchCenter(){
 let matches=selectedEncounterId?(state.encounters.find(e=>e.id===selectedEncounterId)?.matches||[]):allMatches(),courts=Array.from({length:state.courtCount},(_,i)=>{let n=i+1,m=matches.find(x=>x.court===n&&x.status!=='approved');return m?{number:n,match:{status:m.status==='score_ready'?'SCORE READY':m.status.toUpperCase(),label:matchName(m),left:m.pairs[0],right:m.pairs[1],started:m.status!=='assigned',ready:m.status==='score_ready',score:scoreText(m),winner:m.winner==='L'?'left':m.winner==='R'?'right':null,action:viewOnly?'':m.status==='assigned'?'data-start="'+m.id+'"':m.status==='playing'?'data-score="'+m.id+'"':m.status==='score_ready'?'data-approve="'+m.id+'"':'',actionLabel:m.status==='assigned'?'Start Match':m.status==='playing'?'Score Match':'Approve Result'}}:{number:n}});return (selectedEncounterId?'<nav class="scs-team-encounter-tabs" aria-label="Club encounters"><button type="button" data-back-match-encounters>All</button><button type="button" class="active" aria-current="page">'+esc(clubName(state.encounters.find(e=>e.id===selectedEncounterId).a))+' vs '+esc(clubName(state.encounters.find(e=>e.id===selectedEncounterId).b))+'</button></nav>':'')+teamMatchCenterPanel({courtCount:state.courtCount,courts,tab:'waiting',assigning,ranking:'',waiting:matches.filter(m=>m.court&&['assigned','playing','score_ready'].includes(m.status)&&Array.isArray(m.pairs)&&m.pairs.length===2&&m.pairs.every(p=>Array.isArray(p)&&p.length===2&&p.every(name=>typeof name==='string'&&name.trim()))).map(m=>({number:m.id,heading:matchName(m),left:m.pairs[0].join(' / '),right:m.pairs[1].join(' / '),label:'Court '+m.court,action:''})),completed:[],attrs:{change:n=>viewOnly?'disabled':'data-courts="'+n+'"',choose:n=>viewOnly?'disabled':'data-choose="'+n+'"',cancel:'data-cancel',tab:t=>'data-matchtab="'+t+'"'}})}
function decorateTeamCard(card,m){
 const e=encounterFor(m);if(!e)return;
 card.style.setProperty('--team-left',clubAccent(e.a));card.style.setProperty('--team-right',clubAccent(e.b));
 // V235: emphasize the doubles number, with matchup as a secondary subtitle.
 const heading=card.querySelector('.scs-tm-completed-title > b');
 if(heading && !heading.querySelector('.scs-team-doubles-heading')){
  heading.textContent='';
  const main=document.createElement('span');main.className='scs-team-doubles-heading';main.textContent='Doubles '+(m.index+1);
  const sub=document.createElement('small');sub.className='scs-team-match-subtitle';sub.textContent=clubName(e.a)+' vs '+clubName(e.b);
  heading.append(main,sub);
 }
 const teams=card.querySelectorAll('.scs-tm-completed-team');
 teams.forEach((team,i)=>{const id=i===0?e.a:e.b;team.querySelectorAll('.scs-team-card-club').forEach(label=>label.remove());team.classList.toggle('scs-team-losing-players',m.status==='approved'&&['L','R'].includes(m.winner)&&(i===(m.winner==='L'?1:0)));
  // V252: one compact club pill beside each player's name, within the existing row.
  team.querySelectorAll('.scs-tm-completed-players .scs-tm-serving-player').forEach(row=>{
   if(row.querySelector('.scs-team-inline-club-pill'))return;
   const pill=document.createElement('span');pill.className='scs-team-inline-club-pill';pill.textContent=clubName(id)+' Club';
   pill.style.setProperty('--pill-accent',clubAccent(id));
   const player=row.querySelector('.scs-tm-shared-player');if(player)player.after(pill);else row.append(pill);
  })});
 const win=card.querySelector('.scs-tm-completed-winner');
 if(win&&m.winner){const id=winnerClub(m);win.classList.add('scs-team-neutral-winner');const b=win.querySelector('b');if(b)b.innerHTML=clubLabel(id)+' <span class="scs-team-winning-pair">'+esc(m.pairs[m.winner==='L'?0:1].join(' / '))+'</span>'}
}
function decorateMatchCenter(r){
 r.querySelectorAll('.scs-team-match-shell').forEach(shell=>{const m=allMatches().find(x=>String(x.id)===shell.dataset.matchId);if(m)decorateTeamCard(shell,m)});
 if(tab!=='match')return;
 // Keep the proven SCS panel/court controls, but use the exact same SCS card
 // for every Team Tournament match state, including waiting and assigned.
 r.querySelectorAll('.scs-tm-court-card:not(.is-free)').forEach(card=>{
  const label=card.querySelector('small');const m=label&&allMatches().find(x=>label.textContent===matchName(x));if(!m)return;
  const head=card.querySelector('.scs-tm-court-head')?.outerHTML||'';
  const action=card.querySelector('button[data-start],button[data-score],button[data-approve]')?.outerHTML||'';
  card.innerHTML=head+matchCard(m)+action;
 });
 if(tab==='match'){
  const pending=((selectedEncounterId&&state.encounters.find(e=>e.id===selectedEncounterId)?.matches)||allMatches()).filter(m=>m.status!=='approved'&&Array.isArray(m.pairs)&&m.pairs.length===2&&m.pairs.every(p=>Array.isArray(p)&&p.length===2&&p.every(name=>typeof name==='string'&&name.trim())));
  r.querySelectorAll('.scs-tm-live-center > .scs-tm-waiting-match').forEach((card,i)=>{
   const m=pending[i];if(!m)return;
   const action=card.querySelector('button[data-assign]')?.outerHTML||'';
   const status=m.court?'Court '+m.court:m.pairs.every(p=>p.length===2)?'Ready to assign':'Select pairs';
   card.outerHTML='<div class="scs-team-waiting-entry">'+matchCard(m)+(action||'<div class="scs-team-waiting-status">'+esc(status)+'</div>')+'</div>';
  });
 }
 if(false){
  const done=((selectedEncounterId&&state.encounters.find(e=>e.id===selectedEncounterId)?.matches)||allMatches()).filter(m=>m.status==='approved');
  r.querySelectorAll('.scs-tm-live-center > .scs-tm-completed-row').forEach((card,i)=>{if(done[i])card.outerHTML=matchCard(done[i])});
 }
 // Newly inserted cards also need the existing SCS player rings and club labels.
 r.querySelectorAll('.scs-team-match-shell').forEach(shell=>{const m=allMatches().find(x=>String(x.id)===shell.dataset.matchId);if(m)decorateTeamCard(shell,m)});
}

function tournamentReportTabs(active){
 const selected=state.encounters.find(e=>e.id===selectedEncounterId);
 return '<nav class="scs-team-encounter-tabs" aria-label="Tournament sections"><button type="button" data-team-section="fixtures">All</button>'+(selected?'<button type="button" data-team-section="selected">'+esc(clubName(selected.a))+' vs '+esc(clubName(selected.b))+'</button>':'')+'<button type="button" data-team-section="ranking" class="'+(active==='ranking'?'active':'')+'">Ranking</button><button type="button" data-team-section="matrix" class="'+(active==='matrix'?'active':'')+'">Matrix</button></nav>';
}
function mainHome(){
 return '<section class="scs-gt-card scs-team-home"><h2>'+esc(main.title)+'</h2><p>Events</p>'+
 (viewOnly?'':'<button type="button" class="scs-gt-primary" data-add-event>＋ Add Event</button>')+
 (main.events.length?main.events.map(e=>'<button type="button" class="scs-tmgr-tournament-card team" data-open-event="'+esc(e.id)+'"><span><strong>'+esc(e.title)+'</strong><small>'+esc((e.clubs||[]).join(', ')||'Clubs not selected')+'</small><em>'+Number(e.completed||0)+' / '+Number(e.matches||0)+' matches completed</em></span><b>Open ›</b></button>').join(''):'<p>No events yet. Tap + Add Event to create one.</p>')+'</section>';
}
function teamHome(){return '<section class="scs-gt-card scs-team-home"><h2>Team Tournament</h2><p>'+esc(state.title||'Create a team tournament')+'</p><p>'+state.clubs.length+' clubs · '+state.encounters.length+' encounters · '+state.matchesPerEncounter+' doubles per encounter</p><button type="button" class="scs-gt-primary" data-team-go="'+(state.encounters.length?'fixtures':'setup')+'">'+(state.encounters.length?'View encounters':'Set up clubs')+'</button></section>'}
function clubsView(){
 if(!state.encounters.length)return setup();
 // Reuse the pre-fixture club card structure and CSS after fixtures are generated.
 // The previous post-creation markup used a different, unstyled horizontal layout.
 return '<section class="scs-gt-card scs-team-setup scs-team-clubs-view"><h2>Clubs</h2><p>Club rosters are shown here. Pair selection remains manual before each encounter.</p><div class="scs-team-club-list">'+state.clubs.map((c,i)=>'<div class="scs-team-club scs-team-club-color-'+clubColor(c,i)+'" style="--club-accent:'+esc(clubAccent(i))+'"><div class="scs-team-club-head"><button type="button" class="scs-team-expand" data-expand="'+i+'" aria-expanded="'+expandedClubs.has(i)+'" aria-label="Toggle '+esc(c.name)+' players">'+(expandedClubs.has(i)?'⌃':'⌄')+'</button><div class="scs-team-club-name"><strong>'+esc(c.name)+'</strong><small>'+c.players.length+' players</small></div></div>'+(expandedClubs.has(i)?'<div class="scs-team-roster">'+c.players.map((name,j)=>'<div class="scs-team-roster-player"><span class="scs-team-player-number">'+(j+1)+'</span>'+playerRow(name)+'</div>').join('')+'</div>':'')+'</div>').join('')+'</div></section>';
}
function teamBottomNav(){if(mainMode)return '';const active=tab==='home'?'home':tab==='setup'||tab==='clubs'?'clubs':tab==='match'?'match':'tournament';const items=[['home','Home','⌂',true],['clubs','Clubs','♙',true],['tournament','Tournament','⑂',true],['match','Match Center','▣',state.encounters.length>0]];return '<nav class="scs-tm-organized-tabs scs-tm-bottom-nav scs-gt-bottom-nav scs-team-bottom-nav" aria-label="Team tournament sections">'+items.map(([key,label,icon,enabled])=>'<button type="button" data-team-nav="'+key+'" class="'+(active===key?'active':'')+'" '+(enabled?'':'disabled')+(active===key?' aria-current="page"':'')+'><span class="scs-tm-nav-icon" aria-hidden="true">'+icon+'</span><span class="scs-tm-nav-label">'+label+'</span></button>').join('')+'</nav>'}
function render(){let r=root();if(!r)return;
 if(mainMode){
 r.innerHTML='<div class="scs-gt-sheet scs-team-sheet" role="dialog"><header><strong>'+esc(main.title)+'</strong><button type="button" data-close aria-label="Close">✕</button></header>'+mainHome()+'</div>'+teamBottomNav();
 r.querySelector('[data-close]').onclick=close;
 r.querySelector('[data-add-event]')?.addEventListener('click',addEvent);
 r.querySelectorAll('[data-open-event]').forEach(b=>b.onclick=()=>openEvent(b.dataset.openEvent));
 r.querySelectorAll('[data-team-nav]').forEach(b=>b.onclick=()=>{if(b.dataset.teamNav==='home')render()});
 return;
 }
const previousSheet=r.querySelector('.scs-team-sheet');if(previousSheet)teamScrollPositions[tab]=previousSheet.scrollTop;r.innerHTML='<div class="scs-gt-sheet scs-team-sheet" role="dialog"><header><strong>'+esc(state.title||'Team Tournament')+'</strong><div class="scs-team-save-actions"><button type="button" data-team-save '+(viewOnly?'disabled':'')+'>Save Tournament</button><button data-close aria-label="Close">✕</button></div></header><div class="scs-team-save-status" data-team-save-status role="status" aria-live="polite"></div>'+(tab==='home'?teamHome():tab==='setup'||tab==='clubs'?clubsView():tab==='match'?matchCenter():tab==='ranking'?tournamentReportTabs('ranking')+standings():tab==='matrix'?tournamentReportTabs('matrix')+matrix():fixtures())+'</div>'+teamBottomNav();const sheet=r.querySelector('.scs-team-sheet');if(sheet)sheet.scrollTop=teamScrollPositions[tab]||0;r.querySelector('[data-close]').onclick=close;r.querySelector('[data-team-save]')?.addEventListener('click',saveTeamTournamentNow);r.querySelectorAll('[data-team-section]').forEach(x=>x.onclick=()=>{
 const section=x.dataset.teamSection;
 if(section==='selected'&&!selectedEncounterId)return;
 if(section==='fixtures'){selectedEncounterId=null;switchTeamTab('fixtures');}
 else if(section==='selected')switchTeamTab('fixtures');
 else switchTeamTab(section);
});r.querySelectorAll('[data-team-nav]').forEach(x=>x.onclick=()=>{const key=x.dataset.teamNav;if(key==='home')switchTeamTab('home');else if(key==='clubs')switchTeamTab(state.encounters.length?'clubs':'setup');else if(key==='tournament'){switchTeamTab('fixtures')}else if(key==='match'&&state.encounters.length)switchTeamTab('match')});r.querySelectorAll('[data-team-go]').forEach(x=>x.onclick=()=>{switchTeamTab(x.dataset.teamGo)});r.querySelector('#team-title')?.addEventListener('input',e=>{state.title=e.target.value;save()});r.querySelector('#team-match-count')?.addEventListener('change',e=>{const n=Number(e.target.value);if(![3,5,7,9].includes(n))return;state.matchesPerEncounter=n;save();render()});hydratePlayerCards();
decorateMatchCenter(r);hydratePlayerCards();
r.querySelector('[data-add]')?.addEventListener('click',()=>clubEditor(state.clubs.length));r.querySelectorAll('[data-matrix-encounter]').forEach(x=>x.addEventListener('click',()=>showMatrixEncounter(x.dataset.matrixEncounter)));r.querySelectorAll('[data-standing]').forEach(x=>x.addEventListener('click',()=>{const i=Number(x.dataset.standing);if(!Number.isInteger(i)||i<0||i>=state.clubs.length)return;expandedStandings.has(i)?expandedStandings.delete(i):expandedStandings.add(i);render()}));r.querySelectorAll('[data-expand]').forEach(x=>x.onclick=()=>{let i=Number(x.dataset.expand);expandedClubs.has(i)?expandedClubs.delete(i):expandedClubs.add(i);render()});r.querySelectorAll('[data-edit]').forEach(x=>x.onclick=()=>clubEditor(Number(x.dataset.edit)));r.querySelectorAll('[data-remove]').forEach(x=>x.onclick=()=>{if(state.encounters.length){alert('Club membership cannot be removed after fixtures have been generated.');return}if(!confirm('Remove this club and its roster from the tournament?'))return;state.clubs.splice(Number(x.dataset.remove),1);expandedClubs.clear();save();render()});r.querySelector('[data-generate]')?.addEventListener('click',generate);r.querySelectorAll('[data-open-encounter]').forEach(x=>x.onclick=()=>{selectedEncounterId=x.dataset.openEncounter;render();const sheet=root()?.querySelector('.scs-team-sheet');if(sheet)sheet.scrollTop=0;teamScrollPositions.fixtures=0});r.querySelector('[data-back-encounters]')?.addEventListener('click',()=>{selectedEncounterId=null;render();const sheet=root()?.querySelector('.scs-team-sheet');if(sheet)sheet.scrollTop=0;teamScrollPositions.fixtures=0});r.querySelectorAll('[data-open-match-encounter]').forEach(x=>x.onclick=()=>{selectedEncounterId=x.dataset.openMatchEncounter;teamScrollPositions.match=0;render()});r.querySelector('[data-back-match-encounters]')?.addEventListener('click',()=>{selectedEncounterId=null;teamScrollPositions.match=0;render()});r.querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{switchTeamTab(x.dataset.tab)});r.querySelectorAll('[data-encounter]').forEach(x=>x.onclick=()=>editEncounter(x.dataset.encounter));r.querySelectorAll('[data-matchtab]').forEach(x=>x.onclick=()=>{rememberTeamScroll();matchTab=x.dataset.matchtab;render()});const selectedMatchTab=r.querySelector('.scs-tm-live-tabs button.active');if(selectedMatchTab)selectedMatchTab.scrollIntoView({block:'nearest',inline:'nearest'});r.querySelectorAll('[data-courts]').forEach(x=>x.onclick=()=>{const highestOccupied=Math.max(0,...allMatches().filter(m=>m.court&&m.status!=='approved').map(m=>Number(m.court)||0));state.courtCount=Math.max(1,highestOccupied,Math.min(12,state.courtCount+Number(x.dataset.courts)));save();render()});r.querySelectorAll('[data-assign]').forEach(x=>x.onclick=()=>{assigning=x.dataset.assign;render();root()?.querySelector('.scs-team-court-chooser')?.scrollIntoView({block:'nearest'})});r.querySelector('[data-cancel]')?.addEventListener('click',()=>{assigning=null;render()});r.querySelectorAll('[data-choose]').forEach(x=>x.onclick=()=>{let m=allMatches().find(y=>y.id===assigning),n=Number(x.dataset.choose);if(!m||m.status!=='pending')return;let occupying=allMatches().find(y=>y.court===n&&y.status!=='approved');if(occupying){alert('Court is occupied. Select a free court.');return}m.court=n;m.status='assigned';assigning=null;save();render()});r.querySelectorAll('[data-start]').forEach(x=>x.onclick=()=>{let m=allMatches().find(y=>y.id===x.dataset.start);m.status='playing';save();render()});r.querySelectorAll('.scs-team-match-shell[data-match-id]').forEach(x=>{
 const m=allMatches().find(y=>y.id===x.dataset.matchId);
 if(!m||!['approved','score_ready'].includes(m.status)||viewOnly||!m.score?.finished)return;
 const openSaved=()=>{if(!window.SCSScoring||!SCSScoring.openTeamCompleted){alert('Scoreboard is unavailable.');return;}const overlay=root();if(overlay)overlay.hidden=true;try{if(!SCSScoring.openTeamCompleted(m.id,m.score)&&overlay)overlay.hidden=false;}catch(err){if(overlay)overlay.hidden=false;console.error(err);alert('Could not open saved scoreboard.');}};
 x.addEventListener('click',e=>{if(e.target.closest('button,a,select,input'))return;openSaved()});
 x.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSaved()}});
 });r.querySelectorAll('[data-score]').forEach(x=>x.onclick=()=>{let m=allMatches().find(y=>y.id===x.dataset.score);if(!m||m.status!=='playing'||!m.court)return;if(!window.SCSScoring||!SCSScoring.openGroupMatch){alert('Scoreboard is unavailable.');return;}const overlay=root();if(overlay)overlay.hidden=true;try{SCSScoring.openGroupMatch({sessionId:'local-team-'+m.id,round:1,court:m.court,pair1:m.pairs[0],pair2:m.pairs[1],courtCenter:true,groupId:m.id})}catch(error){if(overlay)overlay.hidden=false;console.error('Team match scoring:',error);alert('Could not open the scoreboard.')}});r.querySelectorAll('[data-approve]').forEach(x=>x.onclick=()=>{let m=allMatches().find(y=>y.id===x.dataset.approve);if(m.status!=='score_ready'||!m.score?.finished)return;m.status='approved';m.court=null;save();render()});}
function scoreUpdate(id,score,winner){let m=allMatches().find(x=>x.id===id);if(!m||!['playing','score_ready'].includes(m.status))return false;m.score=score;if(winner){m.winner=winner;m.status='score_ready'}save();render();return true}
function updateCompletedScore(id,score,winner){
 const m=allMatches().find(x=>x.id===id);
 if(!m||!['approved','score_ready'].includes(m.status)||viewOnly||!score?.finished||!['L','R'].includes(winner))return false;
 const wasApproved=m.status==='approved';m.score=score;m.winner=winner;m.status=wasApproved?'approved':'score_ready';if(wasApproved)m.court=null;
 save();render();return true;
}
function conductMatches(){return allMatches().filter(m=>m.court&&['playing','score_ready'].includes(m.status)).map(m=>({id:m.id,court:m.court,status:m.status,pair1:m.pairs[0],pair2:m.pairs[1],score:m.score,winner:m.winner,label:matchName(m)}));}
function finishConductMatch(id){const m=allMatches().find(x=>x.id===id);if(!m||m.status!=='score_ready'||!m.score?.finished||!['L','R'].includes(m.winner))return false;m.status='approved';m.court=null;save();render();return true;}
window.SCSTeamTournament={open,close,scoreUpdate,updateCompletedScore,conductMatches,finishConductMatch,playersManagerReturned,returnFromScore(){if(root())root().hidden=false},getState(){load();return state}};
})();
