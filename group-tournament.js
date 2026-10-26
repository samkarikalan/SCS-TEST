(function(){
'use strict';
const KEY='scs_group_tournament_ui_v1';
const GROUP_MAIN_KEY='scs_group_multi_event_v1';let groupMain=null,groupEventId=null,groupHome=false;
const groupEventKey=id=>'scs_group_event_'+id;
function groupId(){return 'gr-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)}
function groupMainSave(){
 if(!groupMain||viewOnly)return;
 groupMain._scsMainTournament=true;
 groupMain._scsClientTournamentId=groupMain._scsClientTournamentId||groupMain.id||(groupMain.id=groupId());
 localStorage.setItem(GROUP_MAIN_KEY,JSON.stringify(groupMain));
 if(typeof window.scsQueueTournamentCloudSave==='function')window.SCSTournamentStore.queue('group',groupMain);
}
function groupEnsureMain(){try{groupMain=JSON.parse(localStorage.getItem(GROUP_MAIN_KEY)||'null')}catch(_){groupMain=null}
 if(!groupMain){groupMain={title:'Group Tournament',events:[],activeEventId:null};try{const legacy=JSON.parse(localStorage.getItem(KEY)||'null');if(legacy&&(legacy.created||legacy.started||legacy.title)){const id=groupId();groupMain.events.push({id,title:legacy.title||'Group Event'});groupMain.activeEventId=id;localStorage.setItem(groupEventKey(id),JSON.stringify(legacy))}}catch(_){}}
 if(!Array.isArray(groupMain.events))groupMain.events=[];groupEventId=groupMain.events.some(e=>e.id===groupMain.activeEventId)?groupMain.activeEventId:(groupMain.events[0]?.id||null);groupMain.activeEventId=groupEventId;groupMainSave()}
function groupHomeRender(){groupHome=true;const root=el();if(!root)return;const events=groupMain.events.map(e=>{let v={};try{v=JSON.parse(localStorage.getItem(groupEventKey(e.id))||'{}')}catch(_){}return {...e,teams:Object.keys(v.assignments||{}).length,clubs:Object.values(v.assignments||{}).filter(a=>Array.isArray(a)&&a.some(Boolean)).map((_,i)=>'Team '+(i+1)),matches:(v.matches||[]).length,completed:(v.matches||[]).filter(m=>m.status==='approved').length}});
 window.ScsApi.events.mountHome(root,{title:groupMain.title||'Group Tournament',events,activeEventId:groupEventId,viewOnly,navAttribute:'data-group-nav',ariaLabel:'Group tournament sections'});
 root.querySelector('[data-close]').onclick=close;root.querySelectorAll('[data-open-event]').forEach(b=>b.onclick=()=>groupEventStageHome(b.dataset.openEvent));const add=root.querySelector('[data-add-event]');if(add)add.onclick=groupAddEvent;root.querySelectorAll('[data-group-nav]').forEach(b=>b.onclick=()=>{const target=b.dataset.groupNav;if(target==='home')groupHomeRender();else if(groupEventId)groupOpenEvent(groupEventId,target);else alert('Add an event first.')})}
function groupKnockoutReady(data){const ms=Array.isArray(data.matches)?data.matches:[];return !!data.started&&ms.length>0&&ms.every(m=>m.status==='approved')}
function groupKnockoutCandidates(data,stage){
 const cfg=data.config||{},count=Number(stage===0?cfg.top:cfg.bottom)||0,offset=stage===0?0:Number(cfg.top)||0;
 const all=[];
 for(let g=0;g<(Number(cfg.groups)||0);g++){
  const ranked=groupResults(g);
  ranked.slice(offset,offset+count).forEach((t,i)=>{const players=(data.assignments||{})[t.id]||[];all.push({id:t.id,group:g,rank:offset+i+1,players,details:(data.selectedPlayerDetails||[]).filter(p=>players.some(n=>String(p.name||p.player||'')===String(n)))});});
 }
 return all;
}
function groupKnockoutOpen(stage){
 const id=groupEventId,data=JSON.parse(localStorage.getItem(groupEventKey(id))||'{}');
 if(!groupKnockoutReady(data)){alert('Complete and approve every group match first.');return}
 const key='scs_group_knockout_'+id+'_'+stage;
 let saved=JSON.parse(localStorage.getItem(key)||'null');
 if(!saved){
  const teams=groupKnockoutCandidates(data,stage);
  if(teams.length<4||teams.length>64){alert('Knockout bracket requires 4 to 64 qualified teams.');return}
  if(!window.SCSTournament||typeof SCSTournament.generateCustomTwoSided!=='function'){alert('Knockout module is unavailable.');return}
  const left=Math.ceil(teams.length/2),names=teams.map(t=>t.players.join(' / '));
  saved=SCSTournament.generateCustomTwoSided(teams.length,left,null,null,(data.title||'Event')+(Number(data.config?.knockouts)===2?(stage===0?' — Top Knockout':' — Bottom Knockout'):' — Knockout'),names);
  saved.entries.forEach((e,i)=>{e.playerDetails=teams[i].details;e.groupSource=teams[i].id;e.groupRank=teams[i].rank});
  saved.selectedPlayerDetails=teams.flatMap(t=>t.details);
  saved._scsGroupEventId=id;saved._scsGroupKnockoutStage=stage;
  saved.assistAssignmentsConfirmed=true;saved.knockoutFixturesGenerated=true;saved.assistFinalized=true;
  localStorage.setItem(key,JSON.stringify(saved));
 }
 if(!window.SCSTournament||typeof window.SCSTournament.open!=='function'){alert('Knockout module is unavailable.');return}
 try{window.SCSTournament.open(saved,false,function(updated){localStorage.setItem(key,JSON.stringify(updated));return Promise.resolve(updated)});}
 catch(error){console.error('Group knockout launch failed',error);alert('Could not open Knockout. '+(error&&error.message||'Please retry.'));}
}
function groupKnockoutPreview(stage){
 const data={config,assignments,selectedPlayerDetails:groupSelectedPlayerDetails,matches,started};
 const complete=groupKnockoutReady(data),candidates=complete?groupKnockoutCandidates(data,stage):[];
 const label=Number(config.knockouts)===2?(stage===0?'Top Knockout':'Bottom Knockout'):'Knockout';
 return '<div class="scs-gt-matrix-knockout-empty"><h4>'+label+'</h4><p>'+(stage===0?config.top:config.bottom)+' qualifying teams per group</p>'+
 (complete?'<p>Qualified teams from approved group rankings:</p>'+Array.from({length:config.groups},(_,g)=>'<div class="scs-gt-qualified-group"><strong>Group '+groupLabel(g)+'</strong>'+candidates.filter(t=>t.group===g).map(t=>'<p>'+t.rank+'. '+escapeHTML(t.players.join(' / '))+'</p>').join('')+'</div>').join('')+'<button type="button" class="scs-gt-primary scs-gt-knockout-launch" data-group-knockout-continue="'+stage+'">'+(localStorage.getItem('scs_group_knockout_'+groupEventId+'_'+stage)?'Continue Knockout':'Generate Knockout')+'</button>':'<p>Knockout becomes available after all group matches are completed and approved.</p>')+'</div>';
}
function groupEventStageHome(id){
 if(!groupMain||!groupMain.events.some(e=>e.id===id))return;
 groupEventId=id;groupMain.activeEventId=id;groupMainSave();groupHome=true;
 const root=el();if(!root)return;
 let data={};try{data=JSON.parse(localStorage.getItem(groupEventKey(id))||'{}')}catch(_){}
 const event=groupMain.events.find(e=>e.id===id);
 const ms=Array.isArray(data.matches)?data.matches:[];
 const complete=groupKnockoutReady(data);
 const count=ms.filter(m=>m.status==='approved').length;
 root.classList.add('scs-api-home-host');
 root.innerHTML='<div class="scs-gt-stage-home"><header><button type="button" data-stage-back>‹ Events</button><h2>'+escapeHTML(event.title||'Group Event')+'</h2></header>'+
 '<div class="scs-gt-stage-tiles"><button type="button" class="scs-gt-stage-tile" data-stage-group><span class="scs-gt-stage-icon">♟</span><strong>Group Stage</strong><small>'+count+' / '+ms.length+' matches completed</small><span class="scs-gt-stage-label">Open Group Stage ›</span></button>'+
 '<button type="button" class="scs-gt-stage-tile scs-gt-stage-knockout" data-stage-knockout '+(complete?'':'disabled')+'><span class="scs-gt-stage-icon">🏆</span><strong>Knockout Stage</strong><small>'+(complete?'Group stage completed':'Locked until all group matches are approved')+'</small><span class="scs-gt-stage-label">Continue to Knockout</span></button></div></div>';
 root.querySelector('[data-stage-back]').onclick=groupHomeRender;
 root.querySelector('[data-stage-group]').onclick=()=>groupOpenEvent(id,'tournament');
 if(complete)root.querySelector('[data-stage-knockout]').onclick=()=>{groupOpenEvent(id,'tournament');matrixSection='knockout-0';tournamentView='matrix';render()};
}
function groupOpenEvent(id,section){if(!groupMain.events.some(e=>e.id===id))return;groupEventId=id;groupMain.activeEventId=id;groupMainSave();groupHome=false;window.ScsApi.events.leaveHome(el());applyState(JSON.parse(localStorage.getItem(groupEventKey(id))||'null')||{title:groupMain.events.find(e=>e.id===id).title});assistStep=0;tab=section==='clubs'?'players':section==='match'?'match':'main';render()}
function groupAddEvent(){window.ScsApi.events.requestEvent({parentTitle:groupMain.title,onCreate:title=>{if(groupMain.events.some(e=>e.title.toLowerCase()===title.toLowerCase())){alert('Event already exists.');return}const id=groupId();groupMain.events.push({id,title});groupMain.activeEventId=id;groupMainSave();localStorage.setItem(groupEventKey(id),JSON.stringify({title,created:false,assistMode:true,config:{groups:4,per:4,knockouts:1,top:2,bottom:1},pool:[],teamDrafts:[],assignments:{},matches:[],started:false}));groupEventStageHome(id)}})}

 let groupSelectedPlayerDetails=[];
 let cloudTournamentId='',clientTournamentId='',title='',config={groups:4,per:4,knockouts:1,top:2,bottom:1},created=false,assistStep=0,assistPatternReady=false,assistMode=true,tab='main',tournamentView='all',matrixSection='group-0',matchesSection='group-0',matchesStatus='all',pool=[],teamDrafts=[],assignments={},started=false,matches=[],courtCount=2,assignmentSerial=0,matchTab='waiting',assigningMatch=null,viewOnly=false;
const el=()=>document.getElementById('scsGroupTournament');
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function load(){try{let v=JSON.parse(localStorage.getItem(groupEventId?groupEventKey(groupEventId):KEY));if(v){cloudTournamentId=v._scsCloudTournamentId||'';clientTournamentId=v._scsClientTournamentId||'';title=String(v.title||'Group Tournament');config=v.config||config;created=!!v.created;assistMode=typeof v.assistMode==='boolean'?v.assistMode:!created;assistPatternReady=!!v.assistPatternReady;pool=Array.isArray(v.pool)?v.pool:[];groupSelectedPlayerDetails=Array.isArray(v.selectedPlayerDetails)?v.selectedPlayerDetails:[];assignments=v.assignments||{};teamDrafts=Array.isArray(v.teamDrafts)?v.teamDrafts:Object.keys(assignments).sort().map(k=>assignments[k]).filter(x=>Array.isArray(x)&&x.length===2);started=!!v.started;matches=Array.isArray(v.matches)?v.matches:[];courtCount=Number(v.courtCount)||2;assignmentSerial=Number(v.assignmentSerial)||0}}catch(e){}}
 function save(){try{if(viewOnly)return;const state={_scsCloudTournamentId:cloudTournamentId,_scsClientTournamentId:clientTournamentId,_scsParentTournamentId:groupMain?groupMain._scsClientTournamentId||groupMain.id:null,_scsParentTournamentTitle:groupMain?groupMain.title:null,_scsGroupEventId:groupEventId,_scsMainTournament:false,title,config,created,assistMode,assistPatternReady,pool,selectedPlayerDetails:groupSelectedPlayerDetails,teamDrafts,assignments,started,matches,courtCount,assignmentSerial};if(typeof window.scsEnsureTournamentClientId==='function')clientTournamentId=state._scsClientTournamentId=window.scsEnsureTournamentClientId(state);localStorage.setItem(groupEventId?groupEventKey(groupEventId):KEY,JSON.stringify(state));if(typeof window.scsQueueTournamentCloudSave==='function')window.SCSTournamentStore.queue('group',state)}catch(e){}}
let groupSaveBusy=false;
async function saveGroupTournamentNow(){
 if(viewOnly||groupSaveBusy)return;
 const indicator=el()?.querySelector('[data-group-save-status]');
 const button=el()?.querySelector('[data-group-save-now]');
 groupSaveBusy=true;if(button)button.disabled=true;
 if(indicator)indicator.textContent='Saving…';
 try{
  save();
  const snapshot=JSON.parse(localStorage.getItem(groupEventId?groupEventKey(groupEventId):KEY)||'null');
  if(!snapshot||typeof window.dbSaveTournamentState!=='function')throw Error('Server save unavailable; local copy retained.');
  const id=await window.SCSTournamentStore.save('group',snapshot);
  if(!id)throw Error('Server did not confirm save; local copy retained.');
  cloudTournamentId=id;
  snapshot._scsCloudTournamentId=id;
  localStorage.setItem(groupEventId?groupEventKey(groupEventId):KEY,JSON.stringify(snapshot));
  if(indicator)indicator.textContent='✓ Saved to server';
 }catch(e){if(indicator)indicator.textContent='⚠ '+(e.message||'Server save failed; local copy retained.');}
 finally{groupSaveBusy=false;if(button)button.disabled=false;}
}
function applyState(v){if(!v)return;cloudTournamentId=v._scsCloudTournamentId||'';clientTournamentId=v._scsClientTournamentId||'';title=String(v.title||'Group Tournament');config=v.config||config;created=!!v.created;assistMode=typeof v.assistMode==='boolean'?v.assistMode:!created;assistPatternReady=!!v.assistPatternReady;pool=Array.isArray(v.pool)?v.pool:[];groupSelectedPlayerDetails=Array.isArray(v.selectedPlayerDetails)?v.selectedPlayerDetails:[];assignments=v.assignments||{};teamDrafts=Array.isArray(v.teamDrafts)?v.teamDrafts:Object.keys(assignments).sort().map(k=>assignments[k]).filter(x=>Array.isArray(x)&&x.length===2);started=!!v.started;matches=Array.isArray(v.matches)?v.matches:[];courtCount=Number(v.courtCount)||2;assignmentSerial=Number(v.assignmentSerial)||0}
function open(mode,viewState){
 viewOnly=mode==='view';if(!viewOnly){if(mode==='new'){window.ScsApi.events.requestCreate({onCreate:name=>{groupMain={title:name,events:[],activeEventId:null,id:groupId()};groupMainSave();if(!el()){let d=document.createElement('div');d.id='scsGroupTournament';d.className='scs-gt-overlay';document.body.appendChild(d)}groupHomeRender()},onCancel:()=>{if(typeof window.scsReturnToTournamentParent==='function')window.scsReturnToTournamentParent()}});return}groupEnsureMain();if(mode!=='new'){if(!el()){let d=document.createElement('div');d.id='scsGroupTournament';d.className='scs-gt-overlay';document.body.appendChild(d)}groupHomeRender();return;}if(!el()){let d=document.createElement('div');d.id='scsGroupTournament';d.className='scs-gt-overlay';document.body.appendChild(d)}groupAddEvent();return;}if(viewOnly)applyState(viewState);else load();assistStep=0;
 // Creation must enter Assist, never the legacy organizer page.
 // Continue retains an existing started tournament's organizer interface.
 if(mode==='new'){
  if(started||created){
   if(!confirm('Start a new Group Tournament? Your existing saved tournament will be replaced.'))return;
    title='';config={groups:4,per:4,knockouts:1,top:2,bottom:1};pool=[];teamDrafts=[];assignments={};matches=[];
   started=false;created=false;assistPatternReady=false;assignmentSerial=0;
  }
  cloudTournamentId='';clientTournamentId='';
  if(typeof window.scsResetTournamentCloudIdentity==='function')window.scsResetTournamentCloudIdentity('group');
  assistMode=true;save();
 }else if(!started){
  // Saved-but-unstarted tournaments return to the Assist index.
  assistMode=true;save();
 }
 if(!el()){let d=document.createElement('div');d.id='scsGroupTournament';d.className='scs-gt-overlay';document.body.appendChild(d)}
 render();
}
function close(){el()?.remove();if(window.scsTournamentReturnPage&&typeof window.scsReturnToTournamentParent==='function')window.scsReturnToTournamentParent()}
function updateCompletedScore(id,score,winner){
 const m=matches.find(v=>String(v.id)===String(id));
 if(!m||viewOnly||!m.score||!score?.finished)return false;
 m.score=score;m.winner=winner;save();render();return true;
}
function card(title,body){return '<section class="scs-gt-card"><h3>'+title+'</h3>'+body+'</section>'}
function setup(){
let fields=[['groups','Number of groups',config.groups],['per','Teams per group',config.per],['knockouts','Number of knockouts (1 or 2)',config.knockouts],['top',config.knockouts===1?'Qualifiers per group':'Top knockout qualifiers per group',config.top]];
if(config.knockouts===2)fields.push(['bottom','Bottom knockout qualifiers per group',config.bottom]);
return card('Create Group Tournament','<label class="scs-gt-title-field">Tournament name<input type="text" maxlength="120" data-title required value="'+escapeHTML(title)+'" placeholder="e.g. Autumn Club Championship"></label><div class="scs-gt-fields">'+fields.map(([key,label,val])=>'<label>'+label+'<input type="number" min="1" '+(key==='knockouts'?'max="2"':'')+' data-config="'+key+'" value="'+val+'"></label>').join('')+'</div><p>Give every tournament a clear name so players can identify it in Continue and Live lists.</p><p>Top knockout selects the highest-ranked teams in each group. Bottom knockout selects the next positions, without duplicates.</p><button class="scs-gt-primary" data-action="create">Create Groups</button>');
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

// Group section: roster and group assignments only; no standings or match history.
function groupRoster(){
 return '<div class="scs-gt-roster-groups">'+Array.from({length:config.groups},(_,g)=>{
  const entries=Array.from({length:config.per},(_,j)=>({id:g+':'+j,players:assignments[g+':'+j]||[]}));
  return '<section class="scs-tm-pool scs-gt-roster-group"><div class="scs-tm-pool-heading"><div><small>GROUP '+groupLabel(g)+'</small><h3>Group '+groupLabel(g)+'</h3></div><span class="scs-gt-roster-count">'+entries.filter(t=>t.players.length===2).length+' / '+config.per+' teams</span></div><div class="scs-gt-roster-team-list">'+entries.map((t,i)=>{
   const card=window.SCSTeamPicker&&SCSTeamPicker.compactTeamCard
    ?SCSTeamPicker.compactTeamCard(i,t.players,groupSelectedPlayerDetails,'')
    :'<article class="scs-tm-compact-team"><strong>Team '+(i+1)+'</strong><div class="scs-tm-compact-players">'+(t.players.length?t.players.map(playerRow).join(''):'<span class="scs-gt-unassigned">Not assigned</span>')+'</div></article>';
   return '<div class="scs-gt-roster-team">'+card+'</div>';
  }).join('')+'</div></section>';
 }).join('')+'</div>';
}
function playerRow(name){
 if(window.SCSTeamPicker&&SCSTeamPicker.rosterRow)return SCSTeamPicker.rosterRow(name,groupSelectedPlayerDetails);
 return '<span class="scs-tm-shared-player"><span class="scs-tm-ring-slot" data-tm-player="'+escapeHTML(name)+'"></span><span class="scs-tm-shared-name">'+escapeHTML(name)+'</span></span>';
}
// Group Assist reuses the Knockout compact-team layout and shared picker.
// These two views were previously referenced without implementations.
let poolExpanded=false;
function players(){
 const names=pool.length?pool:groupSelectedPlayerDetails.map(p=>p.player||p.name).filter(Boolean);
 return '<section class="scs-tm-pool scs-tm-player-pool"><div class="scs-tm-pool-heading"><div><small>TOURNAMENT PLAYERS</small><h3>Players ('+names.length+')</h3></div><div class="scs-tm-pool-actions"><button type="button" data-toggle-pool aria-expanded="'+poolExpanded+'">'+(poolExpanded?'Hide ▲':'Show ▼')+'</button><button type="button" data-open-manager>+ Players Manager</button></div></div>'+(poolExpanded?(names.length?'<div class="scs-tm-pool-chips">'+names.map(playerRow).join('')+'</div>':'<p>Select players using Players Manager.</p>'):'')+'</section>';
}
function teamsCard(){
 return '<section class="scs-tm-pool scs-tm-teams-flat"><div class="scs-tm-pool-heading"><div><small>TOURNAMENT TEAMS</small><h3>Teams ('+teamDrafts.length+')</h3></div><div class="scs-tm-pool-actions"><button type="button" data-add-team aria-label="Add team" title="Add team">+</button></div></div>'+(teamDrafts.length?'<div class="scs-gt-assist-team-list">'+teamDrafts.map((team,i)=>{
 const actions='<details class="scs-tm-compact-actions"><summary aria-label="Team '+(i+1)+' actions" title="Team actions">⋮</summary><div class="scs-tm-compact-action-menu"><button type="button" data-edit-team="'+i+'">✎ Edit team</button><button type="button" data-remove-team="'+i+'">− Remove team</button></div></details>';
 return window.SCSTeamPicker&&SCSTeamPicker.compactTeamCard?SCSTeamPicker.compactTeamCard(i,team,groupSelectedPlayerDetails,actions):'<article class="scs-tm-compact-team"><div class="scs-tm-compact-team-head"><span>Team '+(i+1)+'</span>'+actions+'</div><div class="scs-tm-compact-players">'+team.map(playerRow).join('')+'</div></article>';
 }).join('')+'</div>':'<p class="scs-gt-empty">Add a team and choose two players using the shared team picker.</p>')+'</section>';
}
function groupMatchPlayer(name){
 const d=groupSelectedPlayerDetails.find(p=>String(p.player||p.name||'').trim().toLocaleLowerCase()===String(name||'').trim().toLocaleLowerCase());
 return SCSSharedMatchCenter.playerIdentity(name,d||{});
}
function hydratePlayerCards(){if(window.SCSTournamentPlayerLevel)window.SCSTournamentPlayerLevel.hydrate(el());}
function openPlayersManager(){
 if(viewOnly)return;
 if(!window.ScsApi||!ScsApi.players||typeof ScsApi.players.select!=='function')return;
 window.SCSTournamentPlayersPage.open({selected:groupSelectedPlayerDetails,onDone:function(players){
  groupSelectedPlayerDetails=players;pool=[...new Set(players.map(p=>p.player||p.name).filter(Boolean))];save();render();
 }});
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
  const names=pool.filter(n=>!used.has(n.toLowerCase()));
  const modal=document.createElement('section');modal.className='scs-tm-entry-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.innerHTML='<div class="scs-tm-entry-editor"><button type="button" class="scs-tm-entry-close" data-cancel aria-label="Close player assignment">×</button><h3>Entry '+(draftIndex+1)+' · Assign Players</h3><p>Select two players using the shared player cards.</p>'+[1,2].map(num=>'<input type="hidden" data-input="'+num+'" value="'+escapeHTML(old[num-1]||'')+'">').join('')+'<div class="scs-tm-entry-player-preview">'+old.map(playerRow).join('')+'</div><div class="scs-tm-import-actions"><button type="button" data-add-next-team>+ Add Team</button><button type="button" class="scs-tm-primary" data-done>Done</button></div><p class="scs-tm-entry-status" role="status"></p></div>';
  if(!window.SCSTeamPicker){console.error('Shared team picker unavailable');return}el().appendChild(modal);if(window.SCSTeamPicker){const picker=document.createElement('div');picker.className='scs-gt-shared-picker';modal.querySelector('.scs-tm-entry-editor p').after(picker);SCSTeamPicker.render(picker,{names,selected:old,max:2,row:playerRow,onChange:a=>{[1,2].forEach((n,i)=>modal.querySelector('[data-input="'+n+'"]').value=a[i]||'')}})}modal.querySelector('[data-cancel]').onclick=()=>modal.remove();
  const saveDraft=()=>{const picked=[1,2].map(n=>modal.querySelector('[data-input="'+n+'"]').value.trim()),error=modal.querySelector('.scs-tm-entry-status');if(picked.some(n=>!n)){error.textContent='Enter both player names to save this team.';return false}if(picked[0].toLowerCase()===picked[1].toLowerCase()){error.textContent='Choose two different players.';return false}if(picked.some(n=>used.has(n.toLowerCase()))){error.textContent='Player already assigned to another tournament team. Choose an available player.';return false}teamDrafts[draftIndex]=picked;save();return true};
  modal.querySelector('[data-add-next-team]').onclick=()=>{if(!saveDraft())return;if(teamDrafts.length>=64){modal.querySelector('.scs-tm-entry-status').textContent='Maximum 64 teams.';return}teamDrafts.push(['','']);save();modal.remove();render();editor('draft:'+(teamDrafts.length-1))};
  modal.querySelector('[data-done]').onclick=()=>{if(!saveDraft())return;modal.remove();render()};
  hydratePlayerCards();modal.onclick=e=>{if(e.target===modal)modal.remove()};return;
 }
 const [gi,ti]=id.split(':').map(Number);
 if(!Number.isInteger(gi)||!Number.isInteger(ti)||gi<0||ti<0||gi>=config.groups||ti>=config.per)return;
 const old=assignments[id]||[];
 const used=new Set(Object.entries(assignments).filter(([k])=>k!==id).flatMap(([,v])=>v).map(n=>n.toLowerCase()));
 const names=pool.filter(n=>!used.has(n.toLowerCase()));
 const modal=document.createElement('section');modal.className='scs-tm-entry-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 const opts=names.map(n=>'<option value="'+escapeHTML(n)+'">'+escapeHTML(n)+'</option>').join('');
 modal.innerHTML='<div class="scs-tm-entry-editor"><button type="button" class="scs-tm-entry-close" data-cancel aria-label="Close player assignment">×</button><h3>Group '+groupLabel(gi)+' · Team '+(ti+1)+' · Assign Players</h3><p>Select two players using the shared player cards.</p>'+[1,2].map(num=>'<input type="hidden" data-input="'+num+'" value="'+escapeHTML(old[num-1]||'')+'">').join('')+'<div class="scs-tm-entry-player-preview">'+old.map(playerRow).join('')+'</div><div class="scs-tm-import-actions"><button type="button" class="scs-tm-primary" data-done>Done</button></div><p class="scs-tm-entry-status" role="status"></p></div>';
 if(!window.SCSTeamPicker){console.error('Shared team picker unavailable');return}el().appendChild(modal);
 if(window.SCSTeamPicker){const picker=document.createElement('div');modal.querySelector('.scs-tm-entry-editor p').after(picker);SCSTeamPicker.render(picker,{names,selected:old,max:2,row:playerRow,onChange:a=>{[1,2].forEach((n,i)=>modal.querySelector('[data-input="'+n+'"]').value=a[i]||'')}})}
 modal.querySelector('[data-cancel]').onclick=()=>modal.remove();
 
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
  const serving=m.score&&m.score.finished!==true&&Array.isArray(m.score.names)&&Number.isInteger(m.score.server)?m.score.names[m.score.server]||'':'';
  return {number:n,playerRenderer:groupMatchPlayer,match:{status:ready?'AWAITING APPROVAL':playing?'IN PROGRESS':'ASSIGNED (Not Started)',label:m.id+' · Group '+groupLabel(m.group),groupIndex:m.group,left:assignments[m.a]||[],right:assignments[m.b]||[],ready,started:playing||ready,score:Array.isArray(sets)?sets.map(set=>(set.score||[]).join('–')).join(' | '):'',server:serving,winner:m.winner==='L'?'left':m.winner==='R'?'right':null,action:ready?'data-approve="'+escapeHTML(m.id)+'"':playing?'data-score="'+escapeHTML(m.id)+'"':'data-start-match="'+escapeHTML(m.id)+'"',actionLabel:ready?'Approve Result':playing?'View Score':'Start Match',cardAction:'data-group-court-card="'+escapeHTML(m.id)+'"'}};
 });
 const pending=matches.filter(m=>!!m.court&&['assigned','playing','score_ready'].includes(m.status));
 const done=matches.filter(m=>m.status==='approved');
 const underApproval=matches.filter(m=>m.status==='score_ready');
 const groupScoreCard=m=>({number:m.id,left:(assignments[m.a]||[]).join(' / '),right:(assignments[m.b]||[]).join(' / '),leftPlayers:assignments[m.a]||[],rightPlayers:assignments[m.b]||[],playerRenderer:groupMatchPlayer,score:groupCompletedScore(m),winner:m.winner==='L'?'left':m.winner==='R'?'right':null,action:m.score?'data-group-completed-score="'+escapeHTML(m.id)+'"':'',actionLabel:m.score?'View Scoreboard':'',cardAction:m.score?'data-group-completed-card="'+escapeHTML(m.id)+'"':''});
 return '<div class="scs-tm-unified-match-center">'+SCSSharedMatchCenter.panel({courtCount,courts,tab:matchTab,hideRanking:true,assigning:null,ranking:standings(),
  waiting:pending.sort((a,b)=>(priority.get(a.id)??99999)-(priority.get(b.id)??99999)).map(m=>({number:m.id,groupIndex:m.group,heading:'Group '+groupLabel(m.group),left:(assignments[m.a]||[]).join(' / '),right:(assignments[m.b]||[]).join(' / '),label:'Assigned · Court '+m.court,assigned:true,action:''})),
  underApproval:underApproval.map(groupScoreCard),completed:done.map(groupScoreCard),
  attrs:{change:n=>'data-courts="'+n+'"',choose:n=>'data-choose-court="'+n+'"',cancel:'data-cancel-court',tab:id=>'data-match-tab="'+id+'"'}
 })+'</div>';
}
function tournamentMatches(){
 if(!started)return card('Matches','Start the tournament to generate fixtures.');
 const selected=String(matchesSection||'group-0');
 const sections=Array.from({length:config.groups},(_,g)=>'<button type="button" data-group-matches-section="group-'+g+'" class="'+(selected==='group-'+g?'active':'')+'">Group '+groupLabel(g)+'</button>').join('');
 const knockoutTabs=Array.from({length:Math.max(1,Math.min(2,Number(config.knockouts)||1))},(_,i)=>'<button type="button" data-group-matches-section="knockout-'+i+'" class="'+(selected==='knockout-'+i?'active':'')+'">'+(config.knockouts===2?(i===0?'Top Knockout':'Bottom Knockout'):'Knockout')+'</button>').join('');
 const tabs='<nav class="scs-gt-matrix-tabs scs-gt-matches-tabs" aria-label="Match groups">'+sections+knockoutTabs+'</nav>';
 const categories=[['all','All'],['finished','Finished'],['live','Live'],['not-started','Not Started']];
 const filters='<nav class="scs-gt-matrix-tabs scs-gt-match-status-tabs" aria-label="Match status">'+categories.map(([id,label])=>'<button type="button" data-group-matches-status="'+id+'" class="'+(matchesStatus===id?'active':'')+'">'+label+'</button>').join('')+'</nav>';
 if(selected.startsWith('knockout-'))return '<section class="scs-gt-generated-fixtures"><h3>Generated Matches</h3>'+tabs+filters+'<p class="scs-gt-empty">Knockout fixtures are not yet generated. Results will appear when the knockout stage is implemented.</p></section>';
 const g=Math.max(0,Math.min(config.groups-1,Number(selected.slice(6))||0));
 const priority=new Map(rankMatches().ranked.map((x,i)=>[x.m.id,i]));
 const groupMatches=matches.filter(m=>Number(m.group)===g).filter(m=>{
  if(matchesStatus==='finished')return m.status==='approved';
  if(matchesStatus==='live')return m.status==='playing'||m.status==='score_ready'||Boolean(m.court&&m.status!=='approved');
  if(matchesStatus==='not-started')return m.status==='pending'&&!m.court;
  return true;
 }).sort((a,b)=>(priority.get(a.id)??99999)-(priority.get(b.id)??99999));
 return '<section class="scs-gt-generated-fixtures"><h3>Generated Matches</h3>'+tabs+filters+'<section class="scs-ko-fixture-round"><h4>Group '+groupLabel(g)+' · '+groupMatches.length+' matches</h4>'+(groupMatches.length?groupMatches.map(m=>{
  const left=assignments[m.a]||[],right=assignments[m.b]||[];
  const match={number:m.id,title:'Match '+m.id,left:left.join(' / '),right:right.join(' / '),leftPlayers:left,rightPlayers:right,playerRenderer:groupMatchPlayer,score:groupCompletedScore(m),winner:m.winner==='L'?'left':m.winner==='R'?'right':null};
  let matchCard=SCSSharedMatchCenter.completed(match);
  if(m.status!=='approved')matchCard=matchCard.replace('<span class="scs-tm-completed-check">✓</span>','<span class="scs-ko-fixture-pending">○</span>');
  let actions=m.status==='approved'&&m.score?'<button type="button" data-group-completed-score="'+escapeHTML(m.id)+'">View Scoreboard</button>':'';
  if(!viewOnly&&m.status==='pending'&&!m.court)actions='<button type="button" data-assign="'+escapeHTML(m.id)+'">Assign Court</button>';
  if(m.court&&m.status!=='approved')actions='<span>Assigned to Court '+escapeHTML(String(m.court))+'</span>';
  const cardAction=m.status==='approved'&&m.score?' role="button" tabindex="0" data-group-completed-card="'+escapeHTML(m.id)+'"':'';
  return '<div class="scs-ko-fixture-card scs-team-match-shell" data-match-id="'+escapeHTML(m.id)+'"'+cardAction+'>'+matchCard+(actions?'<div class="scs-ko-fixture-actions">'+actions+'</div>':'')+'</div>';
 }).join(''):'<p class="scs-gt-empty">No matches in this category.</p>')+'</section></section>';
}
function standings(){
 return Array.from({length:config.groups},(_,g)=>'<section class="scs-gt-standings-summary"><h4>Group '+groupLabel(g)+'</h4>'+groupResults(g).map((t,i)=>'<p>'+(i+1)+'. '+(assignments[t.id]||[]).map(escapeHTML).join(' / ')+' · W '+t.w+' · GD '+(t.gw-t.gl)+' · PD '+(t.pf-t.pa)+'</p>').join('')+'</section>').join('');
}

// Same matrix classes and bottom-sheet UI as Team Tournament; per-group fixtures.
function groupMatrix(){
 const sections=Array.from({length:config.groups},(_,g)=>'<button type="button" data-group-matrix-section="group-'+g+'" class="'+(matrixSection==='group-'+g?'active':'')+'">Group '+groupLabel(g)+'</button>').join('');
 const knockoutTabs=Array.from({length:Math.max(1,Math.min(2,Number(config.knockouts)||1))},(_,i)=>'<button type="button" data-group-matrix-section="knockout-'+i+'" class="'+(matrixSection==='knockout-'+i?'active':'')+'">'+(config.knockouts===2?(i===0?'Top Knockout':'Bottom Knockout'):'Knockout')+'</button>').join('');
 const selected=String(matrixSection||'group-0');
 const tabs='<nav class="scs-gt-matrix-tabs" aria-label="Matrix stages">'+sections+knockoutTabs+'</nav>';
 if(selected.startsWith('knockout-')){
  const idx=Number(selected.slice(9))||0;
  const qualifiers=idx===0?config.top:config.bottom;
  return '<section class="scs-team-matrix"><h3>Results Matrix</h3>'+tabs+groupKnockoutPreview(idx)+'</section>';
 }
 const g=Math.max(0,Math.min(config.groups-1,Number(selected.slice(6))||0));
 return '<section class="scs-team-matrix"><h3>Round-robin results matrix</h3>'+tabs+'<p>Rank: match wins → head-to-head → set difference → rally point difference. Swipe horizontally; tap a match for results.</p>'+[g].map(g=>{
  const ids=Array.from({length:config.per},(_,i)=>g+':'+i).filter(id=>Array.isArray(assignments[id])&&assignments[id].some(Boolean));
  const rows=groupResults(g),rank=new Map(rows.map((r,i)=>[r.id,i+1]));
  const label=id=>(assignments[id]||[]).filter(Boolean).join(' / ')||'Team '+(Number(id.split(':')[1])+1);
  return '<h4>Group '+groupLabel(g)+'</h4><div class="scs-team-matrix-scroll"><table class="scs-team-matrix-table"><thead><tr><th class="scs-team-matrix-sticky">Team</th>'+ids.map(id=>'<th style="--matrix-accent:#395d91">'+escapeHTML(label(id))+'</th>').join('')+'<th>W–L</th><th>Sets W–L</th><th>Rally F–A</th><th>Point diff.</th><th>Rank</th></tr></thead><tbody>'+ids.map(a=>{
   const r=rows.find(x=>x.id===a);
   return '<tr><th class="scs-team-matrix-sticky" style="--matrix-accent:#395d91">'+escapeHTML(label(a))+'</th>'+ids.map(b=>{
    if(a===b)return '<td class="scs-team-matrix-self">╲</td>';
    const m=matches.find(x=>Number(x.group)===g&&((x.a===a&&x.b===b)||(x.a===b&&x.b===a)));
    if(!m)return '<td>—</td>';
    const done=m.status==='approved'&&['L','R'].includes(m.winner),won=done&&(m.winner==='L'?m.a:m.b)===a;
    return '<td><button type="button" class="scs-team-matrix-cell" data-group-matrix-match="'+escapeHTML(m.id)+'"><small>'+escapeHTML(m.id)+'</small><strong>'+(done?(won?'Won':'Lost'):m.status==='pending'?'Pending':'In progress')+'</strong><span>'+(done?(won?'1–0':'0–1'):'0–0')+'</span></button></td>';
   }).join('')+'<td>'+(r?.w||0)+'–'+(r?.l||0)+'</td><td>'+(r?.gw||0)+'–'+(r?.gl||0)+'</td><td>'+(r?.pf||0)+'–'+(r?.pa||0)+'</td><td>'+((r?.pf||0)-(r?.pa||0))+'</td><td>'+(rank.get(a)||'—')+'</td></tr>';
  }).join('')+'</tbody></table></div>';
 }).join('')+'</section>';
}
function showGroupMatrixMatch(id){
 const m=matches.find(x=>String(x.id)===String(id)),host=el();if(!m||!host)return;
 host.querySelector('.scs-team-matrix-overlay')?.remove();
 const left=(assignments[m.a]||[]).join(' / '),right=(assignments[m.b]||[]).join(' / ');
 const status=m.status==='approved'?(m.winner==='L'?left:right)+' won':m.status.replace(/_/g,' ');
 const overlay=document.createElement('div');overlay.className='scs-team-matrix-overlay';
 overlay.innerHTML='<div class="scs-team-matrix-backdrop" data-group-matrix-dismiss></div><section class="scs-team-matrix-bottom-sheet" role="dialog" aria-modal="true" aria-label="Match details"><div class="scs-team-matrix-sheet-head"><span class="scs-team-matrix-sheet-label"></span><button type="button" data-group-matrix-dismiss aria-label="Close">✕</button></div><div class="scs-team-matrix-sheet-content"><h3>'+escapeHTML(m.id)+' · Group '+groupLabel(m.group)+'</h3><div class="scs-team-matrix-detail-row"><strong>'+escapeHTML(left)+'</strong><span>vs</span><strong>'+escapeHTML(right)+'</strong></div><div class="scs-team-matrix-detail-row"><strong>'+escapeHTML(status)+'</strong><span>'+escapeHTML(groupCompletedScore(m)||'No score yet')+'</span></div>'+(m.status==='approved'&&m.score?'<button type="button" data-matrix-score>View Scoreboard</button>':'')+'</div></section>';
 host.appendChild(overlay);
 const close=()=>{overlay.remove();document.removeEventListener('keydown',onKey)};
 const onKey=e=>{if(e.key==='Escape')close()};document.addEventListener('keydown',onKey);
 overlay.querySelectorAll('[data-group-matrix-dismiss]').forEach(x=>x.addEventListener('click',close));
 overlay.querySelector('[data-matrix-score]')?.addEventListener('click',()=>{if(!window.SCSScoring?.openCompleted)return;host.hidden=true;try{SCSScoring.openCompleted(m.score);close()}catch(err){host.hidden=false;console.error(err)}});
 let y=0;const sheet=overlay.querySelector('.scs-team-matrix-bottom-sheet');sheet.addEventListener('touchstart',e=>{y=e.touches[0].clientY},{passive:true});sheet.addEventListener('touchend',e=>{if(e.changedTouches[0].clientY-y>110&&overlay.querySelector('.scs-team-matrix-sheet-content').scrollTop===0)close()},{passive:true});
 overlay.querySelector('[data-group-matrix-dismiss].scs-team-matrix-sheet-head button')?.focus();
}

function startMatch(id){const m=matches.find(x=>x.id===id);if(!m||m.status!=='assigned')return;m.status='playing';m.startedAt=Date.now();save();render()}
function scoreMatch(id){const m=matches.find(x=>x.id===id);if(!m||m.status!=='playing')return;if(!window.SCSScoring||!SCSScoring.openGroupMatch){alert('Scoreboard is unavailable.');return}el().hidden=true;SCSScoring.openGroupMatch({sessionId:'local-group-'+id,round:1,court:m.court,pair1:assignments[m.a],pair2:assignments[m.b],courtCenter:true,groupId:id})}
function scoreUpdate(id,score,winner){const m=matches.find(x=>x.id===id);if(!m||!['playing','score_ready'].includes(m.status))return false;m.score=score;if(winner){m.winner=winner;m.status='score_ready'}save();render();return true}
function approveMatch(id){const m=matches.find(x=>x.id===id);if(!m||m.status!=='score_ready'||!['L','R'].includes(m.winner)||!m.score||!m.score.finished)return; m.status='approved';m.completedOrder=++assignmentSerial;m.completedCourt=m.court;m.court=null;save();render()}
function assignCourt(id){
 const m=matches.find(x=>x.id===id);
 if(!m||m.court||m.status!=='pending'||viewOnly)return;
 if(teamBusy(m.a)||teamBusy(m.b)){alert('A team is already assigned to another court.');return}
 if(!window.SCSCourtAssignmentPopup?.open){console.error('Shared court assignment popup unavailable');return}
 SCSCourtAssignmentPopup.open({title:m.id+' · Group '+groupLabel(m.group),
  courts:Array.from({length:courtCount},(_,i)=>({number:i+1,occupied:matches.some(x=>x.court===i+1&&x.status!=='approved')})),
  onChoose:n=>{
   if(m.status!=='pending'||m.court||teamBusy(m.a)||teamBusy(m.b)||matches.some(x=>x.court===n&&x.status!=='approved'))return false;
   m.court=n;m.status='assigned';m.assignedOrder=++assignmentSerial;assigningMatch=null;save();render();return true;
  }
 });
}
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
if(tab==='main'&&tournamentView==='ranking')return standings();
if(tab==='main'&&tournamentView==='matrix')return groupMatrix();
if(tab==='main'&&tournamentView==='matches')return tournamentMatches();
if(tab==='main')return (started?card('Group Tournament Started','<p>'+matches.length+' round-robin matches generated.</p>'):card('Start Group Tournament','<p>Assign all teams before starting.</p><button class="scs-gt-primary" data-start>Start Group Tournament</button>'))+card('Tournament Overview','<p>'+config.groups+' groups · '+config.per+' teams per group · '+config.knockouts+' knockout tournament'+(config.knockouts===1?'':'s')+'</p><p>Teams assigned: '+Object.keys(assignments).length+' / '+config.groups*config.per+'</p>')+groups()+card('Knockout qualification','<p>Top: '+config.top+' per group'+(config.knockouts===2?' · Bottom: '+config.bottom+' per group':'')+'</p><p class="scs-gt-empty">Bracket will appear after qualification is implemented in Stage 2.</p>');
if(tab==='players')return '<div class="scs-gt-roster-page">'+players()+groupRoster()+'</div>';
if(tab==='groups')return groups();
if(tab==='knockouts')return card('Knockout 1 — Top','<p>'+config.top+' qualifying positions per group</p><p class="scs-gt-empty">No qualified teams yet.</p>')+(config.knockouts===2?card('Knockout 2 — Bottom','<p>'+config.bottom+' qualifying positions per group</p><p class="scs-gt-empty">No qualified teams yet.</p>'):'');
return matchCenter();
}
function tournamentBottomNav(assisting){
 const active=assisting?(assistStep===1?'teams':assistStep>=2?'tournament':''):(tab==='players'?'teams':tab==='match'?'match':'tournament');
 const tournamentReady=!assisting||assistComplete(1);
 const liveReady=!assisting&&started;
 const items=[['home','Home','⌂',true],['teams','Group','♙',true],['tournament','Tournament','⑂',tournamentReady],['match','Match Center','▣',liveReady]];
 return '<nav class="scs-tm-organized-tabs scs-tm-bottom-nav scs-gt-bottom-nav" aria-label="Group tournament sections">'+items.map(([key,label,icon,enabled])=>'<button type="button" data-group-nav="'+key+'" class="'+(active===key?'active':'')+'" '+(enabled?'':'disabled')+(active===key?' aria-current="page"':'')+'><span class="scs-tm-nav-icon" aria-hidden="true">'+icon+'</span><span class="scs-tm-nav-label">'+label+'</span></button>').join('')+'</nav>';
}
function render(){
if(!el())return;
if(groupHome){groupHomeRender();return;}
const assisting=assistMode&&!started;
let body;
if(assisting)body=assistStep===0?assistIndex():assistView();
else body='<header><strong>'+escapeHTML(title)+'</strong><div class="scs-team-save-actions"><button type="button" data-group-save-now '+(viewOnly?'disabled':'')+'>Save Tournament</button><button data-action="close" aria-label="Close">✕</button></div></header><div data-group-save-status role="status" aria-live="polite"></div>'+(tab==='main'?'<nav class="scs-tm-live-tabs"><button data-tournament-view="all" class="'+(tournamentView==='all'?'active':'')+'">All</button><button data-tournament-view="ranking" class="'+(tournamentView==='ranking'?'active':'')+'">Ranking</button><button data-tournament-view="matrix" class="'+(tournamentView==='matrix'?'active':'')+'">Matrix</button><button data-tournament-view="matches" class="'+(tournamentView==='matches'?'active':'')+'">Matches</button></nav>':'')+((tab==='groups'||tab==='knockouts')?'<nav class="scs-gt-context-tabs" aria-label="Group tournament views"><button type="button" data-tab="groups" class="'+(tab!=='knockouts'?'active':'')+'">Groups</button><button type="button" data-tab="knockouts" class="'+(tab==='knockouts'?'active':'')+'">Knockouts</button></nav>':'')+view();
el().innerHTML='<div class="scs-gt-sheet'+(!assisting&&tab==='main'&&tournamentView==='matches'?' scs-ko-generated-fixtures scs-gt-matches-page':'')+'" role="dialog" aria-modal="true">'+body+'</div>'+tournamentBottomNav(assisting);
el().querySelector('[data-group-save-now]')?.addEventListener('click',saveGroupTournamentNow);
const closeButton=el().querySelector('[data-action="close"]');if(closeButton)closeButton.onclick=close;
el().querySelectorAll('[data-assist-step]').forEach(x=>x.onclick=()=>{assistStep=Number(x.dataset.assistStep);render()});
const back=el().querySelector('[data-assist-home]');if(back)back.onclick=()=>{assistStep=0;save();render()};
el().querySelectorAll('[data-assist-done]').forEach(x=>x.onclick=()=>assistDone(Number(x.dataset.assistDone)));
el().querySelectorAll('[data-config]').forEach(x=>x.onchange=()=>{let n=Number(x.value);if(!Number.isInteger(n)||n<1||n>64){alert('Enter a whole number between 1 and 64.');render();return}config[x.dataset.config]=x.dataset.config==='knockouts'?Math.min(2,n):n;assistPatternReady=false;save();render()});
 const titleInput=el().querySelector('[data-title]');if(titleInput)titleInput.onchange=()=>{title=titleInput.value.trim().slice(0,120);save();render()};
 const toggle=el().querySelector('[data-toggle-pool]');if(toggle)toggle.onclick=()=>{poolExpanded=!poolExpanded;render()};const manager=el().querySelector('[data-open-manager]');if(manager)manager.onclick=openPlayersManager;hydratePlayerCards();
 el().querySelectorAll('[data-edit-team]').forEach(x=>x.onclick=()=>editor('draft:'+x.dataset.editTeam));
 const addTeam=el().querySelector('[data-add-team]');if(addTeam)addTeam.onclick=()=>{if(teamDrafts.length>=64){alert('Maximum 64 teams.');return}teamDrafts.push(['','']);save();render();editor('draft:'+(teamDrafts.length-1))};
 el().querySelectorAll('[data-remove-team]').forEach(x=>x.onclick=e=>{e.stopPropagation();teamDrafts.splice(Number(x.dataset.removeTeam),1);save();render()});
el().querySelectorAll('[data-slot]').forEach(x=>x.onclick=()=>{if(!started)editor(x.dataset.slot)});
let start=el().querySelector('[data-start]');if(start)start.onclick=startTournament;
 el().querySelectorAll('[data-assign]').forEach(x=>x.onclick=()=>assignCourt(x.dataset.assign));
 el().querySelectorAll('[data-start-match]').forEach(x=>x.onclick=()=>startMatch(x.dataset.startMatch));
 el().querySelectorAll('[data-score]').forEach(x=>x.onclick=()=>scoreMatch(x.dataset.score));
 function openGroupSaved(id,editable=false){const m=matches.find(v=>String(v.id)===String(id));if(!m?.score||!window.SCSScoring?.openCompleted)return;const overlay=el();overlay.hidden=true;try{if(editable&&!viewOnly&&SCSScoring.openEditableCompleted)SCSScoring.openEditableCompleted(m.id,m.score,(score,winner)=>updateCompletedScore(m.id,score,winner));else SCSScoring.openCompleted(m.score)}catch(err){overlay.hidden=false;console.error('Group saved scoreboard:',err)}}
 el().querySelectorAll('[data-group-completed-score]').forEach(x=>x.onclick=e=>{e.stopPropagation();openGroupSaved(x.dataset.groupCompletedScore,tab!=='match')});
 el().querySelectorAll('[data-group-completed-card]').forEach(x=>{const open=()=>openGroupSaved(x.dataset.groupCompletedCard,tab!=='match');x.addEventListener('click',e=>{if(!e.target.closest('button,a,input,select'))open()});x.addEventListener('keydown',e=>{if(e.target===x&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open()}})});
 el().querySelectorAll('[data-group-court-card]').forEach(x=>{const open=()=>{const m=matches.find(v=>String(v.id)===x.dataset.groupCourtCard);if(!m)return;if(m.status==='playing')scoreMatch(m.id);else if(m.status==='score_ready'&&m.score)openGroupSaved(m.id,true);else if(m.status==='assigned')startMatch(m.id)};x.addEventListener('click',e=>{if(!e.target.closest('button,a,input,select'))open()});x.addEventListener('keydown',e=>{if(e.target===x&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open()}})});
 el().querySelectorAll('[data-approve]').forEach(x=>x.onclick=()=>approveMatch(x.dataset.approve));
 
 el().querySelectorAll('[data-courts]').forEach(x=>x.onclick=()=>{courtCount=Math.max(1,Math.min(32,courtCount+Number(x.dataset.courts),...matches.filter(m=>m.court).map(m=>m.court)));save();render()});
 el().querySelectorAll('[data-group-matches-section]').forEach(x=>x.addEventListener('click',()=>{matchesSection=x.dataset.groupMatchesSection;matchesStatus='all';render()}));
 el().querySelectorAll('[data-group-matches-status]').forEach(x=>x.addEventListener('click',()=>{matchesStatus=x.dataset.groupMatchesStatus;render()}));
 el().querySelectorAll('[data-group-knockout-continue]').forEach(b=>b.onclick=()=>groupKnockoutOpen(Number(b.dataset.groupKnockoutContinue)));
 el().querySelectorAll('[data-group-matrix-section]').forEach(x=>x.addEventListener('click',()=>{matrixSection=x.dataset.groupMatrixSection;render()}));
 el().querySelectorAll('[data-group-matrix-match]').forEach(x=>x.addEventListener('click',()=>showGroupMatrixMatch(x.dataset.groupMatrixMatch)));
 el().querySelectorAll('[data-tournament-view]').forEach(x=>x.onclick=()=>{tournamentView=x.dataset.tournamentView;render()});
el().querySelectorAll('[data-match-tab]').forEach(x=>x.onclick=()=>{matchTab=x.dataset.matchTab;render()});
 el().querySelectorAll('[data-choose-court]').forEach(x=>x.onclick=()=>{const n=Number(x.dataset.chooseCourt),m=matches.find(y=>y.id===assigningMatch);if(!m||m.court||teamBusy(m.a)||teamBusy(m.b))return;const occupant=matches.find(y=>y.court===n);if(occupant){if(occupant.status!=='assigned'){alert('This court has a started match.');return}if(!confirm('Replace '+occupant.id+' on Court '+n+'?'))return;occupant.court=null;occupant.status='pending';occupant.assignedOrder=0;}m.court=n;m.status='assigned';m.assignedOrder=++assignmentSerial;assigningMatch=null;save();render()});
 const cancelCourt=el().querySelector('[data-cancel-court]');if(cancelCourt)cancelCourt.onclick=()=>{assigningMatch=null;render()};
 el().querySelectorAll('[data-tab]').forEach(x=>x.onclick=()=>{tab=x.dataset.tab;render()});
 el().querySelectorAll('[data-group-nav]').forEach(x=>x.onclick=()=>{
  const target=x.dataset.groupNav;if(target==='home'){if(groupMain){save();groupHomeRender()}else close();return}
  if(assisting){if(target==='teams')assistStep=1;else if(target==='tournament'&&assistComplete(1))assistStep=Math.max(2,Math.min(5,assistStep||2));else return;save();render();return}
  tab=target==='teams'?'players':target==='tournament'?'main':target;save();render();
 });
let create=el().querySelector('[data-action="create"]');if(create)create.onclick=()=>{const input=el().querySelector('[data-title]');title=String(input?input.value:title).trim().slice(0,120);if(!title){alert('Enter a tournament name before creating the groups.');if(input)input.focus();return}if(config.top+(config.knockouts===2?config.bottom:0)>config.per){alert('Qualifiers cannot exceed teams per group.');return}created=true;tab='main';save();render()};
}
window.SCSGroupTournament={open,openLive:function(state){open('view',state)},close,playersManagerReturned,scoreUpdate,updateCompletedScore,openSection:function(section){tab=section==='teams'?'players':section==='match'?'match':'main';save();render()},returnFromScore:function(){if(el())el().hidden=false}};
})();
