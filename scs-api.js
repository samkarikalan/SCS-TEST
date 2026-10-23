(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=window.ScsApi=window.ScsApi||{};
api.cards=api.cards||{};
api.buttons=api.buttons||{};
api.navigation=api.navigation||{};
api.events=api.events||{};
api.cards.player=function(name,levelMarkup=''){
 return '<span class="scs-tm-shared-player"><span class="scs-tm-ring-slot" data-tm-player="'+esc(name)+'"></span><span class="scs-tm-shared-name">'+esc(name)+'</span>'+levelMarkup+'</span>';
};
// Shared player roster row: used by tournament modules with their own player selection rules.
// Stable subclub colors, shared by every tournament renderer. Same name/id -> same color.
const subclubColors=['#a3366e','#327fb6','#2d916f','#9260bd','#b17a29','#aa5356','#477c99','#7771b5','#688d35','#b06292'];
api.cards.subclubColor=function(name,id){
 const key=String(id||name||'').trim().toLocaleLowerCase();
 if(!key)return '#5279aa';
 let hash=2166136261;
 for(const ch of key){hash=Math.imul(hash^ch.charCodeAt(0),16777619)}
 return subclubColors[(hash>>>0)%subclubColors.length];
};
api.cards.rosterPlayer=function({name='',levelMarkup='',subClub='',subClubId='',accent=null,level=undefined,gender=null}={}){
 const pill=subClub?'<span class="scs-team-inline-club-pill scs-api-subclub-pill" style="--pill-accent:'+esc(accent||api.cards.subclubColor(subClub,subClubId))+'">'+esc(subClub)+'</span>':'';
 // Shared tournament level pill, using the same class and level colors as team cards.
 if(level!==undefined&&level!==null&&Number(level)>=1&&Number(level)<=5){
  const prefix=/female|woman|lady|women|f$/i.test(String(gender||''))?'L':'M';
  levelMarkup='<span class="scs-team-level-pill scs-api-level-pill" data-level="'+esc(level)+'">'+prefix+esc(level)+'</span>';
 }
 if(!levelMarkup)levelMarkup='<span class="scs-tournament-gender-level scs-team-level-pill scs-api-level-pill">—</span>';
 const player=api.cards.player(name,levelMarkup);
 return '<div class="scs-api-roster-row">'+player+pill+'</div>';
};
// Shared tournament roster presentation. Keep each tournament's existing data and actions.
api.cards.hydrateRoster=function(root){
 if(!root)return;
 root.querySelectorAll('.scs-api-roster-row').forEach(row=>{
  const level=row.querySelector('.scs-api-level-pill,.scs-tournament-gender-level');
  if(level){
   level.classList.add('scs-team-level-pill');
   const digit=(level.textContent||'').match(/[1-5]/);
   if(digit)level.dataset.level=digit[0];
  }
  const club=row.querySelector('.scs-api-subclub-pill,.scs-team-inline-club-pill');
  if(club){
   club.classList.add('scs-team-club-pill');
   if(!club.style.getPropertyValue('--scs-team-club-color')){
    const accent=club.style.getPropertyValue('--pill-accent');
    club.style.setProperty('--scs-team-club-color',api.cards.subclubColor(club.textContent.trim(),club.dataset.subclubId||''));
   }
  }
  row.classList.add('scs-shared-tournament-roster-row');
 });
};
api.buttons.render=function({label='',action='',className='',disabled=false}={}){
 return '<button type="button"'+(action?' data-'+esc(action):'')+(className?' class="'+esc(className)+'"':'')+(disabled?' disabled':'')+'>'+esc(label)+'</button>';
};
api.navigation.bottom=function({active='home',attribute='data-team-nav',ariaLabel='Tournament sections'}={}){
 const items=[['home','Home','⌂'],['clubs','Clubs','♙'],['tournament','Tournament','⑂'],['match','Match Center','▣']];
 return '<nav class="scs-tm-organized-tabs scs-tm-bottom-nav scs-gt-bottom-nav scs-team-bottom-nav" aria-label="'+esc(ariaLabel)+'">'+items.map(([key,label,icon])=>'<button type="button" '+esc(attribute)+'="'+key+'" class="'+(active===key?'active':'')+'"'+(active===key?' aria-current="page"':'')+'><span class="scs-tm-nav-icon" aria-hidden="true">'+icon+'</span><span class="scs-tm-nav-label">'+label+'</span></button>').join('')+'</nav>';
};
api.events.createForm=function(){
 return '<section class="scs-gt-card scs-team-main-create"><div class="scs-team-main-icon">🏆</div><h2>New Tournament</h2><p>Enter a tournament name. You can add Men’s Doubles, Women’s Doubles and other events on the next page.</p><label for="scs-main-name">Tournament Name</label><input id="scs-main-name" data-main-name type="text" maxlength="100" autocomplete="off" placeholder="e.g. Spring Tournament 2027" /><small data-main-error hidden>Please enter a tournament name.</small><div class="scs-team-main-actions"><button type="button" data-main-cancel>Cancel</button><button type="button" class="scs-gt-primary" data-main-create>Create Tournament →</button></div></section>';
};
api.events.requestCreate=function({onCreate,onCancel}={}){
 const backdrop=document.createElement('div');backdrop.className='scs-gt-overlay scs-team-overlay';backdrop.id='scs-api-create-overlay';backdrop.style.zIndex='2147483000';
 backdrop.innerHTML='<div class="scs-gt-sheet scs-team-sheet scs-team-create-sheet" role="dialog" aria-label="Create Tournament"><header><strong>Tournament</strong><button type="button" data-main-cancel aria-label="Close">✕</button></header>'+api.events.createForm()+'</div>';
 document.body.appendChild(backdrop);
 const cancel=()=>{backdrop.remove();if(onCancel)onCancel()};
 backdrop.querySelectorAll('[data-main-cancel]').forEach(b=>b.addEventListener('click',cancel));
 const submit=()=>{const input=backdrop.querySelector('[data-main-name]');const name=input.value.trim();if(!name){backdrop.querySelector('[data-main-error]').hidden=false;input.focus();return}backdrop.remove();if(onCreate)onCreate(name)};
 backdrop.querySelector('[data-main-create]').addEventListener('click',submit);
 backdrop.querySelector('[data-main-name]').addEventListener('keydown',e=>{if(e.key==='Enter')submit()});
 setTimeout(()=>backdrop.querySelector('[data-main-name]')?.focus(),0);
};
api.events.homePage=function({title='',events=[],activeEventId=null,viewOnly=false,navAttribute='data-team-nav',ariaLabel='Tournament sections'}={}){
 return '<div class="scs-gt-sheet scs-team-sheet scs-team-main-sheet"><header><strong>'+esc(title)+'</strong><button type="button" data-close aria-label="Close">✕</button></header>'+api.events.home({events,activeEventId,viewOnly})+'</div>'+api.navigation.bottom({active:'home',attribute:navAttribute,ariaLabel});
};
// One Home mounting path for Team, Knockout and Group. Keep the original
// host's tournament-specific logic separate from the shared Home presentation.
api.events.mountHome=function(root,options={}){
 if(!root)throw Error('Tournament Home host is required');
 root.classList.add('scs-api-home-host');
 root.innerHTML=api.events.homePage(options);
 return root;
};
api.events.leaveHome=function(root){root?.classList.remove('scs-api-home-host')};
api.events.eventForm=function({parentTitle=''}={}){
 return '<section class="scs-gt-card scs-team-main-create"><div class="scs-team-main-icon">🏸</div><h2>Add Event</h2><p>Create an event under <strong>'+esc(parentTitle)+'</strong>. Each event has its own matches and results.</p><label for="scs-event-name">Event Name</label><input id="scs-event-name" data-event-name type="text" maxlength="100" autocomplete="off" placeholder="e.g. Men’s Doubles" /><small data-event-error hidden>Please enter an event name.</small><div class="scs-team-main-actions"><button type="button" data-event-cancel>Cancel</button><button type="button" class="scs-gt-primary" data-event-create>Create Event →</button></div></section>';
};
api.events.requestEvent=function({parentTitle='',onCreate,onCancel}={}){
 const backdrop=document.createElement('div');backdrop.className='scs-gt-overlay scs-team-overlay';backdrop.style.zIndex='2147483000';
 backdrop.innerHTML='<div class="scs-gt-sheet scs-team-sheet scs-team-create-sheet" role="dialog" aria-label="Add Event"><header><strong>'+esc(parentTitle)+'</strong><button type="button" data-event-cancel aria-label="Close">✕</button></header>'+api.events.eventForm({parentTitle})+'</div>';
 document.body.appendChild(backdrop);const input=backdrop.querySelector('[data-event-name]');
 const cancel=()=>{backdrop.remove();onCancel?.()};backdrop.querySelectorAll('[data-event-cancel]').forEach(b=>b.onclick=cancel);
 const submit=()=>{const name=input.value.trim();if(!name){backdrop.querySelector('[data-event-error]').hidden=false;input.focus();return}backdrop.remove();onCreate?.(name)};
 backdrop.querySelector('[data-event-create]').onclick=submit;input.onkeydown=e=>{if(e.key==='Enter')submit()};setTimeout(()=>input.focus(),0);
};
api.events.home=function({events=[],activeEventId=null,viewOnly=false}={}){
 const countClubs=new Set(events.flatMap(e=>Array.isArray(e.clubs)?e.clubs:[]).filter(Boolean)).size;
 const eventGender=e=>/^L(?:-|\d|$)/i.test(String(e.title||'').trim())?'ladies':/^M(?:-|\d|$)/i.test(String(e.title||'').trim())?'men':'other';
 const section=(kind,title)=>{
  const items=events.filter(e=>eventGender(e)===kind);
  if(!items.length)return '';
  return '<section class="scs-team-event-section"><h2>'+esc(title)+' <span>('+items.length+')</span></h2><div class="scs-team-event-list">'+items.map(e=>{
   const clubs=Array.isArray(e.clubs)?e.clubs:[];
   const active=e.id===activeEventId;
   return '<button type="button" class="scs-team-event-row '+kind+(active?' is-active':'')+'" data-open-event="'+esc(e.id)+'"'+(active?' aria-label="Active Event: '+esc(e.title||'Event')+'"':'')+'><span class="scs-team-event-code">'+esc(e.title||'Event')+'</span><span class="scs-team-event-details"><strong>'+esc(clubs.join(', ')||'Clubs not selected')+'</strong><small>'+clubs.length+' teams · '+Number(e.completed||0)+' / '+Number(e.matches||0)+' matches completed</small>'+(active?'<span class="scs-team-event-active-label">✓ Active Event</span>':'')+'</span><span class="scs-team-event-arrow" aria-hidden="true">›</span></button>';
  }).join('')+'</div></section>';
 };
 return '<div class="scs-team-event-home"><p class="scs-team-event-summary">'+events.length+' events · '+countClubs+' teams</p>'+
  (events.length?section('men','Men’s Events')+section('ladies','Ladies’ Events')+section('other','Other Events'):'<p class="scs-team-event-empty">No events yet. Add an event to get started.</p>')+
  (viewOnly?'':api.buttons.render({label:'＋ Add Event',action:'add-event',className:'scs-gt-primary scs-team-add-event-bottom'}))+'</div>';
};
api.players=api.players||{};
async function pickRegisteredRoster(onDone, providers={}){
 const {registeredClubChoices,registeredClubPlayers,playerRow,hydratePlayerCards}=providers;
 if([registeredClubChoices,registeredClubPlayers,playerRow,hydratePlayerCards].some(f=>typeof f!=='function'))throw Error('Shared roster picker requires registered-club providers');
 const modal=document.createElement('section');modal.className='scs-tm-entry-modal';
 modal.innerHTML='<div class="scs-tm-entry-editor scs-team-club-editor"><div class="scs-team-club-scroll"><div class="scs-team-editor-head"><h3>Club players</h3><p>Select a registered sub-club and its players</p></div><label>Sub-club<select data-club><option value="">Select a sub-club</option></select></label><p data-status>Loading clubs…</p><div data-roster></div></div><div class="scs-tm-import-actions"><button type="button" data-cancel>Cancel</button><button type="button" class="scs-tm-primary" data-done>Done</button></div></div>';
 document.body.appendChild(modal);
 const sel=modal.querySelector('[data-club]'),status=modal.querySelector('[data-status]'),list=modal.querySelector('[data-roster]');let clubs=[],names=[];
 const close=()=>modal.remove();modal.querySelector('[data-cancel]').onclick=close;
 try{clubs=await registeredClubChoices();clubs.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;sel.appendChild(o)});status.textContent=clubs.length?'Choose a sub-club.':'No registered sub-clubs available.'}
 catch(e){status.textContent='Unable to load clubs: '+(e.message||e)}
 sel.onchange=async()=>{names=[];list.innerHTML='';if(!sel.value)return;status.textContent='Loading players…';try{const id=sel.value;const loaded=await registeredClubPlayers(id);if(sel.value!==id)return;names=loaded;status.textContent=names.length+' registered players';list.innerHTML=names.map(n=>'<label class="scs-gt-player scs-team-level-row" style="display:flex;align-items:center;gap:10px;padding:8px"><input type="checkbox" data-name="'+esc(n)+'"><span>'+playerRow(n)+'</span></label>').join('');hydratePlayerCards()}catch(e){status.textContent='Unable to load players: '+(e.message||e)}};
 modal.querySelector('[data-done]').onclick=()=>{const club=clubs.find(c=>c.id===sel.value);if(!club){status.textContent='Select a sub-club first.';return}const selected=[...list.querySelectorAll('input[data-name]:checked')].map(x=>x.dataset.name);if(!selected.length){status.textContent='Select at least one player.';return}close();onDone({clubId:club.id,clubName:club.name,players:selected})};
}
api.players.pickRegisteredRoster=pickRegisteredRoster;

// One tournament-wide player selector. Competition modules own pair/group rules.
api.players.select=async function({selected=[],onDone,onCancel}={}){
 const selectedMap=new Map((selected||[]).filter(p=>p&&p.player).map(p=>[String(p.subClubId||p.subClub||'')+'|'+String(p.playerId||p.player).toLowerCase(),p]));
 const modal=document.createElement('section');modal.className='scs-tm-entry-modal scs-api-player-selector';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
 modal.innerHTML='<div class="scs-tm-entry-editor scs-team-club-editor"><div class="scs-team-club-scroll"><div class="scs-team-editor-head"><h3>Tournament Players Manager</h3><p>Select players only from the selected main club’s sub-clubs</p></div><label>Sub-club<select data-subclub><option value="">Select a sub-club</option></select></label><p data-status role="status">Loading sub-clubs…</p><div data-players></div><h4 data-count>Selected players ('+selectedMap.size+')</h4></div><div class="scs-tm-import-actions"><button type="button" data-cancel>Cancel</button><button type="button" class="scs-tm-primary" data-done>Done</button></div></div>';
 // Mount inside the invoking tournament overlay so its existing modal CSS and
 // stacking context apply. In particular, Team Tournament has a high-z-index
 // overlay and a body-mounted selector would be hidden underneath it on iOS.
 const host=document.querySelector('#scsTeamTournament:not([hidden])') || document.activeElement?.closest?.('.scs-team-overlay, .scs-gt-overlay, .scs-tm-overlay') || document.body;
 host.appendChild(modal);
 const sel=modal.querySelector('[data-subclub]'),status=modal.querySelector('[data-status]'),list=modal.querySelector('[data-players]'),count=modal.querySelector('[data-count]');
 const finish=(value)=>{modal.remove();if(value===null){if(onCancel)onCancel();return null}if(onDone)onDone(value.map(p=>({playerId:p.playerId||null,player:p.player,subClubId:p.subClubId||null,subClub:p.subClub,gender:p.gender,level:p.level})));return value};
 modal.querySelector('[data-cancel]').onclick=()=>finish(null);
 const redrawCount=()=>count.textContent='Selected players ('+selectedMap.size+')';
 let clubs=[];
 const timed=(work)=>Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Request timed out. Check connection and try again.')),15000))]);
 try{const parent=await timed(()=>scsResolveOrganizerClub());clubs=await timed(()=>dbGetSubClubs(parent.id));clubs.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.name;sel.appendChild(o)});status.textContent=clubs.length?'Choose a sub-club to select players.':'No registered sub-clubs found.'}
 catch(e){status.textContent='Could not load sub-clubs: '+(e.message||e)}
 sel.onchange=async()=>{
  const id=sel.value;list.innerHTML='';if(!id)return;status.textContent='Loading players…';
  try{
   const memberships=await timed(()=>sbGet('memberships','club_id=eq.'+encodeURIComponent(id)+'&select=nickname,player_id'));
   const ids=[...new Set((memberships||[]).map(m=>m.player_id).filter(Boolean))];let info=new Map();
   if(ids.length){const rows=await timed(()=>sbGet('players','id=in.('+ids.map(encodeURIComponent).join(',')+')&select=id,gender,level'));info=new Map((rows||[]).map(p=>[String(p.id),p]))}
   if(sel.value!==id)return;
   const club=clubs.find(c=>String(c.id)===String(id));const subClub=club?.name||'';
   const players=(memberships||[]).filter(m=>m.nickname).map(m=>{
    const details=info.get(String(m.player_id))||{};
    const g=String(details.gender||'').toLowerCase();const gender=/^(f|female|woman|women|lady|ladies|l)$/.test(g)?'Female':/^(m|male|man|men)$/.test(g)?'Male':(details.gender||null);
    const n=Number(details.level);return {playerId:m.player_id||null,player:String(m.nickname).trim(),subClubId:id,subClub,gender,level:Number.isInteger(n)&&n>=1&&n<=5?n:null};
   });
   list.innerHTML='';players.forEach(p=>{
    const key=String(p.subClubId||p.subClub)+'|'+String(p.playerId||p.player).toLowerCase();const row=document.createElement('label');row.className='scs-gt-player scs-team-level-row scs-api-select-row';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=selectedMap.has(key)||selectedMap.has(p.subClub+'|'+p.player.toLowerCase());checkbox.onchange=()=>{if(checkbox.checked){selectedMap.delete(p.subClub+'|'+p.player.toLowerCase());selectedMap.set(key,p);}else {selectedMap.delete(key);selectedMap.delete(p.subClub+'|'+p.player.toLowerCase())}redrawCount()};
    const content=document.createElement('span');content.className='scs-api-select-content';
    content.innerHTML=api.cards.rosterPlayer({name:p.player,subClub:p.subClub,level:p.level,gender:p.gender,levelMarkup:'<span class="scs-tournament-gender-level">'+esc((p.gender==='Female'?'L':p.gender==='Male'?'M':'')+(p.level??'—'))+'</span>'});
    const slot=content.querySelector('.scs-tm-ring-slot');if(slot){slot.dataset.tmPlayerId=p.playerId||'';slot.dataset.tmSubclubId=p.subClubId||'';slot.dataset.tmGender=p.gender||'';slot.dataset.tmLevel=p.level??'';}
    row.append(checkbox,content);list.appendChild(row);
   });
   status.textContent=players.length+' registered players';
   if(window.SCSTournamentPlayerLevel)window.SCSTournamentPlayerLevel.hydrate(list);
  }catch(e){status.textContent='Could not load players: '+(e.message||e)}
 };
 modal.querySelector('[data-done]').onclick=()=>finish([...selectedMap.values()]);
 return modal;
};

api.matchCenter=api.matchCenter||{};
})();
