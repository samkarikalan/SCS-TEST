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
api.buttons.render=function({label='',action='',className='',disabled=false}={}){
 return '<button type="button"'+(action?' data-'+esc(action):'')+(className?' class="'+esc(className)+'"':'')+(disabled?' disabled':'')+'>'+esc(label)+'</button>';
};
api.navigation.bottom=function({active='home',attribute='data-team-nav',ariaLabel='Tournament sections'}={}){
 const items=[['home','Home','⌂'],['clubs','Clubs','♙'],['tournament','Tournament','⑂'],['match','Match Center','▣']];
 return '<nav class="scs-tm-organized-tabs scs-tm-bottom-nav scs-gt-bottom-nav scs-team-bottom-nav" aria-label="'+esc(ariaLabel)+'">'+items.map(([key,label,icon])=>'<button type="button" '+esc(attribute)+'="'+key+'" class="'+(active===key?'active':'')+'"'+(active===key?' aria-current="page"':'')+'><span class="scs-tm-nav-icon" aria-hidden="true">'+icon+'</span><span class="scs-tm-nav-label">'+label+'</span></button>').join('')+'</nav>';
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
api.matchCenter=api.matchCenter||{};
})();
