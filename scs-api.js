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
api.matchCenter=api.matchCenter||{};
})();
