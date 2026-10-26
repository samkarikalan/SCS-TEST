/* V37: editable OCR entries and player/club parsing; input-driven knockout draw. OCR reads text; the organizer confirms teams and connections. */
(function(){'use strict';
var assistStep=0,assistSaved=false,draw=null,readonly=false,selected=null,saveFn=null,assignFn=null,clearFn=null,root=null,scanImage=null,scanText='',scanBusy=false,scanRecognition=null,zoom=1,panX=0,panY=0,gesture=null,byeSelection=null,lastLiveRenderSignature='';
var LOCAL_TOURNAMENT_KEY='scs_knockout_tournament_v94';
/* V291: one parent knockout tournament with independent event draws. The original
   knockout generator, bracket and match center remain the event implementation. */
var KO_MAIN_KEY='scs_knockout_multi_event_v1',koMain=null,koActiveId=null,koHome=false;
function koId(){return 'ko-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)}
function koReadMain(){try{return JSON.parse(localStorage.getItem(KO_MAIN_KEY)||'null')}catch(_){return null}}
function koSaveMain(){
 if(!koMain||readonly)return;
 koMain._scsMainTournament=true;
 koMain._scsClientTournamentId=koMain._scsClientTournamentId||koMain.id;
 localStorage.setItem(KO_MAIN_KEY,JSON.stringify(koMain));
 if(typeof window.scsQueueTournamentCloudSave==='function')window.SCSTournamentStore.queue('knockout',koMain);
}
function koEventKey(id){return 'scs_knockout_event_'+id}
function koDraftKey(){return ASSIST_DRAFT_KEY+(koActiveId?'-'+koActiveId:'')}
// Preserve each team member's registered identity in the saved event state.
// Entry labels alone are insufficient to restore level, gender and sub-club.
function preserveTeamPlayerDetails(d){
 // Saved player metadata is authoritative: never rebuild it from team labels.
 if(!d||!Array.isArray(d.entries))return d;
 var roster=Array.isArray(d.selectedPlayerDetails)?d.selectedPlayerDetails.slice():[];
 var keyOf=function(p){return String(p&&(p.playerId||p.id)||'')+'|'+String(p&&(p.player||p.name)||'').trim().toLocaleLowerCase()+'|'+String(p&&(p.subClubId||p.subClub)||'')};
 var known=new Set(roster.map(keyOf));
 d.entries.forEach(function(entry){
  if(!Array.isArray(entry.playerDetails))return;
  entry.playerDetails.forEach(function(p){
   if(!p||typeof p!=='object'||!(p.level!=null||p.subClub||p.subClubId||p.playerId))return;
   var key=keyOf(p);
   if(!known.has(key)){roster.push(p);known.add(key)}
  });
 });
 if(roster.length)d.selectedPlayerDetails=roster;
 return d;
}
function koEventLoad(id){try{return preserveTeamPlayerDetails(JSON.parse(localStorage.getItem(koEventKey(id))||'null'))}catch(_){return null}}
function koSyncEvent(d){preserveTeamPlayerDetails(d);if(!koMain||!koActiveId||readonly)return;var item=koMain.events.find(function(e){return e.id===koActiveId});if(!item)return;item.title=d.title||item.title;item.matches=(d.matches||[]).length;item.completed=Object.keys(d.results||{}).length;item.teams=(d.entries||[]).length;item.updatedAt=Date.now();koMain.activeEventId=koActiveId;koSaveMain();localStorage.setItem(koEventKey(koActiveId),JSON.stringify(d))}
function localTournamentLoad(){try{if(koMain&&koActiveId){var event=koEventLoad(koActiveId);if(event)return event}var x=JSON.parse(localStorage.getItem(LOCAL_TOURNAMENT_KEY)||'null');return x&&x.matches&&x.matches.length?preserveTeamPlayerDetails(x):null}catch(_){return null}}
function localTournamentSave(d){try{preserveTeamPlayerDetails(d);if(d&&d._scsGroupEventId!=null&&d._scsGroupKnockoutStage!=null)localStorage.setItem('scs_group_knockout_'+d._scsGroupEventId+'_'+d._scsGroupKnockoutStage,JSON.stringify(d));if(readonly)return Promise.resolve(d);koSyncEvent(d);if(koMain){d._scsKoMainId=koMain.id;d._scsKoMainTitle=koMain.title;d._scsKoEventId=koActiveId;d._scsParentTournamentId=koMain._scsClientTournamentId||koMain.id;d._scsParentTournamentTitle=koMain.title;}if(!koMain)localStorage.setItem(LOCAL_TOURNAMENT_KEY,JSON.stringify(d));if(typeof window.scsQueueTournamentCloudSave==='function')window.SCSTournamentStore.queue('knockout',d);return Promise.resolve(d)}catch(e){return Promise.reject(e)}}
async function koSaveCloudNow(d){
 preserveTeamPlayerDetails(d);
 if(typeof window.dbSaveTournamentState!=='function')return;
 if(koMain&&koActiveId){d._scsKoMainId=koMain.id;d._scsKoMainTitle=koMain.title;d._scsKoEventId=koActiveId;d._scsParentTournamentId=koMain._scsClientTournamentId||koMain.id;d._scsParentTournamentTitle=koMain.title;}
 var id=await window.SCSTournamentStore.save('knockout',d);
 if(id&&koMain&&koActiveId)koSyncEvent(d);
 return id;
}
let koManualSaveBusy=false;
async function koSaveProgressNow(){
 if(readonly||!draw||koManualSaveBusy)return;
 const button=root?.querySelector('[data-ko-save-progress]');
 const indicator=root?.querySelector('[data-ko-save-progress-status]');
 koManualSaveBusy=true;if(button)button.disabled=true;
 if(indicator)indicator.textContent='Saving…';
 try{
  if(window.SCSCourtCenter?.tournamentGame&&Array.isArray(draw.matches))draw.matches.forEach(m=>koCaptureMatchScore(m.id,SCSCourtCenter.tournamentGame(m.id)));
  await localTournamentSave(draw);
  const id=await koSaveCloudNow(draw);
  if(!id)throw Error('Server did not confirm save; local copy retained.');
  if(indicator)indicator.textContent='✓ Saved to server';
 }catch(e){if(indicator)indicator.textContent='⚠ '+(e.message||'Server save failed; local copy retained.');}
 finally{koManualSaveBusy=false;if(button)button.disabled=false;}
}
function koAdoptCloudEvent(state){
 preserveTeamPlayerDetails(state);
 if(!state||!state.matches)return false;
 koMainStart();
 var id=state._scsClientTournamentId||state._scsCloudTournamentId||koId();
 var event=koMain.events.find(function(e){return e.id===id});
 if(!event){event={id:id,title:state.title||'Knockout Event',teams:0,matches:0,completed:0};koMain.events.push(event)}
 koActiveId=id;koMain.activeEventId=id;koSaveMain();koSyncEvent(state);
 return true;
}
function koAdoptCloudMaster(state,eventStates){
 if(!state||!state._scsMainTournament)return false;
 koMain=JSON.parse(JSON.stringify(state));
 if(!Array.isArray(koMain.events))koMain.events=[];
 var allowed=new Set(koMain.events.map(function(event){return String(event.id)}));
 (Array.isArray(eventStates)?eventStates:[]).forEach(function(eventState){
  var id=String(eventState&&((eventState._scsKoEventId||eventState._scsClientTournamentId))||'');
  if(id&&allowed.has(id))localStorage.setItem(koEventKey(id),JSON.stringify(preserveTeamPlayerDetails(eventState)));
 });
 localStorage.setItem(KO_MAIN_KEY,JSON.stringify(koMain));
 koActiveId=allowed.has(String(koMain.activeEventId||''))?koMain.activeEventId:(koMain.events[0]&&koMain.events[0].id)||null;
 koMain.activeEventId=koActiveId;
 return true;
}
function localTournamentClear(){try{if(koMain&&koActiveId)localStorage.removeItem(koEventKey(koActiveId));else localStorage.removeItem(LOCAL_TOURNAMENT_KEY)}catch(_){ }return Promise.resolve()}
function koMainStart(){koMain=koReadMain();if(!koMain){var legacy=null;try{legacy=JSON.parse(localStorage.getItem(LOCAL_TOURNAMENT_KEY)||'null')}catch(_){}koMain={id:koId(),title:legacy&&legacy.title||'Knockout Tournament',events:[],activeEventId:null};if(legacy&&legacy.matches&&legacy.matches.length){var id=koId();koMain.events.push({id:id,title:legacy.title||'Knockout Event',matches:legacy.matches.length,completed:Object.keys(legacy.results||{}).length,teams:(legacy.entries||[]).length});koMain.activeEventId=id;localStorage.setItem(koEventKey(id),JSON.stringify(legacy))}koSaveMain()}if(!Array.isArray(koMain.events))koMain.events=[];koActiveId=koMain.events.some(function(e){return e.id===koMain.activeEventId})?koMain.activeEventId:(koMain.events[0]&&koMain.events[0].id)||null;koMain.activeEventId=koActiveId;koSaveMain()}
function koHomeRender(){
 if(!root)return;
 koHome=true;tournamentActiveTab='main';
 var events=(koMain.events||[]).map(function(e){return Object.assign({},e,{clubs:e.clubs||Array.from({length:Number(e.teams)||0},function(_,i){return 'Team '+(i+1)})})});
 window.ScsApi.events.mountHome(root,{title:koMain.title||'Knockout Tournament',events:events,activeEventId:koActiveId,viewOnly:readonly,navAttribute:'data-ko-nav',ariaLabel:'Knockout tournament sections'});
 root.querySelector('[data-close]').onclick=close;
 root.querySelectorAll('[data-open-event]').forEach(function(b){b.onclick=function(){koOpenEvent(b.dataset.openEvent,'flowchart')}});
 var add=root.querySelector('[data-add-event]');if(add)add.onclick=koAddEvent;
 var rename=root.querySelector('[data-ko-rename]');if(rename)rename.onclick=koRename;
 if(!readonly){
  root.querySelectorAll('[data-open-event]').forEach(function(b){
   var id=b.dataset.openEvent, item=koMain.events.find(function(e){return e.id===id});
   if(!item)return;
   // Per-event actions: do not append to a shared section containing multiple events.
   var card=document.createElement('div');card.className='scs-ko-event-item';
   b.parentNode.insertBefore(card,b);card.appendChild(b);
   var actions=document.createElement('div');actions.className='scs-ko-event-actions';
   var assist=document.createElement('button');assist.type='button';assist.className='scs-ko-event-assist';
   assist.dataset.koEventAssist=id;assist.textContent='Assist';
   assist.setAttribute('aria-label','Open '+(item.title||'event')+' Knockout Assist');
   assist.onclick=function(ev){ev.preventDefault();ev.stopPropagation();koOpenSavedAssist(id)};
   var del=document.createElement('button');del.type='button';del.className='scs-ko-delete-button scs-ko-delete-event';
   del.textContent='Delete';del.dataset.koDeleteEvent=id;
   del.setAttribute('aria-label','Delete '+(item.title||'event'));
   del.onclick=function(ev){ev.preventDefault();ev.stopPropagation();koDeleteLeague(id)};
   actions.appendChild(assist);actions.appendChild(del);card.appendChild(actions);
  });
 }
 root.querySelectorAll('[data-ko-nav]').forEach(function(b){if(b.dataset.koNav==='clubs'){var label=b.querySelector('.scs-tm-nav-label');if(label)label.textContent='Teams';}b.onclick=function(){var t=b.dataset.koNav;if(t==='home')koHomeRender();else if(koActiveId)koOpenEvent(koActiveId,t==='clubs'?'players':t==='match'?'match':'flowchart');else alert('Add an event first.')}});
}
// Visibility is unconditional; editability is based on whether play has begun.
function koAssistAvailable(id){return !!(!readonly&&koMain&&koMain.events.some(function(e){return e.id===id}));}
function koAssistHasStarted(state){
 if(!state)return false;
 if(state.live===true||state.started===true||Object.keys(state.results||{}).length)return true;
 if(Array.isArray(state.matchCenterQueue)&&state.matchCenterQueue.some(function(m){return !!(m.started_at||m.start_time||['scoring','scored','completed','complete','under_approval','approval'].includes(String(m.score_status||m.status||'').toLowerCase()))}))return true;
 if(window.SCSCourtCenter&&typeof window.SCSCourtCenter.tournamentGame==='function'&&Array.isArray(state.matches)){
  for(var m of state.matches){var game=window.SCSCourtCenter.tournamentGame(m.id);if(game&&(game.started_at||game.start_time||['scoring','scored','completed','complete'].includes(String(game.score_status||'').toLowerCase())))return true;}
 }
 return false;
}
function koOpenSavedAssist(id){
 if(!koAssistAvailable(id))return;
 var saved=koEventLoad(id);
 var locked=koAssistHasStarted(saved);
 koOpenEvent(id,'flowchart');
 if(locked){
  // Preserve played matches and bracket progression: view the saved pattern only.
  var note=document.createElement('div');note.className='scs-ko-assist-locked-note';note.setAttribute('role','status');
  note.textContent='Assist · View only — matches have started. Pattern and BYE positions are locked.';
  note.style.cssText='padding:12px 16px;margin:8px 12px;border:1px solid #7894ba;border-radius:12px;background:#203550;color:#e2efff';
  root.insertBefore(note,root.firstChild);
  return;
 }
 // Restore the saved event and reopen the wizard without rebuilding the bracket.
 assistSaved=false;assistStep=0;byeSelection=null;selected=null;swapEntryId=null;
 creationScreenPinned=false;assistIndex();ensureAssistHeader();
}
function koEventRows(events,gender){if(!events.length)return '<p class="scs-ko-empty">No events</p>';return events.map(function(e){var active=e.id===koActiveId;return '<button type="button" class="scs-ko-event-row'+(active?' active':'')+'" onclick="SCSTournament.selectKnockoutEvent(\''+esc(e.id)+'\')"><span class="scs-ko-event-code '+gender+'">'+esc(e.title)+'</span><span class="scs-ko-event-detail"><strong>'+esc(e.title)+'</strong><small>'+(e.teams||0)+' teams · '+(e.completed||0)+'/'+(e.matches||0)+' matches completed</small>'+(active?'<em>✓ Active Event</em>':'')+'</span><span>›</span></button>'}).join('')}
function koOpenEvent(id,tab){if(!koMain||!koMain.events.some(function(e){return e.id===id}))return;koActiveId=id;koMain.activeEventId=id;koSaveMain();koHome=false;window.ScsApi.events.leaveHome(root);var saved=koEventLoad(id);tournamentActiveTab=tab||'flowchart';assistStep=0;assistSaved=!!(saved&&(saved.assistFinalized||(saved.matches&&saved.matches.length)));draw=saved||restoreAssistDraft()||init();assistAssignmentsConfirmed=!!(draw.assistAssignmentsConfirmed||assistAssignmentsConfirmed);draw.assistAssignmentsConfirmed=assistAssignmentsConfirmed;if(!draw.title)draw.title=koMain.events.find(function(e){return e.id===id}).title;creationScreenPinned=!saved||!saved.matches||!saved.matches.length;bracketViewInitialized=false;bracketScrollState=null;readonly=false;saveFn=localTournamentSave;clearFn=localTournamentClear;selected=null;ensure();render();observeAssistHeader();koResumeOpenedEvent(id,saved)}
function koRename(){if(!koMain)return;var name=prompt('Tournament name',koMain.title||'Knockout Tournament');if(name===null)return;name=name.trim();if(!name)return;koMain.title=name;koSaveMain();koHomeRender()}
function koAddEvent(){if(!koMain)koMainStart();window.ScsApi.events.requestEvent({parentTitle:koMain.title,onCreate:function(name){if(koMain.events.some(function(e){return e.title.toLowerCase()===name.toLowerCase()})){alert('This event already exists.');return}var id=koId();koMain.events.push({id:id,title:name,teams:0,matches:0,completed:0});koSaveMain();koOpenEvent(id,'players')}})}
async function koDeleteCloudRecord(state){
 var id=state&&state._scsCloudTournamentId;
 if(!id)return;
 if(typeof window.dbDeleteTournamentById!=='function')throw new Error('Server delete function unavailable. No local data was deleted.');
 var ok=await window.dbDeleteTournamentById(id);
 if(!ok)throw new Error('Server did not confirm deletion.');
}
async function koDeleteLeague(eventId){
 if(readonly||!koMain)return;
 var item=koMain.events.find(function(e){return e.id===(eventId||koActiveId)});if(!item)return;
 if(!confirm('Delete league "'+item.title+'" and its matches? Other leagues will remain. This cannot be undone.'))return;
 var state=koEventLoad(item.id);
 try{await koDeleteCloudRecord(state)}catch(e){alert(e.message||'Server deletion failed.');return}
 localStorage.removeItem(koEventKey(item.id));localStorage.removeItem(ASSIST_DRAFT_KEY+'-'+item.id);
 koMain.events=koMain.events.filter(function(e){return e.id!==item.id});
 koActiveId=(koMain.events[0]&&koMain.events[0].id)||null;koMain.activeEventId=koActiveId;koSaveMain();koHomeRender();
}
async function koDeleteMain(){
 if(readonly||!koMain)return;
 if(!confirm('Delete the entire tournament "'+koMain.title+'" and ALL its leagues? This cannot be undone.'))return;
 var items=koMain.events.slice();
 try{for(var i=0;i<items.length;i++)await koDeleteCloudRecord(koEventLoad(items[i].id));
 await koDeleteCloudRecord(koMain)}catch(e){alert('Deletion stopped: '+(e.message||'Server error')+'. Refresh before retrying.');return}
 items.forEach(function(item){localStorage.removeItem(koEventKey(item.id));localStorage.removeItem(ASSIST_DRAFT_KEY+'-'+item.id)});
 localStorage.removeItem(KO_MAIN_KEY);koMain=null;koActiveId=null;
 if(typeof window.scsReturnToTournamentParent==='function')window.scsReturnToTournamentParent();else close();
}
function koShowHome(){if(!root){root=document.getElementById('scsTournamentOverlay')}if(!koMain)koMainStart();root.hidden=false;koHomeRender()}

function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function nextPow2(n){var p=1;while(p<n)p*=2;return p}
function prevPow2(n){var p=1;while(p*2<=n)p*=2;return p}
function firstRoundByeNeed(n){n=Number(n)||0;if(n<2)return 0;var lo=prevPow2(n),hi=nextPow2(n);return Math.max(0,Math.min(n-lo,hi-n))}
function automaticByeIds(entryIds){
  /* V94 structural BYE placement: build complete Round-1 pairs first, then
     place BYE slots at branch boundaries. A BYE is never inserted between
     the two teams of a Round-1 match. This is the bracket knowledge used by
     the generator, not a visual spacing rule. */
  var n=entryIds.length,b=firstRoundByeNeed(n);if(!b)return [];
  var playing=n-b,pairs=playing/2,out=[];
  if(!Number.isInteger(pairs))throw Error('Could not build valid Round 1 for '+n+' teams.');
  /* Split the Round-1 pairs as evenly as possible across the BYE branches.
     Each selected position is immediately after its branch's complete pairs.
     Examples: 5 -> [5], 6 -> [3,6], 7 -> [7]. */
  var consumed=0,base=Math.floor(pairs/b),extra=pairs%b;
  for(var i=0;i<b;i++){
    var branchPairs=base+(i<extra?1:0);
    consumed+=branchPairs*2;
    var pos=Math.min(n-1,consumed+i);
    out.push(Number(entryIds[pos]));
  }
  return out;
}

/* V94: bracket-page BYE selection. A valid set must leave only adjacent
   Round-1 pairs. This prevents a BYE from splitting an impossible first-round
   pairing. The search returns one valid completion containing the user's
   current selections, so impossible positions can be disabled immediately. */
function completeValidByeSet(entryIds,required,selectedIds){
  /* V94: validate BYEs against the balanced top/bottom structure.  Each side
     is divided into two branches whose team counts differ by at most one.
     The required BYEs are distributed to those branches before Round 1 is
     built, so a user cannot select a BYE combination that makes one main
     branch deeper than the other.  Inside each branch, Round-1 players must
     remain adjacent pairs. */
  var ids=entryIds.map(Number),selected=(selectedIds||[]).map(Number);
  if(selected.length>required)return null;
  function adjacentCompletion(group,need,forced){
    var force=new Set(forced),memo={};
    function walk(i,left,out){
      var key=i+'|'+left+'|'+out.join(',');if(memo[key]===false)return null;
      if(i>=group.length)return left===0?out.slice():null;
      var id=group[i];
      if(force.has(id)){if(left<=0){memo[key]=false;return null}out.push(id);var a=walk(i+1,left-1,out);out.pop();if(a)return a;memo[key]=false;return null}
      if(i+1<group.length&&!force.has(group[i+1])){var a=walk(i+2,left,out);if(a)return a}
      if(left>0){out.push(id);var b=walk(i+1,left-1,out);out.pop();if(b)return b}
      memo[key]=false;return null;
    }
    return walk(0,need,[]);
  }
  if(ids.length<4)return adjacentCompletion(ids,required,selected);
  var topCount=Math.ceil(ids.length/2),top=ids.slice(0,topCount),bottom=ids.slice(topCount);
  var topNeed=firstRoundByeNeed(top.length),bottomNeed=firstRoundByeNeed(bottom.length);
  if(topNeed+bottomNeed!==required)return adjacentCompletion(ids,required,selected);
  var topForced=selected.filter(function(id){return top.indexOf(id)>=0}),bottomForced=selected.filter(function(id){return bottom.indexOf(id)>=0});
  if(topForced.length>topNeed||bottomForced.length>bottomNeed)return null;
  var a=adjacentCompletion(top,topNeed,topForced),b=adjacentCompletion(bottom,bottomNeed,bottomForced);
  return a&&b?a.concat(b):null;
}
function enumerateAdjacentByeSets(group,need,limit){
  var out=[],cap=limit||5000;
  function walk(i,left,chosen){
    if(out.length>=cap)return;
    if(i>=group.length){if(left===0)out.push(chosen.slice());return}
    if(i+1<group.length)walk(i+2,left,chosen); /* these two play Round 1 */
    if(left>0){chosen.push(Number(group[i]));walk(i+1,left-1,chosen);chosen.pop()}
  }
  walk(0,need,[]);return out;
}
function balancedSideSplits(ids,required){
  /* V94: an odd side has TWO equally balanced orientations: e.g. 9 teams can
     be Top 5 / Bottom 4 OR Top 4 / Bottom 5.  Both must be available. */
  var cuts=[Math.ceil(ids.length/2)];
  if(ids.length%2)cuts.push(Math.floor(ids.length/2));
  return cuts.map(function(cut){
    var top=ids.slice(0,cut),bottom=ids.slice(cut),topNeed=firstRoundByeNeed(top.length),bottomNeed=firstRoundByeNeed(bottom.length);
    return {cut:cut,top:top,bottom:bottom,topNeed:topNeed,bottomNeed:bottomNeed,valid:topNeed+bottomNeed===required};
  }).filter(function(x){return x.valid});
}
function allValidByeSets(entryIds,required,limit){
  /* V94: a pattern includes BOTH its BYE positions and its balanced top/bottom
     orientation.  For odd sides the same BYE ID can be valid in Top-heavy and
     Bottom-heavy layouts; those are different bracket patterns and must not be
     deduplicated. */
  var ids=entryIds.map(Number),cap=limit||5000;if(!required)return [{byes:[],cut:Math.ceil(ids.length/2)}];
  if(ids.length<4)return enumerateAdjacentByeSets(ids,required,cap).map(function(x){return {byes:x,cut:ids.length}});
  var splits=balancedSideSplits(ids,required),out=[];
  if(!splits.length)return enumerateAdjacentByeSets(ids,required,cap).map(function(x){return {byes:x,cut:Math.ceil(ids.length/2)}});
  splits.forEach(function(sp){
    if(out.length>=cap)return;
    var a=enumerateAdjacentByeSets(sp.top,sp.topNeed,cap),b=enumerateAdjacentByeSets(sp.bottom,sp.bottomNeed,cap),seen={};
    for(var i=0;i<a.length&&out.length<cap;i++)for(var j=0;j<b.length&&out.length<cap;j++){
      var byes=a[i].concat(b[j]),key=byes.slice().sort(function(x,y){return x-y}).join(',');
      if(!seen[key]){seen[key]=true;out.push({byes:byes,cut:sp.cut})}
    }
  });
  return out;
}
function buildByePatterns(leftIds,rightIds,needLeft,needRight){
  var lp=allValidByeSets(leftIds,needLeft,5000),rp=allValidByeSets(rightIds,needRight,5000);
  return {left:lp,right:rp};
}
function byePatternCount(){
  if(!byeSelection)return 0;
  return byeSelection.patternMode==='right'?byeSelection.rightPatterns.length:byeSelection.leftPatterns.length;
}
function byePatternNumber(){
  if(!byeSelection)return 0;
  return byeSelection.patternMode==='right'?byeSelection.rightIndex+1:byeSelection.leftIndex+1;
}
function applyCurrentByePattern(){
  if(!byeSelection)return;
  var lp=byeSelection.leftPatterns[byeSelection.leftIndex]||{byes:[],cut:null},rp=byeSelection.rightPatterns[byeSelection.rightIndex]||{byes:[],cut:null};
  byeSelection.leftSelected=(lp.byes||[]).slice(); byeSelection.leftCut=lp.cut;
  byeSelection.rightSelected=(rp.byes||[]).slice(); byeSelection.rightCut=rp.cut;
  previewByeSelection();
}
function setByePatternMode(mode){
  if(!byeSelection||['left','right'].indexOf(mode)<0)return;
  byeSelection.patternMode=mode;render();
}
function nextByePattern(delta){
  if(!byeSelection)return;
  delta=Number(delta||0);
  var ln=byeSelection.leftPatterns.length,rn=byeSelection.rightPatterns.length;
  if(byeSelection.patternMode==='right')byeSelection.rightIndex=(byeSelection.rightIndex+delta+rn)%rn;
  else byeSelection.leftIndex=(byeSelection.leftIndex+delta+ln)%ln;
  applyCurrentByePattern();
}
function byeSelectionSide(id){if(!byeSelection)return null;return Number(id)<=byeSelection.leftCount?'left':'right'}
function selectedByeIds(){return byeSelection?byeSelection.leftSelected.concat(byeSelection.rightSelected):[]}
function previewByeSelection(){
  if(!byeSelection)return;
  var n=byeSelection.total,l=byeSelection.leftCount,leftIds=Array.from({length:l},function(_,i){return i+1}),rightIds=Array.from({length:n-l},function(_,i){return l+i+1});
  /* V94: slider patterns are already complete, validated BYE sets. Do NOT run
     them back through completeValidByeSet(), because that helper assumes the
     default ceil(top)/floor(bottom) split and rejects the mirrored odd-side
     floor(top)/ceil(bottom) orientation. That was why patterns 3/4 and 4/4
     could be counted but would not actually change the bracket. */
  var leftFull=(byeSelection.leftSelected||[]).map(Number).slice(),rightFull=(byeSelection.rightSelected||[]).map(Number).slice();
  if(leftFull.length!==byeSelection.needLeft||rightFull.length!==byeSelection.needRight)return false;
  var names=byeSelection.names;
  // Preview is not an identity edit. Preserve the original roster and each
  // team's complete player records before replacing the bracket geometry.
  var original=byeSelection.sourceDraw||draw;
  var next=generateCustomTwoSided(n,l,leftFull,rightFull,byeSelection.title,names,byeSelection.leftCut,byeSelection.rightCut);
  if(original){
    var originals=Array.isArray(original.entries)?original.entries:[];
    next.entries=next.entries.map(function(entry,i){
      var prev=originals.find(function(e){return Number(e.id)===Number(entry.id)})||originals[i];
      return prev?Object.assign({},prev,{id:entry.id}):entry;
    });
    ['selectedPlayerDetails','selectedClubIds','selectedClubs','clubId','mainClubId','playerPool','allPlayers'].forEach(function(k){
      if(original[k]!==undefined)next[k]=JSON.parse(JSON.stringify(original[k]));
    });
  }
  preserveTeamPlayerDetails(next);
  draw=next;
  draw.byePreview=true;draw.previewSelectedByeIds=selectedByeIds();draw.previewAutoByeIds=leftFull.concat(rightFull).filter(function(id){return draw.previewSelectedByeIds.indexOf(id)<0});
  render();return true;
}
function byePathMatchIds(){
  var ids=new Set(),front=[];selectedByeIds().forEach(function(entry){draw.matches.forEach(function(m){if(m.a===entry||m.b===entry){ids.add(Number(m.id));front.push(Number(m.id))}})});
  while(front.length){var x=front.shift();draw.matches.forEach(function(m){if(m.a==='W'+x||m.b==='W'+x){if(!ids.has(Number(m.id))){ids.add(Number(m.id));front.push(Number(m.id))}}})}
  return ids;
}
function generate(names,title,third){names=names.map(function(x){return String(x).trim()}).filter(Boolean);if(names.length<2)throw Error('Enter at least two teams.');names=names.map(normalizeTeam);var n=nextPow2(names.length),byes=n-names.length,slots=[],i;/* Place byes as empty first-round slots, not phantom matches. */
for(i=0;i<names.length;i++)slots.push(i+1);for(i=0;i<byes;i++)slots.push(null);
var matches=[],next=1,layer=slots,round=1;while(layer.length>1){var output=[];for(i=0;i<layer.length;i+=2){var a=layer[i],b=layer[i+1];if(a==null){output.push(b);continue}if(b==null){output.push(a);continue}var id=next++;matches.push({id:id,round:round,a:a,b:b});output.push('W'+id)}layer=output;round++}if(third){var semis=matches.filter(function(m){return m.round===round-2});if(semis.length===2)matches.push({id:next++,round:round-1,a:'L'+semis[0].id,b:'L'+semis[1].id,third:true})}return {layout:'ltr',title:title||'Tournament',entries:names.map(function(name,i){return{id:i+1,name:name}}),matches:matches,results:{}}}
function cleanOCR(text){return String(text||'').split(/\r?\n/).map(function(s){return s.trim()}).filter(function(s){return s&&!/^(?:Mix[-－]?\d+|Entry\s*\d+|\d+|\([^)]*\)|（[^）]*）)$/i.test(s)&&!/^(?:round|match|court)\s*\d+/i.test(s)}).map(function(s){return s.replace(/^\d+\s+(?=[^\d])/, '').trim()}).filter(Boolean)}
function splitTeam(text){var s=String(text||'').trim(),club='',m=s.match(/\s*[（(]([^（）()]*)[）)]\s*$/);if(m){club=m[1].trim();s=s.slice(0,m.index).trim()}var players=s.split(/\s*(?:\/|／|・|･|·|•)\s*/).map(function(x){return x.trim()}).filter(Boolean);return {players:players,club:club,raw:s}}
function normalizeTeam(text){var team=splitTeam(text);return team.players.join(' / ')+(team.club?' ('+team.club+')':'')}

function init(){return {layout:'ltr',title:'',entries:[],matches:[],results:{}}}


/* V94: image recognition is intentionally narrow. It extracts only the four
   inputs already understood by the manual generator: Total, Left, Right and
   structural BYE positions. It does not build a second bracket topology. */
function analyzeBracketImage(src){
  return new Promise(function(resolve,reject){
    var img=new Image();
    img.onload=function(){
      try{
        var scale=Math.min(1,1200/img.naturalWidth),w=Math.max(1,Math.round(img.naturalWidth*scale)),h=Math.max(1,Math.round(img.naturalHeight*scale));
        var c=document.createElement('canvas');c.width=w;c.height=h;var ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);
        var d=ctx.getImageData(0,0,w,h).data,ink=new Uint8Array(w*h),x,y,i;
        for(y=0;y<h;y++)for(x=0;x<w;x++){i=(y*w+x)*4;var lum=(d[i]*299+d[i+1]*587+d[i+2]*114)/1000;ink[y*w+x]=(lum<105&&d[i+3]>100)?1:0}
        /* Locate the useful page/bracket area. Wide black phone bars and borders
           are rejected later because an entry line must be a finite horizontal run. */
        var minRun=Math.max(24,Math.round(w*.045)),maxRun=Math.round(w*.28),runs=[];
        for(y=Math.round(h*.06);y<Math.round(h*.91);y++){
          x=Math.round(w*.12);
          while(x<Math.round(w*.88)){
            while(x<w*.88&&!ink[y*w+x])x++;var a=x;
            while(x<w*.88&&ink[y*w+x])x++;var b=x-1,len=b-a+1;
            if(len>=minRun&&len<=maxRun)runs.push({y:y,a:a,b:b,len:len,mid:(a+b)/2});
          }
        }
        /* Merge the same printed line detected on adjacent pixel rows. */
        runs.sort(function(a,b){return a.y-b.y});var merged=[];
        runs.forEach(function(r){var q=merged[merged.length-1];if(q&&r.y-q.y<=3&&Math.abs(r.a-q.a)<8&&Math.abs(r.b-q.b)<8){q.y=(q.y+r.y)/2;q.a=(q.a+r.a)/2;q.b=(q.b+r.b)/2;q.len=Math.max(q.len,r.len);q.mid=(q.a+q.b)/2;q.rows=(q.rows||1)+1}else merged.push({y:r.y,a:r.a,b:r.b,len:r.len,mid:r.mid,rows:1})});
        merged=merged.filter(function(r){return r.rows>=1&&r.y<h*.86});
        /* Estimate the bracket centre from horizontal geometry rather than text. */
        var center=w/2;
        var left=merged.filter(function(r){return r.mid<center*.98&&r.b> w*.25&&r.b<center*.98});
        var right=merged.filter(function(r){return r.mid>center*1.02&&r.a<w*.75&&r.a>center*1.02});
        function terminalLines(list,side){
          if(!list.length)return [];
          /* Entry stubs are among the longest repeated horizontal runs on a side. */
          var lens=list.map(function(r){return r.len}).sort(function(a,b){return a-b}),cut=lens[Math.max(0,Math.floor(lens.length*.55))];
          var a=list.filter(function(r){return r.len>=Math.max(minRun,cut*.82)}).sort(function(x,y){return x.y-y.y});
          /* De-duplicate nearby y levels. */
          var out=[];a.forEach(function(r){var q=out[out.length-1];if(q&&Math.abs(r.y-q.y)<Math.max(7,h*.008)){if(r.len>q.len)out[out.length-1]=r}else out.push(r)});
          /* Reject isolated footer/third-place lines using the median side x endpoint. */
          if(out.length>2){var ep=out.map(function(r){return side==='left'?r.b:r.a}).sort(function(a,b){return a-b}),med=ep[Math.floor(ep.length/2)],tol=Math.max(18,w*.045);out=out.filter(function(r){return Math.abs((side==='left'?r.b:r.a)-med)<tol||r.y<h*.72})}
          return out;
        }
        left=terminalLines(left,'left');right=terminalLines(right,'right');
        if(left.length<2||right.length<2||left.length+right.length<4)throw Error('Could not confidently detect bracket entries.');
        function byePositions(lines,side,offset){
          var need=firstRoundByeNeed(lines.length);if(!need)return [];
          /* Round-1 opponents share the same inward vertical x. A source whose
             inward x is not shared by another entry line bypasses Round 1. */
          var tol=Math.max(7,w*.012),score=lines.map(function(r,idx){var ex=side==='left'?r.b:r.a,nearest=1e9;lines.forEach(function(o,j){if(j!==idx){var ox=side==='left'?o.b:o.a;nearest=Math.min(nearest,Math.abs(ex-ox))}});return {idx:idx,nearest:nearest,ex:ex}});
          score.sort(function(a,b){return b.nearest-a.nearest});
          var ids=score.slice(0,need).map(function(z){return offset+z.idx+1}).sort(function(a,b){return a-b});return ids;
        }
        var result={total:left.length+right.length,left:left.length,right:right.length,leftByeIds:byePositions(left,'left',0),rightByeIds:byePositions(right,'right',left.length)};
        resolve(result);
      }catch(e){reject(e)}
    };
    img.onerror=function(){reject(Error('Could not read the imported image.'))};img.src=src;
  });
}
function importedReferenceDraw(){
  /* V94: topology recognized from the current Mix-4 reference image.
     Player/club text is deliberately ignored. The image shows Entry 1 on the
     left and Entry 10 on the right bypassing Round 1, so those exact entry
     positions are recreated as structural BYEs in SCS. */
  return {layout:'template-center',templateTeams:10,sideCapacity:null,leftCount:5,
    leftByeIds:[1],rightByeIds:[10],title:'Tournament',
    entries:Array.from({length:10},function(_,i){return {id:i+1,name:'Entry '+(i+1)}}),
    matches:[
      {id:1,round:1,side:'left',a:2,b:3},
      {id:2,round:1,side:'right',a:8,b:9},
      {id:3,round:2,side:'left',a:1,b:'W1'},
      {id:4,round:1,side:'left',a:4,b:5},
      {id:5,round:1,side:'right',a:6,b:7},
      {id:6,round:2,side:'right',a:'W2',b:10},
      {id:7,round:3,side:'left',a:'W3',b:'W4'},
      {id:8,round:3,side:'right',a:'W5',b:'W6'},
      {id:9,round:4,side:'center',a:'W7',b:'W8',final:true}
    ],results:{},structureLocked:true,imageReference:true};
}

function emptyBracket(count,title,third){count=Math.max(2,Math.min(256,Number(count)||2));return generate(Array.from({length:count},function(_,i){return 'Entry '+(i+1)}),title,third)}

function branchSideMatches(entryIds,byeIds,side,startId){
  /* V94: BYE positions are structural inputs.
     1) Remove every selected BYE from Round 1.
     2) Pair the remaining ordered entries into complete Round-1 matches.
     3) In Round 2, every BYE MUST be paired with a Round-1 winner.
     4) Only a Round-1 winner may receive the unavoidable advancement on an
        odd Round-2 source count (for example a 5-team side).
     5) After Round 2 there are no BYE sources; build the remaining knockout
        tree from adjacent branch winners. */
  var byes=new Set((byeIds||[]).map(Number)),matches=[],id=startId,i;
  var non=[],byeSources=[];
  entryIds.forEach(function(entryId,pos){
    var item={src:Number(entryId),pos:pos,isBye:byes.has(Number(entryId))};
    if(item.isBye)byeSources.push(item);else non.push(item);
  });
  if(non.length%2)throw Error('BYE positions leave an odd number of Round-1 teams on the '+side+' side.');
  var winners=[];
  for(i=0;i<non.length;i+=2){
    var a=non[i],b=non[i+1];
    matches.push({id:id,round:1,side:side,a:a.src,b:b.src});
    winners.push({src:'W'+id,pos:(a.pos+b.pos)/2,isBye:false});id++;
  }
  var round=2,sources=[];
  /* Reserve one distinct Round-1 winner for every BYE. Choose the closest
     available branch only to preserve the visual order; the tournament rule
     is the hard constraint: BYE vs Round-1 winner in Round 2. */
  var available=winners.slice();
  byeSources.slice().sort(function(a,b){return a.pos-b.pos}).forEach(function(bye){
    if(!available.length)throw Error('No Round-1 winner is available for a BYE on the '+side+' side.');
    available.sort(function(a,b){var d=Math.abs(a.pos-bye.pos)-Math.abs(b.pos-bye.pos);return d||a.pos-b.pos});
    var opp=available.shift();
    matches.push({id:id,round:2,side:side,a:bye.pos<opp.pos?bye.src:opp.src,b:bye.pos<opp.pos?opp.src:bye.src});
    sources.push({src:'W'+id,pos:(bye.pos+opp.pos)/2,isBye:false});id++;
  });
  /* Complete Round 2 with the remaining Round-1 winners. This is essential
     for 7 teams: two winners play each other in Round 2 while the third
     winner plays the BYE. If one winner remains (5-team side), only that
     winner advances; a BYE never advances without playing. */
  available.sort(function(a,b){return a.pos-b.pos});
  if(available.length%2){var carried=available.shift();sources.push({src:carried.src,pos:carried.pos,isBye:false})}
  for(i=0;i<available.length;i+=2){
    var u=available[i],v=available[i+1];
    matches.push({id:id,round:2,side:side,a:u.src,b:v.src});
    sources.push({src:'W'+id,pos:(u.pos+v.pos)/2,isBye:false});id++;
  }
  sources.sort(function(a,b){return a.pos-b.pos});
  round=3;
  while(sources.length>1){
    var next=[];
    if(sources.length%2){
      /* At this point all sources are match winners. Keep the outermost branch
         that gives the most balanced adjacent pairing; never creates a BYE. */
      var carryIndex=0;
      if(sources.length>2){
        var leftGap=Math.abs(sources[1].pos-sources[2].pos),rightGap=Math.abs(sources[sources.length-3].pos-sources[sources.length-2].pos);
        carryIndex=leftGap<=rightGap?sources.length-1:0;
      }
      next.push(sources.splice(carryIndex,1)[0]);
    }
    for(i=0;i<sources.length;i+=2){
      var x=sources[i],y=sources[i+1];
      matches.push({id:id,round:round,side:side,a:x.src,b:y.src});
      next.push({src:'W'+id,pos:(x.pos+y.pos)/2,isBye:false});id++;
    }
    sources=next.sort(function(a,b){return a.pos-b.pos});round++;
  }
  return {matches:matches,winner:sources[0].src,nextId:id,round:round-1};
}
function customSideMatches(entryIds,byeIds,side,startId,preferredCut){
  /* V94 balanced-side engine.  Build the upper and lower main branches
     independently, then join their winners.  This makes the two branches of
     every left/right side differ by at most one team and prevents the long
     top/short bottom (or reverse) structures seen in V94. */
  if(entryIds.length<4)return branchSideMatches(entryIds,byeIds,side,startId);
  var byeSet=new Set((byeIds||[]).map(Number)),required=byeSet.size,splits=balancedSideSplits(entryIds.map(Number),required),chosen=null;
  if(preferredCut!=null)splits=splits.slice().sort(function(a,b){return (a.cut===Number(preferredCut)?-1:0)-(b.cut===Number(preferredCut)?-1:0)});
  for(var si=0;si<splits.length;si++){
    var sp=splits[si],tb=sp.top.filter(function(id){return byeSet.has(Number(id))}),bb=sp.bottom.filter(function(id){return byeSet.has(Number(id))});
    if(tb.length===sp.topNeed&&bb.length===sp.bottomNeed){chosen={sp:sp,topByes:tb,bottomByes:bb};break}
  }
  if(!chosen)throw Error('Choose a balanced BYE pattern for the '+side+' side. For an odd side, both top-heavy and bottom-heavy balanced layouts are supported.');
  var top=chosen.sp.top,bottom=chosen.sp.bottom,topByes=chosen.topByes,bottomByes=chosen.bottomByes;
  var a=branchSideMatches(top,topByes,side,startId),b=branchSideMatches(bottom,bottomByes,side,a.nextId);
  var round=Math.max(a.round,b.round)+1,id=b.nextId;
  var matches=a.matches.concat(b.matches);
  matches.push({id:id,round:round,side:side,a:a.winner,b:b.winner});
  return {matches:matches,winner:'W'+id,nextId:id+1,round:round};
}
function generateCustomTwoSided(count,leftCount,leftByeIds,rightByeIds,title,names,leftCut,rightCut){
  count=Number(count);leftCount=Number(leftCount);var rightCount=count-leftCount;
  if(count<4||count>64)throw Error('Enter between 4 and 64 teams.');
  if(leftCount<1||rightCount<1)throw Error('Both sides need at least one team.');
  var entries=Array.from({length:count},function(_,i){return {id:i+1,name:names&&names[i]?names[i]:'Entry '+(i+1)}}),left=entries.slice(0,leftCount).map(function(e){return e.id}),right=entries.slice(leftCount).map(function(e){return e.id});
  leftByeIds=Array.isArray(leftByeIds)?leftByeIds.map(Number):automaticByeIds(left);
  rightByeIds=Array.isArray(rightByeIds)?rightByeIds.map(Number):automaticByeIds(right);
  var needL=firstRoundByeNeed(left.length),needR=firstRoundByeNeed(right.length);
  if(leftByeIds.length!==needL||rightByeIds.length!==needR)throw Error('Select exactly '+needL+' left BYE position(s) and '+needR+' right BYE position(s).');
  if(leftByeIds.some(function(id){return left.indexOf(id)<0})||rightByeIds.some(function(id){return right.indexOf(id)<0}))throw Error('A BYE position is outside its side.');
  var a=customSideMatches(left,leftByeIds,'left',1,leftCut),bb=customSideMatches(right,rightByeIds,'right',a.nextId,rightCut),matches=a.matches.concat(bb.matches),fid=bb.nextId;
  matches.push({id:fid,round:Math.max(a.round,bb.round)+1,side:'center',a:a.winner,b:bb.winner,final:true});
  return {layout:'template-center',templateTeams:count,sideCapacity:null,leftCount:leftCount,leftByeIds:leftByeIds,rightByeIds:rightByeIds,leftBranchCut:leftCut||null,rightBranchCut:rightCut||null,title:title||'Tournament',entries:entries,matches:matches,results:{},structureLocked:true};
}
function generateTwoSided(count,title){
  count=Number(count);if([4,8,16,32,64].indexOf(count)<0)throw Error('Choose 4, 8, 16, 32 or 64 teams.');
  return generateCustomTwoSided(count,count/2,[],[],title);
}
function templateDiagram(){
  var teams=draw.entries.length,entryW=170,entryH=112,dot=46,pad=42,rowGap=26,entryGap=44,matchGap=62,finalGap=60;
  var leftCount=draw.leftCount||teams/2,leftEntries=draw.entries.slice(0,leftCount),rightEntries=draw.entries.slice(leftCount),maxSide=Math.max(leftEntries.length,rightEntries.length),height=Math.max(520,maxSide*(entryH+rowGap)+pad*2),sideRounds=Math.max.apply(null,draw.matches.filter(function(m){return m.side!=='center'}).map(function(m){return m.round}).concat([1]));
  var cx=pad+entryW+entryGap+dot/2+Math.max(0,sideRounds-1)*matchGap+finalGap,width=cx*2,positions={},entryPos={};
  function placeEntries(list,side){var x=side==='left'?pad:width-pad-entryW;list.forEach(function(e,i){entryPos[e.id]={x:x,y:pad+i*(height-pad*2-entryH)/Math.max(1,list.length-1)}})}
  placeEntries(leftEntries,'left');placeEntries(rightEntries,'right');
  function sourcePoint(src){if(typeof src==='number'){var p=entryPos[src];return p?{x:p.x+entryW/2,y:p.y+entryH/2}:null}var p=positions[Number(String(src).slice(1))];return p?{x:p.x+dot/2,y:p.y+dot/2}:null}
  ['left','right'].forEach(function(side){for(var r=1;r<=sideRounds;r++){draw.matches.filter(function(m){return m.side===side&&m.round===r}).forEach(function(m){var a=sourcePoint(m.a),b=sourcePoint(m.b);if(!a||!b)return;positions[m.id]={x:side==='left'?pad+entryW+entryGap+(r-1)*matchGap:width-pad-entryW-entryGap-dot-(r-1)*matchGap,y:(a.y+b.y)/2-dot/2}})}});
  var final=draw.matches.find(function(m){return m.side==='center'||m.final});
  /* V94: keep the two side-final nodes and the center final on one horizontal axis. */
  var finalAxisY=height/2-dot/2;
  function matchIdFromSource(src){return typeof src==='string'&&String(src).charAt(0)==='W'?Number(String(src).slice(1)):null}
  var leftFinalId=matchIdFromSource(final&&final.a),rightFinalId=matchIdFromSource(final&&final.b);
  if(leftFinalId&&positions[leftFinalId])positions[leftFinalId].y=finalAxisY;
  if(rightFinalId&&positions[rightFinalId])positions[rightFinalId].y=finalAxisY;
  positions[final.id]={x:cx-dot/2,y:finalAxisY};
  function entryCard(e){var name=e.name||('Entry '+e.id),tag=readonly?'div':'button',click=readonly?'':' onclick="SCSTournament.entryTap('+e.id+')"',eliminated=Object.keys(draw.results||{}).some(function(k){var r=draw.results[k];return r&&r.loser===name}),bye=(draw.leftByeIds||[]).concat(draw.rightByeIds||[]).indexOf(e.id)>=0,previewSelected=byeSelection&&selectedByeIds().indexOf(e.id)>=0,previewAuto=byeSelection&&draw.previewAutoByeIds&&draw.previewAutoByeIds.indexOf(e.id)>=0,valid=true;if(byeSelection&&!previewSelected){var side=byeSelectionSide(e.id),arr=side==='left'?byeSelection.leftSelected:byeSelection.rightSelected,need=side==='left'?byeSelection.needLeft:byeSelection.needRight,start=side==='left'?1:byeSelection.leftCount+1,count=side==='left'?byeSelection.leftCount:byeSelection.total-byeSelection.leftCount,ids=Array.from({length:count},function(_,i){return start+i});valid=arr.length<need&&!!completeValidByeSet(ids,need,arr.concat([e.id]))}return '<'+tag+' type="button" class="scs-tm-template-entry '+(eliminated?'eliminated':'active')+(previewSelected?' bye bye-selected':previewAuto?' bye-preview':bye?' bye':'')+(byeSelection&&!valid?' bye-invalid':'')+'" data-entry-id="'+e.id+'" style="left:'+entryPos[e.id].x+'px;top:'+entryPos[e.id].y+'px"'+click+'><span class="scs-tm-bracket-entry-content">'+(tournamentEntryPlayers(name,liveServingPlayerForEntry(name))||'<span>'+esc(name)+'</span>')+((byeSelection?previewSelected:bye)?' <small>BYE</small>':'')+'</span></'+tag+'>'}
  function junction(m){var p=positions[m.id];if(!p)return '';var number=matchDisplayNumber(m.id),r=draw.results[m.id],g=window.SCSCourtCenter&&window.SCSCourtCenter.tournamentGame&&window.SCSCourtCenter.tournamentGame(m.id),st=r?'completed':g?(g.score_status==='scored'?'completed':g.score_status==='scoring'?'progress':'assigned'):'waiting';return '<button type="button" data-tm-id="'+m.id+'" aria-label="Match '+number+'" class="scs-tm-template-junction '+(m.final?'final ':'')+'status-'+st+' '+(selected===m.id?'selected':'')+'" style="left:'+p.x+'px;top:'+p.y+'px" onclick="SCSTournament.select('+m.id+')"><span>'+number+'</span></button>'}
  var currentPattern=byeSelection?(byeSelection.patternMode==='right'?(byeSelection.rightPatterns[byeSelection.rightIndex]||{}):(byeSelection.leftPatterns[byeSelection.leftIndex]||{})):null;
  var currentSideCount=byeSelection?(byeSelection.patternMode==='right'?byeSelection.total-byeSelection.leftCount:byeSelection.leftCount):0;
  var currentCut=currentPattern&&currentPattern.cut!=null?Number(currentPattern.cut):Math.ceil(currentSideCount/2);
  var patternSplit=byeSelection?'<small class="scs-tm-pattern-split">Top '+currentCut+' · Bottom '+Math.max(0,currentSideCount-currentCut)+'</small>':'';
  var swapHint='';
  return '<div class="scs-tm-zoom-bar"><button type="button" onclick="SCSTournament.zoomBy(.8)">−</button><span id="scsTmZoomLabel">100%</span><button type="button" onclick="SCSTournament.zoomBy(1.25)">+</button><button type="button" onclick="SCSTournament.fit()">Fit</button>'+(assistStep===3&&!readonly?'<button id="scsTmSwapUndo" class="scs-tm-swap-undo" type="button" onclick="SCSTournament.undoTeamSwap()"'+(swapUndo?'':' hidden')+'>Undo Swap</button>':'')+'<span class="scs-tm-gesture-hint">Pinch with two fingers · Drag to move</span></div>'+swapHint+'<div class="scs-tm-scroll" id="scsTmScroll"><div class="scs-tm-stage" id="scsTmStage"><div class="scs-tm-chart scs-tm-template-chart" id="scsTmChart" style="width:'+width+'px;height:'+height+'px;min-width:'+width+'px;min-height:'+height+'px"><svg class="scs-tm-wires" aria-hidden="true"></svg>'+draw.entries.map(entryCard).join('')+draw.matches.map(junction).join('')+'</div></div></div><div class="scs-tm-details">'+details()+'</div>';
}
function ensure(){if(!draw)draw=init();if(!Array.isArray(draw.matches))draw.matches=[];if(!Array.isArray(draw.entries))draw.entries=[];if(!draw.results)draw.results={}}
function getMatch(id){return draw.matches.find(function(m){return String(m.id)===String(id)})}
function orderedMatches(){
 var pending=(draw&&draw.matches||[]).slice(),ordered=[],done=new Set(),lastId=null,sides={left:0,right:1,center:2};
 function dependencies(m){return [m.a,m.b].filter(function(src){return typeof src==='string'&&/^[WL]\d+$/.test(src)}).map(function(src){return String(src).slice(1)})}
 function priority(a,b){return Number(a.round||0)-Number(b.round||0)||(a.final?1:0)-(b.final?1:0)||(a.third?1:0)-(b.third?1:0)||Number(sides[a.side]==null?3:sides[a.side])-Number(sides[b.side]==null?3:sides[b.side])||Number(a.id)-Number(b.id)}
 while(pending.length){
  var ready=pending.filter(function(m){return dependencies(m).every(function(id){return done.has(String(id))})});
  if(!ready.length)ready=pending.slice();
  var rested=lastId==null?ready:ready.filter(function(m){return dependencies(m).indexOf(String(lastId))<0});
  var next=(rested.length?rested:ready).sort(priority)[0];
  ordered.push(next);done.add(String(next.id));lastId=next.id;pending.splice(pending.indexOf(next),1);
 }
 return ordered
}
function matchDisplayNumber(id){var list=orderedMatches(),index=list.findIndex(function(m){return String(m.id)===String(id)});return index<0?id:index+1}
function resolve(src){if(src==null)return 'BYE';if(typeof src==='number'){var e=draw.entries.find(function(e){return e.id===src});return e?(e.name||'Entry '+src):'Entry '+src}var type=String(src).charAt(0),id=String(src).slice(1),r=draw.results[id];return r?(type==='L'?r.loser:r.winner):(type==='L'?'Loser':'Winner')+' of '+matchDisplayNumber(id)}
function matchInfo(id){var m=getMatch(id);if(!m)return null;return {a:resolve(m.a),b:resolve(m.b),number:matchDisplayNumber(id)}}
function button(s,call){return '<button type="button" onclick="SCSTournament.'+call+'">'+s+'</button>'}
function card(m){var r=draw.results[m.id],info=matchInfo(m.id),g=window.SCSCourtCenter&&window.SCSCourtCenter.tournamentGame&&window.SCSCourtCenter.tournamentGame(m.id),state=r?'Completed':g?(g.score_status==='scored'?'Awaiting approval':g.score_status==='scoring'?'Playing':'Assigned'):'Waiting';var label=function(src,value){return typeof src==='number'&&!draw.entries.some(function(e){return e.id===src&&e.name&&!/^Entry \d+$/.test(e.name)})?'Entry '+src+' · Empty':value};return '<button type="button" data-tm-id="'+m.id+'" class="scs-tm-node '+(r?'done ':'')+(selected===m.id?'selected':'')+'" onclick="SCSTournament.select('+m.id+')"><span class="scs-tm-number">MATCH '+matchDisplayNumber(m.id)+(m.third?' · THIRD PLACE':'')+'</span><span class="scs-tm-team '+(r&&r.winner===info.a?'winner':'')+'">'+esc(label(m.a,info.a))+'</span><span class="scs-tm-team '+(r&&r.winner===info.b?'winner':'')+'">'+esc(label(m.b,info.b))+'</span><span class="scs-tm-status">'+esc(state)+(g&&g.court?' · Court '+esc(g.court):'')+'</span></button>'}
function isReferenceDraw(){var ids=draw.matches.map(function(m){return Number(m.id)}).sort(function(a,b){return a-b}).join(',');return draw.layout==='center'&&draw.entries.length===10&&ids==='1,2,3,4,5,6,7,8,10'}
function referenceDiagram(){
  var pos={1:[70,75],2:[70,195],3:[70,265],4:[70,455],5:[70,525],6:[930,75],7:[930,195],8:[930,355],9:[930,425],10:[930,545]};
  var j={1:[300,230],3:[405,145],4:[300,490],7:[455,315],5:[700,145],2:[700,390],6:[595,510],8:[545,315],10:[500,445]};
  function en(id){var e=draw.entries.find(function(x){return x.id===id}),name=e&&e.name?e.name:'Team '+id,x=pos[id][0],y=pos[id][1],right=id>=6;return '<g class="scs-tm-entry-card"><rect x="'+(right?x-125:x)+'" y="'+(y-22)+'" width="125" height="44" rx="9"></rect><text x="'+(right?x-62.5:x+62.5)+'" y="'+(y+5)+'" text-anchor="middle">'+esc(name)+'</text></g>'}
  function junction(id){var x=j[id][0],y=j[id][1];return '<g class="scs-tm-junction '+(selected===id?'selected':'')+'" data-ref-match="'+id+'" onclick="SCSTournament.select('+id+')"><circle cx="'+x+'" cy="'+y+'" r="18"></circle><text x="'+x+'" y="'+(y+5)+'" text-anchor="middle">'+matchDisplayNumber(id)+'</text></g>'}
  function red(id,d){return draw.results[id]?'<path class="scs-tm-progress" d="'+d+'"></path>':''}
  var lines=''
   +'<path d="M195 195 H255 V230 H282 M195 265 H255 V230"></path>'
   +'<path d="M195 75 H365 V149 H387 M318 230 H365 V149"></path>'
   +'<path d="M195 455 H255 V500 H282 M195 525 H255 V500"></path>'
   +'<path d="M423 145 H455 V315 H437 M318 490 H455 V315"></path>'
   +'<path d="M805 75 H745 V149 H718 M805 195 H745 V149"></path>'
   +'<path d="M805 355 H745 V390 H718 M805 425 H745 V390"></path>'
   +'<path d="M682 390 H640 V530 H613 M805 545 H640 V530"></path>'
   +'<path d="M682 145 H545 V315 H563 M577 510 H545 V315"></path>'
   +'<path d="M473 315 H500 V427 M527 315 H500 V427"></path>';
  var progress=red(1,'M318 230 H365 V149')+red(3,'M423 145 H455 V315')+red(4,'M318 490 H455 V315')+red(5,'M682 145 H545 V315')+red(2,'M682 390 H640 V530')+red(6,'M577 510 H545 V315')+red(7,'M473 315 H500 V427')+red(8,'M527 315 H500 V427');
  return '<div class="scs-tm-zoom-bar"><button type="button" onclick="SCSTournament.zoomBy(.8)">−</button><span id="scsTmZoomLabel">100%</span><button type="button" onclick="SCSTournament.zoomBy(1.25)">+</button><button type="button" onclick="SCSTournament.fit()">Fit</button><span class="scs-tm-gesture-hint">Pinch with two fingers · Drag to move</span></div><div class="scs-tm-scroll" id="scsTmScroll"><div class="scs-tm-stage" id="scsTmStage"><div class="scs-tm-chart scs-tm-reference-chart" id="scsTmChart"><svg viewBox="0 0 1000 620" role="img" aria-label="Tournament flowchart"><g class="scs-tm-bracket-lines">'+lines+'</g><g class="scs-tm-progress-lines">'+progress+'</g>'+draw.entries.map(function(e){return en(e.id)}).join('')+draw.matches.map(function(m){return junction(m.id)}).join('')+'</svg></div></div></div><div class="scs-tm-details">'+details()+'</div>';
}
function diagram(){if(draw.layout==='template-center'&&draw.matches.length)return templateDiagram();if(!draw.matches.length)return '<div class="scs-tm-empty"><div class="scs-tm-empty-icon">◇</div><h3>Your tournament flowchart</h3><p>Upload a bracket photo and create an empty draw.</p>'+(readonly?'':button('Create empty flowchart','edit()'))+'</div>';var levels=Array.from(new Set(draw.matches.filter(function(m){return !m.third}).map(function(m){return m.round}))).sort(function(a,b){return a-b});var layout=draw.layout||'ltr',last=levels[levels.length-1];var cols=levels.map(function(level){return '<div class="scs-tm-column" data-round="'+level+'"><strong>ROUND '+level+'</strong>'+draw.matches.filter(function(m){return m.round===level&&!m.third}).map(card).join('')+'</div>'});if(layout==='rtl')cols.reverse();if(layout==='center'&&levels.length>1){var mid=cols.pop();var left=cols.filter(function(_,i){return i%2===0}),right=cols.filter(function(_,i){return i%2===1}).reverse();cols=left.concat([mid],right)}return '<div class="scs-tm-zoom-bar"><button type="button" onclick="SCSTournament.zoomBy(.8)" aria-label="Zoom out">−</button><span id="scsTmZoomLabel">100%</span><button type="button" onclick="SCSTournament.zoomBy(1.25)" aria-label="Zoom in">+</button><button type="button" onclick="SCSTournament.fit()">Fit to screen</button><span class="scs-tm-gesture-hint">Pinch with two fingers · Drag to move</span></div><div class="scs-tm-scroll" id="scsTmScroll"><div class="scs-tm-stage" id="scsTmStage"><div class="scs-tm-chart scs-tm-dynamic" id="scsTmChart"><svg class="scs-tm-wires" aria-hidden="true"></svg>'+cols.join('')+'</div></div></div>'+(draw.matches.some(function(m){return m.third})?'<div class="scs-tm-third"><h3>Third place</h3>'+draw.matches.filter(function(m){return m.third}).map(card).join('')+'</div>':'')}
function wires(){var chart=root&&root.querySelector('#scsTmChart'),svg=chart&&chart.querySelector('svg');if(!svg)return;var previewPath=byeSelection?byePathMatchIds():new Set();var width=chart.scrollWidth,height=chart.scrollHeight;svg.setAttribute('viewBox','0 0 '+width+' '+height);svg.setAttribute('width',width);svg.setAttribute('height',height);svg.innerHTML='';draw.matches.filter(function(m){return !m.third}).forEach(function(m){var target=chart.querySelector('[data-tm-id="'+m.id+'"]');if(!target)return;var b=target.getBoundingClientRect(),cr=chart.getBoundingClientRect(),scale=zoom||1,targetX=(b.left+b.width/2-cr.left)/scale,targetY=(b.top+b.height/2-cr.top)/scale;['a','b'].forEach(function(side){var src=m[side],from=null,isEntry=false;if(typeof src==='number'){from=chart.querySelector('[data-entry-id="'+src+'"]');isEntry=true}else if(typeof src==='string'&&src.charAt(0)==='W')from=chart.querySelector('[data-tm-id="'+src.slice(1)+'"]');if(!from)return;var a=from.getBoundingClientRect(),fromCenterX=(a.left+a.width/2-cr.left)/scale,fromY=(a.top+a.height/2-cr.top)/scale,forward=fromCenterX<targetX,fromX=isEntry?(forward?(a.right-cr.left)/scale:(a.left-cr.left)/scale):(fromCenterX+(forward?23:-23)),toX=targetX+(forward?-23:23);var path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M'+fromX+' '+fromY+' H'+toX+' V'+targetY);path.setAttribute('fill','none');var advanced=false;if(typeof src==='number'){var mr=draw.results[m.id],entry=draw.entries.find(function(e){return e.id===src});advanced=!!(mr&&entry&&mr.winner===(entry.name||'Entry '+src));}else if(typeof src==='string'&&src.charAt(0)==='W'){var sourceId=src.slice(1),sourceResult=draw.results[sourceId],targetResult=draw.results[m.id];advanced=!!sourceResult;}path.setAttribute('stroke',advanced?'#22c55e':'#7f9bd1');path.setAttribute('stroke-width',advanced?'4':'2');if(byeSelection&&previewPath.has(Number(m.id))&&((typeof src==='number'&&selectedByeIds().indexOf(src)>=0)||(typeof src==='string'&&src.charAt(0)==='W'&&previewPath.has(Number(src.slice(1)))))){path.setAttribute('stroke-dasharray','8 7');path.setAttribute('stroke','#f2c15f');path.setAttribute('stroke-width','3')}svg.appendChild(path)})})}
function finalAnchor(chart){
 var anchor=chart&&chart.querySelector('.scs-tm-template-junction.final');
 if(anchor)return anchor;
 var matches=(draw&&draw.matches||[]).filter(function(m){return !m.third}),finalMatch=matches.find(function(m){return m.final});
 if(!finalMatch)finalMatch=matches.slice().sort(function(a,b){return Number(b.round||0)-Number(a.round||0)||Number(b.id||0)-Number(a.id||0)})[0];
 return finalMatch&&chart?chart.querySelector('[data-tm-id="'+finalMatch.id+'"], [data-ref-match="'+finalMatch.id+'"]'):null
}
function applyZoom(centerWinner){
 var chart=root&&root.querySelector('#scsTmChart'),stage=root&&root.querySelector('#scsTmStage'),scroll=root&&root.querySelector('#scsTmScroll'),label=root&&root.querySelector('#scsTmZoomLabel');if(!chart||!stage)return;
 var scaledWidth=chart.scrollWidth*zoom,scaledHeight=chart.scrollHeight*zoom,viewWidth=scroll?scroll.clientWidth:scaledWidth,viewHeight=scroll?scroll.clientHeight:scaledHeight;
 panX=Math.max(0,(viewWidth-scaledWidth)/2);panY=Math.max(0,(viewHeight-scaledHeight)/2);
 if(centerWinner&&scaledWidth<=viewWidth){var anchor=finalAnchor(chart);if(anchor){var winnerX=(anchor.offsetLeft+anchor.offsetWidth/2)*zoom;panX=Math.max(0,Math.min(viewWidth-scaledWidth,viewWidth/2-winnerX))}}
 chart.style.left=panX+'px';chart.style.top=panY+'px';chart.style.transform='scale('+zoom+')';
 stage.style.width=Math.max(viewWidth,scaledWidth+panX*2)+'px';stage.style.height=Math.max(viewHeight,scaledHeight+panY*2)+'px';
 if(label)label.textContent=Math.round(zoom*100)+'%'
}
function zoomBy(factor){setZoom(zoom*factor)}
function setZoom(value,cx,cy){var scroll=root&&root.querySelector('#scsTmScroll');if(!scroll)return;var old=zoom,oldPanX=panX||0,oldPanY=panY||0;if(cx==null){cx=scroll.clientWidth/2;cy=scroll.clientHeight/2}var contentX=(scroll.scrollLeft+cx-oldPanX)/old,contentY=(scroll.scrollTop+cy-oldPanY)/old;zoom=Math.max(.2,Math.min(4,value));applyZoom();scroll.scrollLeft=Math.max(0,panX+contentX*zoom-cx);scroll.scrollTop=Math.max(0,panY+contentY*zoom-cy)}
function fit(){var chart=root&&root.querySelector('#scsTmChart'),scroll=root&&root.querySelector('#scsTmScroll');if(!chart||!scroll)return;zoom=Math.max(.2,Math.min(1,(scroll.clientWidth-12)/chart.scrollWidth,(scroll.clientHeight-12)/chart.scrollHeight));applyZoom(true);scroll.scrollLeft=0;scroll.scrollTop=0}
function bindGestures(){var scroll=root&&root.querySelector('#scsTmScroll');if(!scroll)return;scroll.addEventListener('touchstart',function(e){if(e.touches.length===2){var a=e.touches[0],b=e.touches[1],r=scroll.getBoundingClientRect();gesture={mode:'pinch',distance:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),initial:zoom,cx:(a.clientX+b.clientX)/2-r.left,cy:(a.clientY+b.clientY)/2-r.top};e.preventDefault()}else if(e.touches.length===1){gesture={mode:'pan',x:e.touches[0].clientX,y:e.touches[0].clientY,left:scroll.scrollLeft,top:scroll.scrollTop}}},{passive:false});scroll.addEventListener('touchmove',function(e){if(e.touches.length===2&&gesture&&gesture.mode==='pinch'){var a=e.touches[0],b=e.touches[1];setZoom(gesture.initial*Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)/Math.max(1,gesture.distance),gesture.cx,gesture.cy);e.preventDefault()}else if(e.touches.length===1&&gesture&&gesture.mode==='pan'){scroll.scrollLeft=gesture.left+gesture.x-e.touches[0].clientX;scroll.scrollTop=gesture.top+gesture.y-e.touches[0].clientY;e.preventDefault()}},{passive:false});scroll.addEventListener('touchend',function(e){if(e.touches.length===0)gesture=null;else if(e.touches.length===1)gesture={mode:'pan',x:e.touches[0].clientX,y:e.touches[0].clientY,left:scroll.scrollLeft,top:scroll.scrollTop}});var lastTap=0;scroll.addEventListener('touchend',function(e){if(e.changedTouches.length!==1||e.touches.length)return;var now=Date.now();if(now-lastTap<310){var r=scroll.getBoundingClientRect();setZoom(zoom>1.3?1:2,e.changedTouches[0].clientX-r.left,e.changedTouches[0].clientY-r.top);lastTap=0}else lastTap=now})}
// Share the existing Round Manager / Players Manager player pool.
// Do not depend on Court Center having been opened (its players array is loaded lazily).
function availablePlayerNames(){
  var names=[];
  function add(items){(Array.isArray(items)?items:[]).forEach(function(p){
    var n=typeof p==='string'?p:p&&p.name;
    if(n&&String(n).trim())names.push(String(n).trim());
  });}
  if(typeof schedulerState!=='undefined'&&schedulerState)add(schedulerState.allPlayers);
  try{add(JSON.parse(localStorage.getItem('schedulerPlayers')||'[]'));}catch(e){}
  if(window.SCSCourtCenter&&typeof SCSCourtCenter.playerNames==='function')add(SCSCourtCenter.playerNames());
  if(draw&&draw.entries)draw.entries.forEach(function(e){add(splitTeam(e.name||'').players)});
  return Array.from(new Map(names.map(function(n){return [n.toLocaleLowerCase(),n]})).values()).sort(function(a,b){return a.localeCompare(b)});
}
// Tournament-specific selection from the existing Players Manager registry.
// Saved tournaments can predate playerPool persistence. Derive a display-only
// fallback from their actual bracket entries, without touching the club registry.
function tournamentEntryPlayerNames(d){
 var seen=new Set(),names=[];
 (d&&Array.isArray(d.entries)?d.entries:[]).forEach(function(entry){
  var label=entry&&entry.name;
  if(typeof label!=='string'||/^Entry \d+$/.test(label))return;
  splitTeam(label).players.forEach(function(name){
   name=String(name||'').trim();var key=name.toLocaleLowerCase();
   if(name&&!seen.has(key)){seen.add(key);names.push(name)}
  });
 });
 return names;
}
function restoreTournamentPlayerPool(d){
 if(!d)return;
 var pool=Array.isArray(d.playerPool)?d.playerPool:[];
 var seen=new Set();
 d.playerPool=pool.concat(tournamentEntryPlayerNames(d)).map(function(player){
  return typeof player==='string'?player:player&&typeof player.name==='string'?player.name:'';
 }).map(function(name){return name.trim()}).filter(function(name){
  var key=name.toLocaleLowerCase();if(!name||seen.has(key))return false;
  seen.add(key);return true;
 });
}
function tournamentPool(){
 if(!draw)return [];
 if(draw.live===true||draw.livePage===true)restoreTournamentPlayerPool(draw);
 // Tournament player manager can contain players who have not yet been placed
 // in a bracket entry. Do not limit the picker to previously assigned teams.
 var names=[],seen=new Set();
 function add(value){var n=typeof value==='string'?value:value&&(value.player||value.name);n=String(n||'').trim();var key=n.toLocaleLowerCase();if(n&&!seen.has(key)){seen.add(key);names.push(n)}}
 (Array.isArray(draw.playerPool)?draw.playerPool:[]).forEach(add);
 (Array.isArray(draw.selectedPlayerDetails)?draw.selectedPlayerDetails:[]).forEach(add);
 (Array.isArray(draw.selectedClubs)?draw.selectedClubs:[]).forEach(function(c){(Array.isArray(c.players)?c.players:[]).forEach(add)});
 return names;
}
// Reuse Round Manager's existing createRatingRing; no player/round changes.
function tournamentPlayerRow(name){
 preserveTeamPlayerDetails(draw);
 var level='<span class="scs-tournament-gender-level">—</span>';
 var club=(draw&&Array.isArray(draw.selectedClubs)?draw.selectedClubs:[]).find(function(c){return Array.isArray(c.players)&&c.players.some(function(p){return String(p).toLocaleLowerCase()===String(name).toLocaleLowerCase()})});
 var subClub=club?String(club.clubName||'').trim():'';
 // Never invent a sub-club for manually imported or legacy players.
 if(window.ScsApi&&ScsApi.cards&&typeof ScsApi.cards.rosterPlayer==='function'){
  var matches=(draw&&Array.isArray(draw.selectedPlayerDetails)?draw.selectedPlayerDetails:[]).filter(function(p){return String(p.player||'').trim().toLowerCase()===String(name||'').trim().toLowerCase()});
  var record=matches.find(function(p){return subClub&&String(p.subClub||'')===subClub})||(matches.length===1?matches[0]:null);
  var displayClub=record&&record.subClub||subClub;
  var html=window.SCSSharedMatchCenter&&SCSSharedMatchCenter.playerIdentity
   ?SCSSharedMatchCenter.playerIdentity(name,{level:record&&record.level,gender:record&&record.gender,subClub:displayClub})
   :ScsApi.cards.rosterPlayer({name:name,levelMarkup:level,subClub:displayClub,level:record&&record.level,gender:record&&record.gender});
  if(record)html=html.replace('data-tm-player="'+esc(name)+'"','data-tm-player="'+esc(name)+'" data-tm-player-id="'+esc(record.playerId||'')+'" data-tm-subclub-id="'+esc(record.subClubId||'')+'" data-tm-gender="'+esc(record.gender||'')+'" data-tm-level="'+(record.level??'')+'"');
  return html;
 }
 return '<div class="scs-api-roster-row"><span class="scs-tm-shared-player"><span class="scs-tm-ring-slot" data-tm-player="'+esc(name)+'"></span><span class="scs-tm-shared-name">'+esc(name)+'</span>'+level+'</span></div>';
}
function hydrateTournamentPlayerCards(){if(window.SCSTournamentPlayerLevel)(window.SCSTournamentPlayerLevel.setRoster(root,draw&&draw.selectedPlayerDetails),window.SCSTournamentPlayerLevel.hydrate(root));if(window.SCSTeamPicker&&root){root.querySelectorAll('.scs-tm-mobile-picker,.scs-tm-teams-flat').forEach(function(el){SCSTeamPicker.decorate(el);el.querySelectorAll(".scs-team-level-pill").forEach(function(b){var n=(b.textContent||"").match(/[1-5]/);if(n)b.dataset.level=n[0]})})}}
var poolExpanded=false;
function togglePool(){poolExpanded=!poolExpanded;render();}
function tournamentPoolCard(){
 if(!draw)return '';
 var pool=tournamentPool();
 return '<section class="scs-tm-pool scs-tm-player-pool"><div class="scs-tm-pool-heading"><div><small>TOURNAMENT PLAYERS</small><h3>Players ('+pool.length+')</h3></div><div class="scs-tm-pool-actions"><button type="button" onclick="SCSTournament.togglePool()" aria-expanded="'+(poolExpanded?'true':'false')+'">'+(poolExpanded?'Hide ▲':'Show ▼')+'</button><button type="button" onclick="SCSTournament.openPlayersManager()">+ Players Manager</button></div></div>'+
 (poolExpanded?(pool.length?'<div class="scs-tm-pool-chips">'+pool.map(tournamentPlayerRow).join('')+'</div>':'<p>Select a registered club and its players using the Team Tournament selector.</p>'):'')+'</section>';
}
function tournamentTeamsCard(){
 if(!draw)return '';
 var entries=Array.isArray(draw.entries)?draw.entries:[],byes=(draw.leftByeIds||[]).concat(draw.rightByeIds||[]);
 return '<section class="scs-tm-pool scs-tm-team-roster"><div class="scs-tm-pool-heading"><div><small>TOURNAMENT TEAMS</small><h3>Teams ('+entries.length+')</h3></div></div><div class="scs-tm-team-card-grid">'+entries.map(function(e,i){var players=splitTeam(e.name||'').players;return '<article class="scs-tm-roster-card"><span class="scs-tm-roster-number">'+(i+1)+'</span><div>'+(players.length?players.map(tournamentPlayerRow).join(''):'<span class="scs-tm-roster-empty">Team not assigned</span>')+'</div>'+(byes.indexOf(e.id)>=0?'<small>BYE</small>':'')+'</article>'}).join('')+'</div></section>'
}
function openPlayersManager(){
 if(!draw||!root||readonly)return;
 const previous=Array.isArray(draw.selectedPlayerDetails)?draw.selectedPlayerDetails:[];
 window.SCSTournamentPlayersPage.open({selected:previous,onDone:function(players){
  draw.selectedPlayerDetails=players;
  preserveTeamPlayerDetails(draw);
  const byClub=new Map();players.forEach(p=>{if(!byClub.has(p.subClub))byClub.set(p.subClub,[]);byClub.get(p.subClub).push(p.player)});
  draw.selectedClubs=[...byClub].map(([clubName,names])=>({clubName,players:names}));
  draw.playerPool=[...new Set(players.map(p=>p.player))];
  localTournamentSave(draw).catch(console.error);
  if(assistStep===1)assistPlayersTeams();else render();
 }});
}
function playersManagerReturned(){
 if(!window.__scsTournamentPlayersReturn)return false;
 window.__scsTournamentPlayersReturn=false;
 if(!draw||!root)return true;
 var players=(typeof schedulerState!=='undefined'&&schedulerState&&Array.isArray(schedulerState.allPlayers))?schedulerState.allPlayers:[];
 draw.playerPool=Array.from(new Set(players.filter(function(p){return p&&p.active!==false}).map(function(p){return String(p.name||'').trim()}).filter(Boolean)));
 localTournamentSave(draw).catch(function(e){console.error('Tournament player pool save failed',e)});
 root.hidden=false;render();return true;
}
function filterPlayerPool(q){var box=root&&root.querySelector('.scs-tm-pool-options');if(!box)return;box.querySelectorAll('[data-pool-name]').forEach(function(el){el.hidden=!el.getAttribute('data-pool-name').includes(String(q||'').toLowerCase())})}
function setPoolPlayer(name,checked){if(!draw)return;var pool=tournamentPool().slice();pool=pool.filter(function(n){return n.toLowerCase()!==name.toLowerCase()});if(checked)pool.push(name);draw.playerPool=pool;localTournamentSave(draw).catch(function(e){alert(e.message||'Unable to save player pool')});var h=root&&root.querySelector('.scs-tm-pool-heading h3');if(h)h.textContent='Players ('+pool.length+')';var chips=root&&root.querySelector('.scs-tm-pool-chips');if(chips)chips.innerHTML=pool.map(tournamentPlayerRow).join('')}
var swapEntryId=null;var swapRecentIds=[];var swapUndo=null;var swapRecentTimer=null;
function tournamentStarted(){if(draw&&draw.live===true)return true;if(Object.keys(draw.results||{}).length)return true;if(window.SCSCourtCenter&&window.SCSCourtCenter.tournamentGame){return draw.matches.some(function(m){var g=window.SCSCourtCenter.tournamentGame(m.id);if(!g)return false;var st=String(g.score_status||'').toLowerCase();return st==='scoring'||st==='scored'||st==='completed'||st==='complete'||!!g.started_at||!!g.start_time})}return false}
function entryInStartedMatch(id){
  id=Number(id);
  if(!draw||!draw.matches)return false;
  var entry=draw.entries.find(function(e){return Number(e.id)===id});
  if(!entry)return false;
  var name=entry.name||('Entry '+id);
  return draw.matches.some(function(m){
    var info=matchInfo(m.id),r=draw.results&&draw.results[m.id],g=window.SCSCourtCenter&&window.SCSCourtCenter.tournamentGame&&window.SCSCourtCenter.tournamentGame(m.id);
    var involved=info&&(info.a===name||info.b===name);
    if(!involved)return false;
    if(r)return true;
    if(!g)return false;
    var st=String(g.score_status||'').toLowerCase();
    return st==='scoring'||st==='scored'||st==='completed'||st==='complete'||!!g.started_at||!!g.start_time;
  });
}
function tournamentPlayedNames(){
 var names=new Set();
 (draw&&draw.entries||[]).forEach(function(e){if(entryInStartedMatch(e.id))splitTeam(e.name||'').players.forEach(function(n){names.add(n.trim().toLocaleLowerCase())})});
 return names;
}
function editableEntryFromSource(src){return typeof src==='number'&&draw.entries.some(function(e){return Number(e.id)===Number(src)})&&!entryInStartedMatch(src)}
function tournamentAssignedNames(exceptId){
 var used=new Set();(draw&&draw.entries||[]).forEach(function(e){
  if(Number(e.id)===Number(exceptId)||/^Entry \d+$/.test(e.name||''))return;
  splitTeam(e.name||'').players.forEach(function(n){if(n.trim())used.add(n.trim().toLocaleLowerCase())});
 });return used;
}
function liveServingPlayerForEntry(name){
 var cc=window.SCSCourtCenter,state=cc&&cc.liveState?cc.liveState():null,players=splitTeam(name||'').players.map(function(n){return String(n).trim().toLocaleLowerCase()});
 var game=(state&&state.games||[]).find(function(g){var sc=g&&g.score,server=sc&&Array.isArray(sc.names)&&Number.isInteger(sc.server)?sc.names[sc.server]:'';return g&&g.score_status==='scoring'&&sc&&sc.finished!==true&&server&&players.indexOf(String(server).trim().toLocaleLowerCase())>=0});
 return game&&game.score&&game.score.names[game.score.server]||'';
}
function tournamentEntryPlayers(name,server){
 if(!name||/^Entry \d+$/.test(name))return '';
 return '<span class="scs-tm-bracket-players">'+splitTeam(name).players.map(function(player){return '<span class="scs-tm-bracket-player-service">'+tournamentPlayerRow(player)+(server&&String(player).trim().toLocaleLowerCase()===String(server).trim().toLocaleLowerCase()?'<span class="scs-tm-server-shuttle" title="Serving" aria-label="Serving">🏸</span>':'')+'</span>'}).join('')+'</span>';
}
function swapStatus(message){var el=root&&root.querySelector('#scsTmSwapStatus');if(el)el.textContent=message||'Tap a team to select it for swapping.';}
function swapDecorate(){if(!root)return;var oldToolbar=root.querySelector('.scs-tm-swap-toolbar');if(oldToolbar)oldToolbar.remove();root.querySelectorAll('[data-entry-id]').forEach(function(el){var id=Number(el.getAttribute('data-entry-id'));el.classList.toggle('scs-swap-selected',id===swapEntryId);el.classList.toggle('scs-swap-recent',swapRecentIds.indexOf(id)>=0)});var undo=root.querySelector('#scsTmSwapUndo');if(undo)undo.hidden=!swapUndo;}
function holdSwapFeedback(){if(swapRecentTimer)clearTimeout(swapRecentTimer);swapRecentTimer=setTimeout(function(){swapRecentTimer=null;swapRecentIds=[];swapDecorate()},1800)}
function finishSwapRender(){render();holdSwapFeedback()}
function undoTeamSwap(){if(!swapUndo||tournamentStarted())return;if(swapRecentTimer){clearTimeout(swapRecentTimer);swapRecentTimer=null}var a=draw.entries.find(function(e){return e.id===swapUndo[0]}),b=draw.entries.find(function(e){return e.id===swapUndo[1]});if(!a||!b)return;var name=a.name;a.name=b.name;b.name=name;swapUndo=null;swapRecentIds=[];swapEntryId=null;if(saveFn)Promise.resolve(saveFn(draw)).then(render);else render()}
function entryTap(id){
 if(readonly)return;id=Number(id);if(byeSelection)return;
 if(entryInStartedMatch(id)){alert('This team is locked because its match has already started.');return}
 if(tournamentStarted()){editEntry(id);return}
 if(swapEntryId==null){swapEntryId=id;swapRecentIds=[];swapDecorate();var entry=draw.entries.find(function(e){return e.id===id});swapStatus((entry&&entry.name||'Team')+' selected — tap another team to swap.');return}
 if(swapEntryId===id){swapEntryId=null;swapDecorate();swapStatus('Selection cancelled. Tap a team to select.');return}
 var a=draw.entries.find(function(e){return e.id===swapEntryId}),b=draw.entries.find(function(e){return e.id===id});if(!a||!b)return;
 swapUndo=[a.id,b.id];swapRecentIds=[a.id,b.id];var name=a.name;a.name=b.name;b.name=name;swapEntryId=null;
 if(saveFn)Promise.resolve(saveFn(draw)).then(finishSwapRender).catch(function(e){alert(e.message||'Could not save swap')});else finishSwapRender();
}

function editEntry(id){
 if(readonly)return;
 var e=draw.entries.find(function(x){return Number(x.id)===Number(id)});if(!e)return;
 if(entryInStartedMatch(id)){alert('This team already played and cannot be changed.');return}
 selected=null;render();
 var detailsBox=document.createElement('section');detailsBox.className='scs-tm-entry-modal';detailsBox.dataset.entryId=String(id);detailsBox.setAttribute('role','dialog');detailsBox.setAttribute('aria-modal','true');detailsBox.setAttribute('aria-label','Assign tournament players');root.appendChild(detailsBox);
 var current=/^Entry \d+$/.test(e.name||'')?[]:splitTeam(e.name||'').players;
 var used=tournamentAssignedNames(id);var names=(tournamentPool().length?tournamentPool():availablePlayerNames()).filter(function(n){return !used.has(String(n).trim().toLocaleLowerCase())});
 var opts=names.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>'}).join('');
 var chosen=current.slice(0,2);
 var available=names.filter(function(n){return !used.has(n.trim().toLocaleLowerCase())});
 detailsBox.innerHTML='<div class="scs-tm-entry-editor scs-tm-mobile-picker"><button type="button" class="scs-tm-entry-close" aria-label="Close player assignment" onclick="SCSTournament.closeEntryPopup()">×</button><h3>Entry '+id+' · Select Players</h3><p>Tap two players to form a team.</p><div data-shared-picker></div><details class="scs-tm-manual-entry"><summary>Player not listed? Enter names manually</summary><label>Player 1<input id="scsTmP1" autocomplete="off" value="'+esc(chosen[0]||'')+'"></label><label>Player 2<input id="scsTmP2" autocomplete="off" value="'+esc(chosen[1]||'')+'"></label></details><div class="scs-tm-import-actions">'+(assistStep===1&&!assistSaved?'<button type="button" onclick="SCSTournament.addNextTeam('+id+')">+ Add Team</button>':'')+'<button type="button" class="scs-tm-primary" onclick="SCSTournament.doneEntry('+id+')">Done</button></div><p class="scs-tm-entry-status" role="status"></p></div>';
 if(window.SCSTeamPicker)SCSTeamPicker.render(detailsBox.querySelector('[data-shared-picker]'),{names:available,selected:chosen,max:2,row:tournamentPlayerRow,onChange:function(a){detailsBox.querySelector('#scsTmP1').value=a[0]||'';detailsBox.querySelector('#scsTmP2').value=a[1]||''}});
 else detailsBox.querySelector('[data-shared-picker]').textContent='Player selector is unavailable. Please reload the application.';
 hydrateTournamentPlayerCards();detailsBox.addEventListener('click',function(ev){if(ev.target===detailsBox)closeEntryPopup()});
}
async function addNextTeam(id){
 if(readonly||assistStep!==1||assistSaved)return;
 var ok=await saveEntry(id,true);if(ok!==true)return;
 if(draw.entries.length>=64){var status=root&&root.querySelector('.scs-tm-entry-status');if(status)status.textContent='Maximum 64 teams.';return}
 var nextId=draw.entries.reduce(function(m,e){return Math.max(m,Number(e.id)||0)},0)+1;
 draw.entries.push({id:nextId,name:'Entry '+nextId,_scsPendingTeam:true});saveAssistDraft();
 closeEntryPopup();render();editEntry(nextId);
}
async function doneEntry(id){var ok=await saveEntry(id,true);if(ok===true){closeEntryPopup();render()}}
function closeEntryPopup(){if(!root)return;var popup=root.querySelector('.scs-tm-entry-modal');if(!popup)return;var id=Number(popup.dataset.entryId),entry=draw&&draw.entries&&draw.entries.find(function(item){return Number(item.id)===id});popup.remove();if(entry&&entry._scsPendingTeam){draw.entries=draw.entries.filter(function(item){return Number(item.id)!==id});saveAssistDraft();render()}}
async function saveEntry(id,noRender){if(readonly)return;if(entryInStartedMatch(id)){var locked=root&&root.querySelector('.scs-tm-entry-status');if(locked)locked.textContent='This team has already played and cannot be edited.';return;}var e=draw.entries.find(function(x){return Number(x.id)===Number(id)}),box=root&&root.querySelector('.scs-tm-entry-editor');if(!e||!box)return;var p1=box.querySelector('#scsTmP1').value.trim(),p2=box.querySelector('#scsTmP2').value.trim(),status=box.querySelector('.scs-tm-entry-status');if(!p1||!p2){if(status)status.textContent='Enter both player names to save this team.';return false}if(p1.toLowerCase()===p2.toLowerCase()){if(status)status.textContent='Choose two different players.';return false}var assigned=tournamentAssignedNames(id),played=tournamentPlayedNames();if(played.has(p1.toLocaleLowerCase())||played.has(p2.toLocaleLowerCase())){if(status)status.textContent='A player who has already played cannot be reassigned.';return false}if(assigned.has(p1.toLocaleLowerCase())||assigned.has(p2.toLocaleLowerCase())){if(status)status.textContent='Player already assigned to another tournament team. Choose an available player.';return false}var next=p1+' / '+p2,old=e.name;if(old===next){delete e._scsPendingTeam;return true}e.name=next;delete e._scsPendingTeam;if(!assistSaved){saveAssistDraft();if(status)status.textContent='Saved to draft.';if(!noRender)render();return true}try{await localTournamentSave(draw);if(saveFn&&saveFn!==localTournamentSave)await saveFn(draw);await localTournamentSave(draw);if(status)status.textContent='Saved automatically.';if(!noRender)render();return true;}catch(err){e.name=old;await localTournamentSave(draw).catch(function(){});if(status)status.textContent=err.message||'Could not save team entry.';return false}}
// Knockout owns its scoreboard snapshots, independent of the Court Center session.
function koCaptureMatchScore(id,game){
 if(!draw||!game||!game.score||!Array.isArray(game.score.names)||game.score.names.length!==4)return false;
 var score=game.score;
 if(!Array.isArray(score.completedSets)&&!Array.isArray(score.currentScore))return false;
 if(!draw.matchScores)draw.matchScores={};
 var old=draw.matchScores[id];
 var next=JSON.parse(JSON.stringify(score));
 if(old&&JSON.stringify(old)===JSON.stringify(next))return false;
 draw.matchScores[id]=next;
 var match=Array.isArray(draw.matches)&&draw.matches.find(function(m){return String(m.id)===String(id)});
 if(match)match.scoreboard=JSON.parse(JSON.stringify(next));
 return true;
}
function koScoreForMatch(id){
 var match=draw&&Array.isArray(draw.matches)&&draw.matches.find(function(m){return String(m.id)===String(id)});
 var saved=(draw&&draw.matchScores&&draw.matchScores[id])||(match&&match.scoreboard);
 if(saved&&Array.isArray(saved.names)&&saved.names.length===4)return saved;
 var game=window.SCSCourtCenter&&SCSCourtCenter.tournamentGame&&SCSCourtCenter.tournamentGame(id);
 return game&&game.score&&Array.isArray(game.score.names)&&game.score.names.length===4?game.score:null;
}
function koUpdateCompletedScore(id,score,winner){
 if(readonly||!draw||!score||!score.finished)return false;
 if(!draw.matchScores)draw.matchScores={};draw.matchScores[id]=JSON.parse(JSON.stringify(score));
 var m=Array.isArray(draw.matches)&&draw.matches.find(function(x){return String(x.id)===String(id)});if(m)m.scoreboard=JSON.parse(JSON.stringify(score));
 var info=matchInfo(id);if(info&&info.a&&info.b){if(!draw.results)draw.results={};draw.results[id]={winner:winner==='L'?info.a:info.b,loser:winner==='L'?info.b:info.a};}
 localTournamentSave(draw);render();return true;
}
function openMatchScore(id,editable){
 var score=koScoreForMatch(id);
 if(!score||!window.SCSScoring||typeof SCSScoring.openCompleted!=='function'){
  selected=id;render();return;
 }
 if(!readonly){var g=window.SCSCourtCenter&&SCSCourtCenter.tournamentGame&&SCSCourtCenter.tournamentGame(id);if(koCaptureMatchScore(id,g))localTournamentSave(draw);}
 if(editable&&!readonly&&SCSScoring.openEditableCompleted)SCSScoring.openEditableCompleted(id,score,function(payload,winner){return koUpdateCompletedScore(id,payload,winner)});else SCSScoring.openCompleted(score);
}
function scoreSummary(g){if(!g||!g.score)return '';var s=g.score,sets=Array.isArray(s.completedSets)?s.completedSets:[];if(sets.length)return sets.map(function(x){return Array.isArray(x.score)?x.score.join('–'):''}).filter(Boolean).join(' · ');return Array.isArray(s.currentScore)?s.currentScore.join('–'):''}
function currentServingPlayer(g){var sc=g&&g.score;if(!sc||sc.finished===true||!Array.isArray(sc.names)||!Number.isInteger(sc.server))return '';return sc.names[sc.server]||''}
function details(){
 if(!selected)return '<p class="scs-tm-hint">Tap a numbered junction to see the two teams playing.</p>';
 var m=getMatch(selected),info=matchInfo(selected),r=draw.results[selected],g=window.SCSCourtCenter&&window.SCSCourtCenter.tournamentGame&&window.SCSCourtCenter.tournamentGame(selected);if(!m)return '';
 var score=scoreSummary(g)||scoreSummary({score:koScoreForMatch(selected)});
 // Reuse the one shared tournament result card below the bracket as well.
 if((score||r)&&window.SCSSharedMatchCenter&&typeof SCSSharedMatchCenter.completed==='function'){
  var winner='';if(r&&r.winner){if(String(r.winner)===String(info.a))winner='left';else if(String(r.winner)===String(info.b))winner='right'}
  var left=splitTeam(info.a).players,right=splitTeam(info.b).players;
  return SCSSharedMatchCenter.completed({number:matchDisplayNumber(selected),title:'Match '+matchDisplayNumber(selected),left:info.a,right:info.b,leftPlayers:left,rightPlayers:right,score:String(score||'').replace(/\s*·\s*/g,' | '),server:currentServingPlayer(g),winner:winner,playerRenderer:tournamentPlayerRow});
 }
 var h='<h3>Match '+matchDisplayNumber(selected)+'</h3><p>'+esc(info.a)+' <b>VS</b> '+esc(info.b)+'</p>';
 if(!readonly){['a','b'].forEach(function(side){var src=m[side];if(editableEntryFromSource(src))h+='<button type="button" onclick="SCSTournament.editEntry('+src+')">Edit '+(side==='a'?'Team A':'Team B')+'</button> '})}
 if(!readonly&&!r){if(g)h+='<p>Assigned to '+(g.court?'Court '+g.court:'waiting list')+'.</p>';else if(!/^(Winner|Loser) of /.test(info.a)&&!/^(Winner|Loser) of /.test(info.b)&&!/^Entry \d+$/.test(info.a)&&!/^Entry \d+$/.test(info.b))h+=button('Assign match','assign('+selected+')');else h+='<p>Complete the entry names and previous matches before court assignment.</p>'}return h
}
// V330: Generated knockout fixtures use the existing shared SCS match card.
// The bracket remains the authoritative source for match positions and BYEs.
function knockoutFixtureCards(){
 if(!draw||!draw.matches||!draw.matches.length||!draw.knockoutFixturesGenerated)return '';
 // Capture completed scoring details while the court session is still available.
 if(!readonly&&window.SCSCourtCenter&&typeof SCSCourtCenter.tournamentGame==='function'){
  var scoreChanged=false;
  draw.matches.forEach(function(m){var g=SCSCourtCenter.tournamentGame(m.id);if(g&&g.score&&g.score.finished===true)scoreChanged=koCaptureMatchScore(m.id,g)||scoreChanged;});
  if(scoreChanged)localTournamentSave(draw);
 }
 var shared=window.SCSSharedMatchCenter;
 if(!shared||typeof shared.completed!=='function')return '';
 var groups=new Map();
 orderedMatches().filter(function(m){return !m.third}).forEach(function(m){
  var round=Number(m.round)||1;
  if(!groups.has(round))groups.set(round,[]);
  groups.get(round).push(m);
 });
 var html='<section class="scs-ko-generated-fixtures"><h3>Generated Matches</h3>';
 groups.forEach(function(matches,round){
  html+='<section class="scs-ko-fixture-round"><h4>Round '+round+'</h4>';
  matches.forEach(function(m){
   var info=matchInfo(m.id),result=(draw.results||{})[m.id],game=window.SCSCourtCenter&&SCSCourtCenter.tournamentGame?SCSCourtCenter.tournamentGame(m.id):null;
   var left=splitTeam(info.a).players,right=splitTeam(info.b).players;
   var winner=result&&result.winner===info.a?'left':result&&result.winner===info.b?'right':null;
   var scored=scoreSummary(game);
   var savedScore=koScoreForMatch(m.id);if(!scored&&savedScore)scored=scoreSummary({score:savedScore});
   var card=shared.completed({number:matchDisplayNumber(m.id),title:'Match '+matchDisplayNumber(m.id),left:info.a,right:info.b,leftPlayers:left,rightPlayers:right,score:String(scored||'').replace(/\s*·\s*/g,' | '),winner:winner,playerRenderer:tournamentPlayerRow});
   if(!result){card=card.replace('<span class="scs-tm-completed-check">✓</span>','<span class="scs-ko-fixture-pending">○</span>')}
   // Reuse the existing team edit popup by tapping the team's player area.
   // Keep the shared match card markup and styles untouched.
   if(!readonly&&!result){
    ['a','b'].forEach(function(side,index){
     var src=m[side];
     if(!editableEntryFromSource(src))return;
     var target='<div class="scs-tm-completed-team ';
     var pos=card.indexOf(target);
     if(index===1)pos=card.indexOf(target,pos+target.length);
     if(pos<0)return;
     var end=card.indexOf('"',pos+target.length);
     if(end<0)return;
     card=card.slice(0,end+1)+' role="button" tabindex="0" aria-label="Edit Team '+(index===0?'A':'B')+'" onclick="SCSTournament.editEntry('+src+')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();SCSTournament.editEntry('+src+')}"'+card.slice(end+1);
    });
   }
   var actions='';
   if(savedScore)actions+='<button type="button" onclick="SCSTournament.openMatchScore('+m.id+','+(!readonly&&!!result)+')">View Scoreboard</button>';
   if(!readonly&&!result){

    if(game){actions+='<span>Assigned to '+(game.court?'Court '+esc(game.court):'waiting list')+'</span>'}
    else if(!/^(Winner|Loser) of /.test(info.a)&&!/^(Winner|Loser) of /.test(info.b)&&!/^Entry \d+$/.test(info.a)&&!/^Entry \d+$/.test(info.b))actions+='<button type="button" onclick="SCSTournament.assign('+m.id+')">Assign Court</button>';
 
   }
   html+='<div class="scs-ko-fixture-card scs-team-match-shell" data-match-id="'+m.id+'"'+(savedScore?' role="button" tabindex="0" aria-label="Open match scoreboard" onclick="if(!event.target.closest(\'[onclick],button,a,input,select\'))SCSTournament.openMatchScore('+m.id+')" onkeydown="if(event.target===this&&(event.key===\'Enter\'||event.key===\' \')){event.preventDefault();SCSTournament.openMatchScore('+m.id+')}"':'')+'>'+card+(actions?'<div class="scs-ko-fixture-actions">'+actions+'</div>':'')+'</div>';
  });
  html+='</section>';
 });
 return html+'</section>';
}
function patternEditorCard(){
  if(!byeSelection)return '';
  var p=byeSelection.patternMode==='right'?(byeSelection.rightPatterns[byeSelection.rightIndex]||{}):(byeSelection.leftPatterns[byeSelection.leftIndex]||{}),n=byeSelection.patternMode==='right'?byeSelection.total-byeSelection.leftCount:byeSelection.leftCount,cut=p&&p.cut!=null?Number(p.cut):Math.ceil(n/2);
  return '<div class="scs-tm-pattern-dashboard"><div class="scs-tm-pattern-title"><span class="scs-tm-kicker">ASSIST · STEP 2 OF 4</span><h2>Tournament Pattern</h2><p>Choose the bracket structure and BYE positions for each side.</p></div><div class="scs-tm-bye-summary"><span><b>Left Side</b><em>'+byeSelection.needLeft+' '+(byeSelection.needLeft===1?'BYE':'BYEs')+'</em></span><span><b>Right Side</b><em>'+byeSelection.needRight+' '+(byeSelection.needRight===1?'BYE':'BYEs')+'</em></span></div><div class="scs-tm-pattern-controls"><div class="scs-tm-pattern-tabs"><button type="button" class="'+(byeSelection.patternMode==='left'?'active':'')+'" onclick="SCSTournament.setByePatternMode(\'left\')">Left</button><button type="button" class="'+(byeSelection.patternMode==='right'?'active':'')+'" onclick="SCSTournament.setByePatternMode(\'right\')">Right</button></div><div class="scs-tm-pattern-row"><button type="button" class="scs-tm-pattern-arrow" onclick="SCSTournament.nextByePattern(-1)">‹</button><span class="scs-tm-pattern-label"><b>Pattern '+byePatternNumber()+' of '+byePatternCount()+'</b><small class="scs-tm-pattern-split">Top '+cut+' · Bottom '+Math.max(0,n-cut)+'</small></span><button type="button" class="scs-tm-pattern-arrow" onclick="SCSTournament.nextByePattern(1)">›</button></div></div><div class="scs-tm-bye-actions"><button type="button" onclick="SCSTournament.assistClearPattern()">Clear Pattern</button></div></div>';
}
function savedTournamentCard(){var saved=localTournamentLoad();if(!saved)return '';var left=Number(saved.leftCount||Math.ceil((saved.entries||[]).length/2)),right=(saved.entries||[]).length-left,live=saved.live===true;return '<section class="scs-tm-saved-card"><div><small>'+(live?'TOURNAMENT LIVE':'SAVED TOURNAMENT')+'</small><h3>'+esc(saved.title||'Tournament')+'</h3><p>'+left+' Left · '+right+' Right · '+(saved.matches||[]).length+' Matches'+(live?' · '+Math.max(1,Number(saved.numCourts)||1)+' Courts':'')+'</p></div><button type="button" class="scs-tm-start-live" onclick="SCSTournament.enterSavedTournament()">'+(live?'● <span>Tournament Live</span>':'▶ <span>Tournament Start</span>')+'</button></section>'}
function tournamentStartPanel(){var n=Math.max(1,Math.min(20,Number(draw.numCourts)||2));var groupAssist=draw&&draw._scsGroupEventId!=null?'<div class="scs-ko-group-start-guide"><strong>Knockout Setup Assistant</strong><p>Step 1 · Qualified teams transferred from the Group Stage.</p><p>Step 2 · Bracket generated. Review the matches above.</p><p>Step 3 · Choose courts and tap Start Tournament. Then assign ready matches to courts.</p></div>':'';return '<section class="scs-tm-start-panel scs-tm-live-prestart">'+groupAssist+'<div><small>TOURNAMENT LIVE</small><h3>Courts &amp; Match Assignment</h3><p>Select the number of courts, then start this live tournament.</p></div><div class="scs-tm-court-picker"><button type="button" onclick="SCSTournament.setTournamentCourts(-1)">−</button><b>'+n+'</b><button type="button" onclick="SCSTournament.setTournamentCourts(1)">+</button></div><div class="scs-tm-prestart-courts">'+Array.from({length:n},function(_,i){return '<div class="scs-tm-court-card is-free"><div class="scs-tm-court-head"><strong>COURT '+(i+1)+'</strong><span>FREE</span></div><p>Available when tournament starts</p></div>'}).join('')+'</div><button type="button" class="scs-tm-start-live" onclick="SCSTournament.startSavedTournament()">▶ Start Tournament</button></section>'}
function setTournamentCourts(delta){if(!draw)return;draw.numCourts=Math.max(1,Math.min(20,(Number(draw.numCourts)||2)+Number(delta||0)));localTournamentSave(draw);render()}
async function startSavedTournament(){if(!koFixturesReady()){alert('Generate fixtures before starting the tournament.');return}await localTournamentSave(draw);if(!window.SCSCourtCenter||typeof SCSCourtCenter.startTournament!=='function'){alert('Court Center is still loading. Please try again.');return}try{draw.live=true;draw.livePage=true;draw.numCourts=Math.max(1,Math.min(20,Number(draw.numCourts)||2));if(typeof window.scsGetTournamentCloudIdentity==='function'){var cloudId=window.scsGetTournamentCloudIdentity('knockout');if(cloudId)draw._scsCloudTournamentId=cloudId}await SCSCourtCenter.startTournament(draw,draw.numCourts);await localTournamentSave(draw);if(saveFn&&saveFn!==localTournamentSave)await saveFn(draw);render()}catch(e){draw.live=false;alert(e.message||'Could not start the live tournament.')}}
function sameSavedTournament(a,b){if(!a||!b)return false;var aei=String(a._scsKoEventId||''),bei=String(b._scsKoEventId||'');if(aei&&bei)return aei===bei;var ac=String(a._scsClientTournamentId||''),bc=String(b._scsClientTournamentId||'');if(ac&&bc)return ac===bc;var ai=String(a._scsCloudTournamentId||''),bi=String(b._scsCloudTournamentId||'');if(ai&&bi&&ai===bi)return true;var at=String(a.title||'').trim(),bt=String(b.title||'').trim();if(!at||at!==bt)return false;var ae=Array.isArray(a.entries)?a.entries:[],be=Array.isArray(b.entries)?b.entries:[];if(ae.length!==be.length)return false;return ae.every(function(e,i){return String(e&&e.name||'')===String(be[i]&&be[i].name||'')})}
async function koResumeOpenedEvent(eventId,saved){
 if(!saved||!saved.matches||!saved.matches.length||!window.SCSCourtCenter||typeof SCSCourtCenter.resumeTournament!=='function')return;
 try{
  var state=await SCSCourtCenter.resumeTournament(saved);
  if(!state||!state.tournament||!sameSavedTournament(saved,state.tournament)||String(koActiveId)!==String(eventId))return;
  var resumed=preserveTeamPlayerDetails(state.tournament);
  ['_scsCloudTournamentId','_scsClientTournamentId','_scsKoMainId','_scsKoMainTitle','_scsKoEventId','_scsParentTournamentId','_scsParentTournamentTitle'].forEach(function(key){if(saved[key]!=null&&resumed[key]==null)resumed[key]=saved[key]});
  resumed.live=true;resumed.livePage=true;resumed.assistFinalized=true;resumed.numCourts=Math.max(1,Number(state.courtCount)||Number(saved.numCourts)||1);
  draw=resumed;assistSaved=true;creationScreenPinned=false;bracketViewInitialized=false;bracketScrollState=null;selected=null;swapEntryId=null;
  await localTournamentSave(draw);render();
 }catch(e){console.warn('Tournament session resume:',e&&e.message||e)}
}
async function enterSavedTournament(){koMainStart();koShowHome();return;readonly=false;tournamentActiveTab='main';var saved=localTournamentLoad();if(!saved){alert('No saved tournament found.');render();return}try{assistSaved=true;creationScreenPinned=false;bracketViewInitialized=false;bracketScrollState=null;draw=saved;selected=null;swapEntryId=null;draw.livePage=true;ensure();restoreTournamentPlayerPool(draw);root=document.getElementById('scsTournamentOverlay');if(root)root.hidden=false;render();if(saved.live===true&&window.SCSCourtCenter&&typeof SCSCourtCenter.resumeTournament==='function'){try{var state=await Promise.race([SCSCourtCenter.resumeTournament(saved),new Promise(function(_,reject){setTimeout(function(){reject(new Error('Court session timed out'))},6000)})]);if(state&&state.tournament&&sameSavedTournament(saved,state.tournament)){draw=state.tournament;draw.live=true;draw.livePage=true;draw.numCourts=state.courtCount;restoreTournamentPlayerPool(draw);await localTournamentSave(draw)}}catch(_){/* keep the saved bracket usable; Match Center can retry */}}render()}catch(e){if(root)root.hidden=false;render();alert(e.message||'Could not open the tournament.')}}
function openCourtCenter(){if(window.SCSCourtCenter&&typeof window.SCSCourtCenter.open==='function'){window.SCSCourtCenter.open();return}alert('Court Center is not available.')}
function liveTournamentPanel(){
  if(!draw||draw.live!==true)return '';
  var state=window.SCSCourtCenter&&SCSCourtCenter.liveState?SCSCourtCenter.liveState():{ready:false,courtCount:Number(draw.numCourts)||1,games:[]};
  var allGames=state.games||[];
  function tg(id){return allGames.find(function(g){return Number(g.tournament_match)===Number(id)})}
  var matches=draw.matches.map(function(m){return {m:m,info:matchInfo(m.id),g:tg(m.id)}});
  var completed=matches.filter(function(x){return (x.g&&x.g.court_center_status==='approved')||!!draw.results[x.m.id]});
  var waiting=matches.filter(function(x){return (x.g&&x.g.court)&&(!x.g||x.g.court_center_status!=='approved')&&!draw.results[x.m.id]&&!/^(Winner|Loser) of /.test(x.info.a)&&!/^(Winner|Loser) of /.test(x.info.b)&&!/^Entry \d+$/.test(x.info.a)&&!/^Entry \d+$/.test(x.info.b)});
  var recentPlayers=latestCompletedPlayerKeys(allGames),freshWaiting=waiting.filter(function(x){return !x.g&&!matchNeedsRest(x.m,recentPlayers)}),canRotate=freshWaiting.length>0;
  waiting.sort(function(a,b){var ar=!a.g&&matchNeedsRest(a.m,recentPlayers),br=!b.g&&matchNeedsRest(b.m,recentPlayers);return Number(ar)-Number(br)||matchDisplayNumber(a.m.id)-matchDisplayNumber(b.m.id)});
  var tab=draw.liveTab||'waiting',targetCourt=Number(draw.assigningCourt)||0;
  function scoreText(g){if(!g)return '';var sc=g.score;if(!sc)return '';if(typeof sc==='string')return sc;var sets=Array.isArray(sc.completedSets)?sc.completedSets:(Array.isArray(sc.sets)?sc.sets:[]);if(sets.length)return sets.map(function(x){if(Array.isArray(x.score))return x.score.join('–');return (x.a!=null?x.a:x.left)+'–'+(x.b!=null?x.b:x.right)}).join('  |  ');if(sc.currentScore)return sc.currentScore.join(' – ');return ''}
  function teamPlayers(label){var parts=splitTeam(label||'').players;return parts.length?parts.map(tournamentPlayerRow).join(''):esc(label||'')}
  var courtCount=Math.max(1,Number(state.courtCount)||Number(draw.numCourts)||1);
  var courts=Array.from({length:courtCount},function(_,i){
    var n=i+1,g=allGames.find(function(x){return Number(x.court)===n&&x.court_center_status!=='approved'});
    if(!g)return {number:n};
    var id=Number(g.tournament_match),info=id?matchInfo(id):null,ready=g.score_status==='scored',playing=g.score_status==='scoring';
    return {number:n,playerRenderer:tournamentPlayerRow,match:{status:ready?'AWAITING APPROVAL':playing?'IN PROGRESS':'ASSIGNED (Not Started)',label:'MATCH '+matchDisplayNumber(id),left:(g.pair1||[]).length?g.pair1:splitTeam(info?info.a:'').players,right:(g.pair2||[]).length?g.pair2:splitTeam(info?info.b:'').players,score:scoreText(g),server:currentServingPlayer(g),winner:g&&g.winner==='L'?'left':g&&g.winner==='R'?'right':null,ready:ready,started:playing||ready||!!g.started_at,action:ready?'onclick="SCSTournament.approveLive('+id+')"':playing?'onclick="SCSScoring.open()"':'onclick="SCSTournament.startCourtMatch('+id+')"',actionLabel:ready?'Approve Result':playing?'View Score':'Start Match',cardAction:'data-ko-court-card="'+id+'"'}};
  });
  return '<div class="scs-tm-unified-match-center">'+SCSSharedMatchCenter.panel({courtCount,courts,tab,hideRanking:true,assigning:0,
   waiting:waiting.map(function(x){var g=x.g;return {number:matchDisplayNumber(x.m.id),left:x.info.a,right:x.info.b,label:'Court '+g.court+' · '+(g.score_status==='scored'?'Under Approval':g.score_status==='scoring'?'In Progress':'Assigned'),assigned:true}}),
   completed:completed.map(function(x){var r=draw.results[x.m.id],winner=r?(r.winner===x.info.a?'left':r.winner===x.info.b?'right':null):null;if(!winner)winner=x.g&&x.g.winner==='L'?'left':x.g&&x.g.winner==='R'?'right':null;return {number:matchDisplayNumber(x.m.id),left:x.info.a,right:x.info.b,leftPlayers:splitTeam(x.info.a).players,rightPlayers:splitTeam(x.info.b).players,score:scoreText(x.g)||scoreSummary({score:koScoreForMatch(x.m.id)}),winner:winner,playerRenderer:tournamentPlayerRow,action:koScoreForMatch(x.m.id)?'onclick="SCSTournament.openMatchScore('+x.m.id+')"':'',actionLabel:'View Scoreboard',cardAction:koScoreForMatch(x.m.id)?'data-ko-completed-card="'+x.m.id+'"':''}}),
   attrs:{change:n=>'onclick="SCSTournament.changeLiveCourts('+n+')"',choose:n=>'',cancel:'onclick="SCSTournament.cancelCourtSelection()"',tab:id=>'onclick="SCSTournament.liveTab(\''+id+'\')"'}
  })+'</div>';
}
var creationScreenPinned=false;var bracketViewInitialized=false;var bracketScrollState=null;
/* V127: view-only tabs; switching does not recreate the bracket or court session. */
var tournamentActiveTab='main';
var tournamentCenterTab='courts';
function switchTournamentCenterTab(name){
 if(['flowchart','courts','matches'].indexOf(name)<0)return;
 tournamentCenterTab=name;
 if(!root)return;
 root.querySelectorAll('[data-tm-center-tab]').forEach(function(button){
  var active=button.getAttribute('data-tm-center-tab')===name;
  button.classList.toggle('active',active);
  button.setAttribute('aria-selected',active?'true':'false');
 });
 root.querySelectorAll('[data-tm-center-panel]').forEach(function(panel){
  panel.hidden=panel.getAttribute('data-tm-center-panel')!==name;
 });
 if(name==='flowchart'){requestAnimationFrame(function(){applyZoom();wires();bindGestures()})}
}
function switchTournamentTab(name){
 if(name==='main'&&koMain){koShowHome();return}
 if(koHome&&koMain){if(koActiveId)koOpenEvent(koActiveId,name);else alert('Add an event first.');return}
 if(['main','players','flowchart','match'].indexOf(name)<0)return;
 tournamentActiveTab=name;
 if(!root)return;
 root.querySelectorAll('[data-tm-tab]').forEach(function(button){var active=button.getAttribute('data-tm-tab')===name;button.classList.toggle('active',active);button.setAttribute('aria-selected',active?'true':'false')});
 root.querySelectorAll('[data-tm-panel]').forEach(function(panel){panel.hidden=panel.getAttribute('data-tm-panel')!==name});
 if(name==='flowchart')requestAnimationFrame(function(){applyZoom();wires();bindGestures()});
}

function spectatorMatchList(){
 if(!draw||!Array.isArray(draw.matches))return '';
 return '<section class="scs-tm-live-center" style="padding:14px"><h3>Matches</h3>'+draw.matches.filter(function(m){return !m.third}).map(function(m){
  var info=matchInfo(m.id),result=(draw.results||{})[m.id];
  return '<div class="scs-tm-pool" style="padding:12px;margin:8px 0"><strong>Match '+esc(String(matchDisplayNumber(m.id)))+'</strong><p>'+esc(info.a||'TBD')+' vs '+esc(info.b||'TBD')+'</p>'+(result?'<small>Completed · Winner: '+esc(String(result.winner||''))+'</small>':'<small>Upcoming</small>')+'</div>';
 }).join('')+'</section>';
}
function organizeTournamentTabs(){
 if(!root||!draw||!draw.matches||!draw.matches.length||byeSelection||(!readonly&&!assistSaved&&assistStep===3))return;
 var summary=root.querySelector('.scs-tm-tournament-dashboard,.scs-tm-pattern-dashboard');
 var teamPanels=Array.from(root.querySelectorAll('.scs-tm-player-pool,.scs-tm-team-roster'));
 var workspace=root.querySelector('.scs-tm-workspace');
 var match=root.querySelector('.scs-tm-live-center,.scs-tm-start-panel');
 var hint=root.querySelector('.scs-tm-swap-hint');
 var details=root.querySelector('.scs-tm-details');
 var old=root.querySelector('.scs-tm-organized-tabs');if(old)old.remove();
 var live=draw.live===true||readonly;
 var tabs=[['main','home'],['players','clubs'],['flowchart','tournament'],['match','match']];
 var bar;
 if(window.ScsApi&&ScsApi.navigation&&typeof ScsApi.navigation.bottom==='function'){
  var host=document.createElement('div');
  host.innerHTML=ScsApi.navigation.bottom({active:tabs.find(function(t){return t[0]===tournamentActiveTab})?.[1]||'home',attribute:'data-tm-nav',ariaLabel:'Knockout tournament sections'});
  bar=host.firstElementChild;
  // Keep the shared Team Tournament navigation component and its icons.
  // Only change the label of its Clubs slot in the Knockout instance.
  var teamsNav=bar.querySelector('[data-tm-nav="clubs"]');
  if(teamsNav){
   var label=teamsNav.querySelector('.scs-tm-nav-label');
   if(label)label.textContent='Teams';
   else teamsNav.childNodes.forEach(function(node){if(node.nodeType===3&&node.textContent.trim()==='Clubs')node.textContent='Teams'});
   teamsNav.setAttribute('aria-label','Teams and Players');
  }
  bar.querySelectorAll('[data-tm-nav]').forEach(function(btn){
   btn.onclick=function(){var key=btn.getAttribute('data-tm-nav');var found=tabs.find(function(t){return t[1]===key});if(found)switchTournamentTab(found[0]);};
  });
 }else{
  bar=document.createElement('nav');bar.className='scs-tm-organized-tabs scs-tm-bottom-nav';bar.setAttribute('aria-label','Tournament sections');
  [['main','Home'],['players','Teams'],['flowchart','Tournament'],['match','Match Center']].forEach(function(item){var btn=document.createElement('button');btn.type='button';btn.textContent=item[1];btn.setAttribute('data-tm-tab',item[0]);btn.onclick=function(){switchTournamentTab(item[0])};bar.appendChild(btn)});
 }
 bar.querySelectorAll('[data-tm-nav]').forEach(function(btn){var key=btn.getAttribute('data-tm-nav');var found=tabs.find(function(t){return t[1]===key});if(found)btn.setAttribute('data-tm-tab',found[0]);});
 root.insertBefore(bar,root.firstChild);
 function panel(name,els){var wrap=document.createElement('section');wrap.className='scs-tm-tab-panel';wrap.setAttribute('data-tm-panel',name);root.appendChild(wrap);els.forEach(function(el){if(el)wrap.appendChild(el)});return wrap}
 panel('main',[summary]);
 // Knockout Teams uses the very same cards and metadata hydration as Assist Step 1.
 // Do not maintain a second, reduced roster layout.
 var playersPanel=document.createElement('div');
 playersPanel.innerHTML=tournamentPoolCard()+assistTeamsCard();
 panel('players',Array.from(playersPanel.children));
 teamPanels.forEach(function(el){if(el&&el.parentNode)el.remove()});
 var fixtureList=document.createElement('div');fixtureList.innerHTML=knockoutFixtureCards();
 // Saved fixtures can be started directly from the Tournament tab; Assist is optional.
 if(!readonly&&!draw.live&&koFixturesReady()){
  var startAction=document.createElement('button');startAction.type='button';startAction.className='scs-tm-start-live';
  startAction.textContent='▶ Start Tournament';startAction.onclick=function(){startSavedTournament()};
  fixtureList.insertBefore(startAction,fixtureList.firstChild);
 }
 var tournamentPanel=panel('flowchart',[workspace,hint,details,fixtureList]);
 // Reuse the existing Match Center ranking content in Tournament; no stylesheet changes.
 var koRanking=document.createElement('div');koRanking.hidden=true;koRanking.innerHTML='<div class="scs-tm-live-empty">Ranking updates from approved results.</div>';
 var koTabs=document.createElement('nav');koTabs.className='scs-tm-live-tabs';koTabs.innerHTML='<button type="button" class="active">All</button><button type="button">Ranking</button>';
 koTabs.children[0].onclick=function(){koRanking.hidden=true;Array.from(tournamentPanel.children).forEach(function(e){if(e!==koTabs&&e!==koRanking)e.hidden=false});koTabs.children[0].classList.add('active');koTabs.children[1].classList.remove('active')};
 koTabs.children[1].onclick=function(){Array.from(tournamentPanel.children).forEach(function(e){if(e!==koTabs&&e!==koRanking)e.hidden=true});koRanking.hidden=false;koTabs.children[1].classList.add('active');koTabs.children[0].classList.remove('active')};
 tournamentPanel.insertBefore(koTabs,tournamentPanel.firstChild);tournamentPanel.appendChild(koRanking);panel('match',match?[match]:[function(){var empty=document.createElement('section');empty.className='scs-tm-pool';empty.innerHTML='<h3>Match Center</h3><p>Start the knockout tournament to assign courts and conduct matches.</p>';
 if(!readonly&&!draw.live&&koFixturesReady()){
  var startAction=document.createElement('button');startAction.type='button';startAction.className='scs-tm-start-live';
  startAction.textContent='▶ Start Tournament';startAction.onclick=function(){startSavedTournament()};empty.appendChild(startAction);
 }return empty}()]);
 // Spectators reuse the live Match Center markup but cannot operate any court or match.
 if(readonly&&live){var viewPanel=root.querySelector('[data-tm-panel="match"]');if(viewPanel){viewPanel.querySelectorAll('button').forEach(function(btn){if(!btn.closest('.scs-tm-live-tabs'))btn.remove()});viewPanel.querySelectorAll('[onclick]').forEach(function(node){var call=node.getAttribute('onclick')||'';if(!/^SCSTournament\.liveTab\(/.test(call))node.removeAttribute('onclick')});}}
 if(!tabs.some(function(t){return t[0]===tournamentActiveTab}))tournamentActiveTab='main';
 switchTournamentTab(tournamentActiveTab);
}

var ASSIST_DRAFT_KEY='scs-knockout-assist-draft-v1';
var assistAssignmentsConfirmed=false;
function koFixturesReady(){return !!(draw&&draw.knockoutFixturesGenerated&&assistReady(3))}
function koGenerateFixtures(){
 if(!assistReady(3)){alert('Complete team assignments before generating fixtures.');return}
 if(!draw.matches||!draw.matches.length){alert('Confirm a bracket pattern first.');return}
 // The existing pattern generator creates the bracket matches and BYE paths.
 // Preserve their IDs, connections and assignments rather than rebuilding them.
 draw.knockoutFixturesGenerated=true;saveAssistDraft();assistStep=0;assistIndex();
}

function saveAssistDraft(){
 preserveTeamPlayerDetails(draw);
 if(readonly||assistSaved||!draw)return;
 try{localStorage.setItem(koDraftKey(),JSON.stringify({draw:draw,step:assistStep,assignmentsConfirmed:assistAssignmentsConfirmed,updated:Date.now()}));if(koMain&&koActiveId)koSyncEvent(draw)}catch(e){}
}
function restoreAssistDraft(){
 try{var raw=localStorage.getItem(koDraftKey());if(!raw)return null;var data=JSON.parse(raw);if(data&&data.draw&&Array.isArray(data.draw.entries)){assistAssignmentsConfirmed=!!(data.assignmentsConfirmed||data.draw.assistAssignmentsConfirmed);return preserveTeamPlayerDetails(data.draw)}return null}catch(e){return null}
}
function assistTeamsCard(){
 var entries=draw&&Array.isArray(draw.entries)?draw.entries:[];
 return '<section class="scs-tm-pool scs-tm-teams-flat" style="margin-top:14px;border-color:#0f766e"><div class="scs-tm-pool-heading"><div><small>TOURNAMENT TEAMS</small><h3>Teams ('+entries.length+')</h3></div><div class="scs-tm-pool-actions"><button type="button" onclick="SCSTournament.assistAddTeam()" aria-label="Add team" title="Add team">+</button></div></div>'+
 (entries.length?'<div style="display:grid;gap:10px;padding:12px">'+entries.map(function(e,i){
 var names=/^Entry \\d+$/.test(e.name||'')?[]:splitTeam(e.name||'').players;
 return '<div class="scs-tm-compact-team"><div class="scs-tm-compact-team-head"><span>Team '+(i+1)+'</span><details class="scs-tm-compact-actions"><summary aria-label="Team '+(i+1)+' actions" title="Team actions">⋮</summary><div class="scs-tm-compact-action-menu"><button type="button" onclick="SCSTournament.editEntry('+e.id+')">✎ Edit team</button><button type="button" onclick="SCSTournament.assistRemoveTeam('+e.id+')">− Remove team</button></div></details></div><div class="scs-tm-compact-players">'+(names.length?names.map(function(n){return '<div class="scs-tm-compact-player">'+tournamentPlayerRow(n)+'</div>'}).join(''):'<span class="scs-tm-roster-empty">Select two players</span>')+'</div></div>'
 }).join('')+'</div>':'<p style="padding:12px">Create teams, then select players using the existing assignment popup.</p>')+'</section>';
}
function assistAddTeam(){
 if(readonly||(assistStep!==1&&tournamentActiveTab!=='players'))return;
 if(draw.entries.length>=64){alert('Maximum 64 teams.');return}
 var id=draw.entries.reduce(function(m,e){return Math.max(m,Number(e.id)||0)},0)+1;
 draw.entries.push({id:id,name:'Entry '+id,_scsPendingTeam:true});
 saveAssistDraft();render();editEntry(id);
}
function assistRemoveTeam(id){
 if(readonly||(assistStep!==1&&tournamentActiveTab!=='players'))return;
 draw.entries=draw.entries.filter(function(e){return Number(e.id)!==Number(id)});
 saveAssistDraft();render();
}
function assistPlayersTeams(){
 if(!root)return;
 if(!readonly&&!assistSaved&&draw&&Array.isArray(draw.entries)){
  var before=draw.entries.length;
  draw.entries=draw.entries.filter(function(entry){return entry._scsPendingTeam||!/^Entry \d+$/i.test(String(entry.name||''))});
  if(draw.entries.length!==before){draw.matches=[];draw.results={};draw.assistAssignmentsConfirmed=false;draw.knockoutFixturesGenerated=false;saveAssistDraft()}
 }
 root.innerHTML='<section style="max-width:720px;margin:auto;padding:14px"><div style="background:#0f766e;color:white;border-radius:14px;padding:16px"><small>'+esc((koMain&&koMain.title)||(draw&&draw.title)||'Tournament')+'</small><h2>Players and Teams</h2></div>'+tournamentPoolCard()+assistTeamsCard()+'</section>';
 hydrateTournamentPlayerCards();
}
function assistFinishPlayers(){
 if(!assistReady(1)){alert('Assign players to every team before completing Step 1.');return}
 assistBack();
}
function assistConfirmAssignments(){
 if(!assistReady(2)||!assistReady(1)){alert('Assign two players to every team before confirming.');return}
 assistAssignmentsConfirmed=true;draw.assistAssignmentsConfirmed=true;draw.knockoutFixturesGenerated=false;saveAssistDraft();assistStep=0;byeSelection=null;assistIndex();
}
function assistReady(step){
 if(step===1)return !!(draw&&draw.entries&&draw.entries.length>=4&&draw.entries.every(function(e){var name=String(e.name||'').trim();return name&&!/^Entry \d+$/i.test(name)&&splitTeam(name).players.length===2}));
 if(step===2)return !!(draw&&draw.matches&&draw.matches.length);
 if(step===3)return assistReady(2)&&assistReady(1)&&!!(draw&&(draw.assistAssignmentsConfirmed||assistAssignmentsConfirmed));
 if(step===4)return koFixturesReady();
 if(step===5)return koFixturesReady();
 return false;
}
// Persistent Knockout Assist header. The observer keeps it visible when existing steps redraw their content.
var assistHeaderObserver=null;
function ensureAssistHeader(){
 if(!root||root.hidden||readonly||assistSaved||!root.isConnected)return;
 var header=root.querySelector('#scsKoPersistentHeader');
 if(!header){
  header=document.createElement('header');header.id='scsKoPersistentHeader';header.className='scs-ko-persistent-header';
  header.innerHTML='<div class="scs-ko-header-title-row"><h2 id="scsKoStepTitle">Knockout Assist</h2><button type="button" class="scs-ko-header-close" aria-label="Close tournament assistant" onclick="SCSTournament.assistCloseStep()">×</button></div><button type="button" onclick="SCSTournament.assistSaveDraft()" class="scs-ko-save-button">▣ &nbsp; Save Tournament</button><span id="scsKoSaveFeedback" role="status" aria-live="polite"></span><div class="scs-ko-header-divider" aria-hidden="true"></div>';
  root.insertBefore(header,root.firstChild);
 }
 var titles=['Knockout Assist','Players and Teams','Setup Pattern','Assign Teams to Pattern','Generate Fixtures','Start Tournament'];
 var heading=header.querySelector('#scsKoStepTitle');if(heading)heading.textContent=titles[Math.max(0,Math.min(5,assistStep||0))];
 // Step-specific banners were previously duplicated beneath the persistent header.
 // Hide only those banners, never the actual step contents or their controls.
 root.querySelectorAll('.scs-ko-assist-duplicate').forEach(function(e){e.classList.remove('scs-ko-assist-duplicate')});
 if(!assistStep){var section=root.querySelector('.scs-tm-assist');if(section){var oldTitle=section.firstElementChild;if(oldTitle&&oldTitle.querySelector('h2'))oldTitle.classList.add('scs-ko-assist-duplicate');var oldSubtitle=section.querySelector(':scope > p');if(oldSubtitle)oldSubtitle.classList.add('scs-ko-assist-duplicate')}}
 if(assistStep===1||assistStep===2||assistStep===4){var section=root.querySelector(':scope > section');if(section){var banner=section.firstElementChild;if(banner&&banner.querySelector('h2')&&/^(Players and Teams|Setup Pattern|Generate Fixtures)$/.test(banner.querySelector('h2').textContent.trim()))banner.classList.add('scs-ko-assist-duplicate')}}
 if(assistStep===3){var summary=root.querySelector('.scs-tm-pattern-summary');if(summary){var heading=summary.querySelector('h2');if(heading)heading.classList.add('scs-ko-assist-duplicate')}}
}
function observeAssistHeader(){
 if(assistHeaderObserver){assistHeaderObserver.disconnect();assistHeaderObserver=null}
 if(!root||readonly)return;
 assistHeaderObserver=new MutationObserver(function(){ensureAssistHeader()});
 assistHeaderObserver.observe(root,{childList:true});ensureAssistHeader();
}
function assistIndex(){
 if(!root)return;
 var names=['Players and Teams','Setup Pattern','Assign Teams to Pattern','Generate Fixtures','Start'];
 var colors=['#0f766e','#6d28d9','#b45309','#2563eb','#15803d'];
 root.innerHTML='<section class="scs-tm-assist" style="padding:16px;max-width:720px;margin:auto"><div style="display:flex;align-items:center;justify-content:space-between"><h2>Knockout Assist</h2><button type="button" onclick="SCSTournament.close()">Close</button></div><p>Complete each step to unlock the next.</p><span id="scsAssistSaveStatus" role="status"></span>'+names.map(function(n,i){var available=i===0||(i===1?assistReady(1):i===2?assistReady(2):i===3?assistReady(3):koFixturesReady());return '<button type="button" '+(available?'':'disabled')+' onclick="SCSTournament.assistOpen('+i+')" style="display:flex;width:100%;align-items:center;text-align:left;gap:14px;padding:18px;margin:12px 0;border-radius:14px;border:2px solid '+colors[i]+';background:'+colors[i]+';color:#fff;opacity:'+(available?'1':'.48')+'"><strong style="font-size:24px">'+(i+1)+'</strong><span style="flex:1"><b>'+n+'</b><small style="display:block">'+(available?'Open step':'Locked until previous step is complete')+'</small></span><span>'+(available?'›':'🔒')+'</span></button>'}).join('')+'</section>';
}
function assistOpen(i){
 if(readonly||i<0||i>4||(i>0&&!assistReady(i)))return;
 assistStep=i+1;
 if(i===0){assistPlayersTeams();return}
 if(i===1){assistPatternPage();return}
 if(i===2){tournamentActiveTab='flowchart';render();return}
 if(i===3){koFixturesPage();return}
 if(i===4){startSavedTournament();return}
}
function koFixturesPage(){
 if(!root)return;
 var n=(draw&&draw.entries||[]).length,m=(draw&&draw.matches||[]).length;
 root.innerHTML='<section class="scs-ko-fixtures-step"><article class="scs-ko-fixtures-card"><div class="scs-ko-fixtures-heading"><span class="scs-ko-fixtures-icon" aria-hidden="true">⑂</span><div><small>BRACKET READY</small><h3>'+esc(draw.title||'Tournament')+'</h3></div></div><div class="scs-ko-fixtures-metrics"><div><strong>'+n+'</strong><span>Teams</span></div><div><strong>'+m+'</strong><span>Matches</span></div></div><p class="scs-ko-fixtures-copy">Your confirmed team positions and BYE paths are ready. Generate the match schedule to continue.</p><button type="button" class="scs-ko-generate-button" onclick="SCSTournament.generateKnockoutFixtures()"><span>Generate Fixtures</span><span aria-hidden="true">→</span></button></article></section>';
}
function assistPatternPage(){
 if(!root||readonly)return;
 creationScreenPinned=false;
 if(draw&&draw.matches&&draw.matches.length){editPattern();render();return}
 root.innerHTML='<section class="scs-tm-assist-pattern" style="max-width:720px;margin:auto;padding:14px"></section>';
 editor();
 var panel=root.querySelector('.scs-tm-editor');
 if(panel){var titleField=panel.querySelector('#tmTitle');if(titleField&&!String(draw.title||'').trim()){titleField.value='';titleField.required=true;titleField.placeholder='e.g. Autumn Club Championship'}var total=panel.querySelector('#tmCount'),left=panel.querySelector('#tmLeft'),right=panel.querySelector('#tmRight');var n=draw.entries.length;if(total){total.value=n;total.readOnly=true}if(left&&right){var l=Number(draw.leftCount)||Math.ceil(n/2);if(l>=n)l=Math.ceil(n/2);left.value=l;right.value=n-l}var status=panel.querySelector('#tmSetupStatus');if(status)status.textContent='Name the tournament, then confirm Left + Right equals '+n+' teams.'}
}
function assistConfirmPage(){
 if(!root||readonly)return;
 var n=draw.entries.length,l=Number(draw.leftCount)||Math.ceil(n/2);
 root.innerHTML='<section style="max-width:720px;margin:auto;padding:14px"><div style="background:#1d4ed8;color:white;border-radius:14px;padding:16px"><small>TOURNAMENT ASSIST · STEP 4 OF 4</small><h2>Confirm and Save</h2></div><div class="scs-tm-tournament-dashboard" style="margin-top:14px"><h3>'+esc(draw.title||'Tournament')+'</h3><div class="scs-tm-side-summary"><div><small>LEFT SIDE</small><b>'+l+' Teams</b><em>'+((draw.leftByeIds||[]).length)+' BYEs</em></div><div><small>RIGHT SIDE</small><b>'+(n-l)+' Teams</b><em>'+((draw.rightByeIds||[]).length)+' BYEs</em></div></div><p>'+n+' teams · '+(draw.matches||[]).length+' matches</p><button type="button" class="scs-tm-start-live" onclick="SCSTournament.saveTournament()">✓ Save Tournament</button></div><div style="margin-top:14px"></div></section>';
}
function assistClearPattern(){
 if(readonly||!confirm('Clear the selected pattern and BYE positions? Players and teams will be kept.'))return;
 assistAssignmentsConfirmed=false;draw.assistAssignmentsConfirmed=false;draw.knockoutFixturesGenerated=false;draw.matches=[];draw.leftByeIds=[];draw.rightByeIds=[];byeSelection=null;assistSaved=false;saveAssistDraft();assistStep=2;assistPatternPage();
}
async function assistSaveDraft(){
 if(readonly||!draw)return;
 var msg=root&&(root.querySelector('#scsKoSaveFeedback')||root.querySelector('#scsAssistSaveStatus'));
 var button=root&&root.querySelector('.scs-ko-save-button');
 if(button)button.disabled=true;
 if(msg)msg.textContent='Saving tournament…';
 // A draft is a valid server record from the first player onward. Never
 // finalize it or require fixtures merely to persist progress.
 try{
  if(koMain&&koActiveId){
   draw._scsClientTournamentId=draw._scsClientTournamentId||koActiveId;
   draw._scsKoMainId=koMain.id||null;draw._scsKoMainTitle=koMain.title;draw._scsKoEventId=koActiveId;
  }
  if(typeof window.scsEnsureTournamentClientId==='function')window.scsEnsureTournamentClientId(draw);
  draw.assistDraft=true;
  draw.assistStep=assistStep;
  draw.assistAssignmentsConfirmed=!!assistAssignmentsConfirmed;
  draw.updatedAt=Date.now();
  saveAssistDraft();
  // The original confirmed save path uses the same server API. Use it for
  // incomplete drafts too, without changing the active page or setup state.
  if(typeof window.dbSaveTournamentState!=='function')throw Error('Server saving is unavailable');
  var id=await window.SCSTournamentStore.save('knockout',draw);
  if(!id)throw Error('Server did not confirm the save');
  draw._scsCloudTournamentId=id;
  saveAssistDraft();
  if(msg)msg.textContent='Saved to server ✓';
 }catch(e){
  saveAssistDraft();
  if(msg)msg.textContent='Saved on this device · Server sync pending';
  console.warn('Knockout draft cloud save:',e);
 }finally{if(button)button.disabled=false}
}
async function assistCloseStep(){
 if(readonly||assistSaved){close();return}
 // Pattern preview is already live. Validate and commit its selected BYE layout
 // when closing the step, rather than requiring a redundant Review button.
 if(assistStep===2&&byeSelection){
  if(byeSelection.leftSelected.length===byeSelection.needLeft&&byeSelection.rightSelected.length===byeSelection.needRight){
   await confirmByeSelection();
  }
  assistBack();
  return;
 }
 if(!assistStep){close();return}
 // Step readiness is derived from actual tournament data, not the close action.
 // In step 3, confirming is automatic only if the pattern and all teams are valid.
 if(assistStep===3&&assistReady(1)&&assistReady(2)){
  assistAssignmentsConfirmed=true;
  if(draw)draw.assistAssignmentsConfirmed=true;
 }
 // Preserve incomplete work. Never finalize a tournament just by leaving a step.
 assistBack();
}
function assistBack(){saveAssistDraft();assistStep=0;byeSelection=null;assistIndex()}
function bindKoScoreCards(){if(!root)return;root.querySelectorAll('[data-ko-completed-card],[data-ko-court-card]').forEach(function(card){function open(){var id=Number(card.dataset.koCompletedCard||card.dataset.koCourtCard);if(card.hasAttribute('data-ko-completed-card')){openMatchScore(id,false);return}var g=window.SCSCourtCenter&&SCSCourtCenter.tournamentGame&&SCSCourtCenter.tournamentGame(id);if(g&&g.score_status==='scored'&&g.score){openMatchScore(id)}else if(g&&g.started_at){if(window.SCSScoring)SCSScoring.open()}else startCourtMatch(id)}card.addEventListener('click',function(e){if(!e.target.closest('button,a,input,select'))open()});card.addEventListener('keydown',function(e){if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open()}})})}
function render(){if(!root)return;if(!readonly&&!assistSaved)saveAssistDraft();if(!readonly&&assistStep===1){assistPlayersTeams();return}if(!readonly&&assistStep===2&&!byeSelection){assistPatternPage();return}if(!readonly&&assistStep===3&&(!draw||!draw.matches||!draw.matches.length)){assistPatternPage();return}if(!readonly&&!assistSaved&&assistStep===0){assistIndex();return}var retainedEntryPopup=root.querySelector(".scs-tm-entry-modal");if(retainedEntryPopup)retainedEntryPopup.remove();ensure();if(!readonly&&!byeSelection&&(creationScreenPinned||!draw.matches.length)){root.innerHTML='<div class="scs-tm-head"><div><small class="scs-tm-flow-kicker">KNOCKOUT · SETUP</small><h2>Knockout</h2></div><button type="button" onclick="SCSTournament.close()">Close</button></div><div class="scs-tm-one-card"><h3>Create Tournament</h3><p>Choose how to create the knockout bracket.</p><div class="scs-tm-import-actions"><button type="button" class="scs-tm-primary" onclick="SCSTournament.pickImage()">Import Image</button><button type="button" onclick="SCSTournament.manualCreate()">Create Manually</button></div><input id="scsTmSinglePhoto" type="file" accept="image/*" hidden><div id="scsTmSingleStatus" role="status"></div></div>'+savedTournamentCard();var input=root.querySelector('#scsTmSinglePhoto');input.onchange=function(){var f=input.files&&input.files[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>18*1024*1024){root.querySelector('#scsTmSingleStatus').textContent='Select an image under 18 MB.';return}if(scanImage&&scanImage.startsWith('blob:'))URL.revokeObjectURL(scanImage);scanImage=URL.createObjectURL(f);scanRecognition=null;draw=init();showImportedPhoto()};return}var livePage=draw.livePage===true||draw.live===true;var patternEditable=!readonly&&draw.matches.length&&!byeSelection&&!tournamentStarted()&&!livePage;var normalSummary=!byeSelection&&draw.matches.length&&!(assistStep===3&&!livePage)?'<div class="scs-tm-tournament-dashboard"><div class="scs-tm-tournament-title"><span class="scs-tm-kicker">KNOCKOUT · '+(livePage?'LIVE TOURNAMENT':'ASSIST · STEP 3 OF 5')+'</span><h2>'+esc(draw.title||'Tournament')+'</h2><span class="scs-tm-pattern-state">'+(livePage?(draw.live===true?'Tournament in progress':'Ready to start tournament'):(patternEditable?'Review the bracket, then save the tournament':'Tournament pattern locked'))+'</span></div><div class="scs-tm-side-summary"><div><small>LEFT SIDE</small><b>'+Number(draw.leftCount||Math.ceil(draw.entries.length/2))+' Teams</b><em>'+((draw.leftByeIds||[]).length)+' '+(((draw.leftByeIds||[]).length)===1?'BYE':'BYEs')+'</em></div><div><small>RIGHT SIDE</small><b>'+Number(draw.entries.length-(draw.leftCount||Math.ceil(draw.entries.length/2)))+' Teams</b><em>'+((draw.rightByeIds||[]).length)+' '+(((draw.rightByeIds||[]).length)===1?'BYE':'BYEs')+'</em></div></div><div class="scs-tm-dashboard-actions">'+(livePage&&!readonly?'<button type="button" data-ko-save-progress onclick="SCSTournament.saveProgressNow()">Save Tournament</button><span data-ko-save-progress-status role="status" aria-live="polite"></span>':'')+(livePage?'':(patternEditable?'<button type="button" class="scs-tm-edit-pattern" onclick="SCSTournament.editPattern()">✎ <span>Edit Pattern</span></button>':''))+'</div></div>':'';var assistReturn='';var oldBracketScroll=root.querySelector('#scsTmScroll');if(oldBracketScroll)bracketScrollState={left:oldBracketScroll.scrollLeft,top:oldBracketScroll.scrollTop};root.innerHTML=assistReturn+(byeSelection?patternEditorCard():normalSummary)+(readonly||assistStep===3||assistStep===2?'':tournamentPoolCard()+tournamentTeamsCard())+'<div class="scs-tm-workspace"'+(draw.live===true?' data-live-tournament="true"':'')+'>'+(assistStep===3&&!readonly?'<div class="scs-tm-swap-toolbar"><span id="scsTmSwapStatus" role="status">Tap a team to select it for swapping.</span><button id="scsTmSwapUndo" type="button" onclick="SCSTournament.undoTeamSwap()"'+(swapUndo?'':' hidden')+'>Undo Swap</button></div>':'')+(scanImage?'<aside class="scs-tm-reference"><strong>Original photo</strong><img src="'+scanImage+'" alt="Original tournament bracket"></aside>':'')+'<main class="scs-tm-main">'+(byeSelection?'<div class="scs-tm-pattern-preview-heading"><strong>Pattern preview · Left and Right to Center</strong><span>Review the BYE positions and connections before approving this pattern.</span></div>':'')+diagram()+'</main></div>'+(!byeSelection&&livePage?(readonly&&!draw.live?spectatorMatchList():(draw.live===true?liveTournamentPanel():tournamentStartPanel())):'');if(retainedEntryPopup)root.appendChild(retainedEntryPopup);requestAnimationFrame(function(){arrangeBracketControls();hydrateTournamentPlayerCards();if(byeSelection){fit()}else if(!bracketViewInitialized){fit();bracketViewInitialized=true}else{applyZoom();var restored=root.querySelector('#scsTmScroll');if(restored&&bracketScrollState){restored.scrollLeft=bracketScrollState.left;restored.scrollTop=bracketScrollState.top}}if(!isReferenceDraw())wires();bindGestures();organizeTournamentTabs();hydrateTournamentPlayerCards();bindKoScoreCards();swapDecorate()})}
async function saveTournament(){if(!draw||!String(draw.title||'').trim()||String(draw.title).trim().toLocaleLowerCase()==='tournament'){alert('Enter a specific tournament name before saving.');return}if(!assistReady(3)){alert('Confirm team assignments in Step 3 before saving.');return}if(!draw.matches||!draw.matches.length){alert('Create the knockout bracket first.');return}var previous=draw.live;var previousPage=draw.livePage;draw.live=false;draw.livePage=false;draw.assistFinalized=true;try{if(saveFn)await saveFn(draw);await localTournamentSave(draw);await koSaveCloudNow(draw);assistSaved=true;try{localStorage.removeItem(koDraftKey())}catch(e){}assistStep=0;selected=null;swapEntryId=null;if(koMain){koShowHome()}else assistIndex();}catch(e){draw.live=previous;draw.livePage=previousPage;draw.assistFinalized=false;alert(e.message||'Could not save tournament.')}}
async function startLive(){return saveTournament()}
function pickImage(){var input=root&&root.querySelector('#scsTmSinglePhoto');if(input)input.click()}
function showImportedPhoto(){creationScreenPinned=false;if(!root||!scanImage)return;zoom=1;root.innerHTML='<div class="scs-tm-head"><h2>Tournament</h2><button type="button" onclick="SCSTournament.close()">Close</button></div><div class="scs-tm-one-card scs-tm-image-card"><h3>Imported tournament image</h3><p>Review the original bracket. Pinch with two fingers to zoom, or drag to move it.</p><div class="scs-tm-zoom-bar"><button type="button" onclick="SCSTournament.zoomBy(.8)" aria-label="Zoom out">−</button><span id="scsTmZoomLabel">100%</span><button type="button" onclick="SCSTournament.zoomBy(1.25)" aria-label="Zoom in">+</button><button type="button" onclick="SCSTournament.fit()">Fit</button></div><div class="scs-tm-scroll" id="scsTmScroll"><div class="scs-tm-stage" id="scsTmStage"><div class="scs-tm-import-chart" id="scsTmChart"><img id="scsTmImportedImage" src="'+scanImage+'" alt="Imported tournament bracket"></div></div></div><div class="scs-tm-import-actions"><button type="button" class="scs-tm-primary" onclick="SCSTournament.createImageFlow()">Create Flow From This Image</button><button type="button" onclick="SCSTournament.renderHome()">Choose another image</button></div><p class="scs-tm-import-note">SCS detects Total, Left, Right and BYE positions from the image, then sends only those values to the same manual tournament generator.</p></div>';var image=root.querySelector('#scsTmImportedImage');image.onload=function(){fit()};requestAnimationFrame(function(){bindGestures();if(image.complete&&image.naturalWidth)fit()})}
/* V112: Round-major numbering, preserving all winner/loser links and BYE structure. */
function numberMatchesByRound(t){
  if(!t||!Array.isArray(t.matches)||t.results&&Object.keys(t.results).length||t.live)return t;
  var original=t.matches.slice(), ordered=original.slice().sort(function(a,b){
    if(!!a.final!==!!b.final)return a.final?1:-1;
    if(!!a.third!==!!b.third)return a.third?1:-1;
    return (Number(a.round)||1)-(Number(b.round)||1)||
      ({left:0,right:1,center:2}[a.side]||0)-({left:0,right:1,center:2}[b.side]||0)||Number(a.id)-Number(b.id);
  }),map={};
  ordered.forEach(function(m,i){map[m.id]=i+1});
  original.forEach(function(m){['a','b'].forEach(function(k){var v=m[k];if(typeof v==='string'&&/^[WL]\d+$/.test(v)){var n=map[Number(v.slice(1))];if(n)m[k]=v.charAt(0)+n}});m.id=map[m.id]});
  t.matches=ordered;
  return t;
}
function playerKeysForMatch(m){var info=m&&matchInfo(m.id);return info?splitTeam(info.a).players.concat(splitTeam(info.b).players).map(function(n){return String(n).trim().toLowerCase()}).filter(Boolean):[]}
function latestCompletedPlayerKeys(games){
 var completed=(games||[]).filter(function(g){return g&&g.court_center_status==='approved'}).slice().sort(function(a,b){var at=Date.parse(a.approved_at||a.completed_at||0)||0,bt=Date.parse(b.approved_at||b.completed_at||0)||0;return bt-at});
 var last=completed[0];return new Set(last?(last.pair1||[]).concat(last.pair2||[]).map(function(n){return String(n).trim().toLowerCase()}):[])
}
function matchNeedsRest(m,recent){return !!(recent&&recent.size&&playerKeysForMatch(m).some(function(n){return recent.has(n)}))}
function playableTournamentMatches(){
  if(!draw||!draw.live||!window.SCSCourtCenter||!SCSCourtCenter.liveState)return [];
  var games=SCSCourtCenter.liveState().games||[],assigned=new Set(games.filter(function(g){return g.tournament_match!=null}).map(function(g){return Number(g.tournament_match)}));
  var busyNames=new Set();games.filter(function(g){return g.court_center_status!=='approved'}).forEach(function(g){(g.pair1||[]).concat(g.pair2||[]).forEach(function(n){busyNames.add(String(n).trim().toLowerCase())})});
  var recent=latestCompletedPlayerKeys(games);
  return draw.matches.filter(function(m){if(assigned.has(Number(m.id))||draw.results[m.id])return false;var x=matchInfo(m.id);if(!x)return false;var a=splitTeam(x.a).players,b=splitTeam(x.b).players,v=a.concat(b).map(function(n){return String(n).trim().toLowerCase()});return a.length===2&&b.length===2&&new Set(v).size===4&&!v.some(function(n){return busyNames.has(n)})&&!/^(Winner|Loser) of |^Entry \d+$/.test(x.a)&&!/^(Winner|Loser) of |^Entry \d+$/.test(x.b)}).sort(function(a,b){return Number(matchNeedsRest(a,recent))-Number(matchNeedsRest(b,recent))||Number(matchDisplayNumber(a.id))-Number(matchDisplayNumber(b.id))});
}
var autoAssigning=false;
// V127: court assignment is exclusively manual; never auto-allocate.
async function autoAssignTournament(){return;}
function setBracketHeight(value){
 var h=Math.max(260,Math.min(1100,Number(value)||520));
 try{localStorage.setItem('scsTournamentBracketHeight',String(h))}catch(e){}
 var scroll=root&&root.querySelector('.scs-tm-main #scsTmScroll');
 if(scroll)scroll.style.setProperty('height',h+'px','important');
 var output=root&&root.querySelector('#scsTmHeightValue');if(output)output.textContent=h+'px';
}
function arrangeBracketControls(){
 if(!root)return;
 var main=root.querySelector('.scs-tm-main'),scroll=main&&main.querySelector('#scsTmScroll'),toolbar=main&&main.querySelector('.scs-tm-zoom-bar');
 if(!scroll||!toolbar||main.querySelector('.scs-tm-bracket-shell'))return;
 var shell=document.createElement('div');shell.className='scs-tm-bracket-shell';
 toolbar.parentNode.insertBefore(shell,toolbar);shell.appendChild(toolbar);shell.appendChild(scroll);
 var h=520;try{h=Number(localStorage.getItem('scsTournamentBracketHeight'))||520}catch(e){}
 h=Math.max(260,Math.min(1100,h));
 var control=document.createElement('label');control.className='scs-tm-height-control';
 control.innerHTML='Bracket height <input type="range" min="260" max="1100" step="20" value="'+h+'" oninput="SCSTournament.setBracketHeight(this.value)"><output id="scsTmHeightValue">'+h+'px</output>';
 shell.insertBefore(control,scroll);setBracketHeight(h);
}

async function commitDraw(next,scrollToBracket){
  /* V94: one durable commit path for every tournament creation route.
     UI state is changed only after the configured persistence callback succeeds.
     This removes the old image-only `save()` call and prevents navigation/clear
     changes from silently breaking Create Flow From This Image again. */
  if(!next)throw Error('Tournament flow was not created.');
  numberMatchesByRound(next);
  if(saveFn)await saveFn(next);
  draw=next;selected=null;swapEntryId=null;zoom=1;render();
  if(scrollToBracket)requestAnimationFrame(function(){var main=root&&root.querySelector('.scs-tm-main');if(main)main.scrollIntoView({behavior:'smooth',block:'start'})});
  return next;
}
async function createImageFlow(){creationScreenPinned=false;if(!root||!scanImage)return;var btn=root.querySelector('.scs-tm-image-card .scs-tm-primary');if(btn){btn.disabled=true;btn.textContent='Recognizing bracket…'}try{scanRecognition=await analyzeBracketImage(scanImage);draw=init();draw.entries=Array.from({length:scanRecognition.total},function(_,i){return {id:i+1,name:'Entry '+(i+1)}});draw.leftCount=scanRecognition.left;editor();requestAnimationFrame(function(){var e=root&&root.querySelector('.scs-tm-editor');if(e)e.scrollIntoView({behavior:'smooth',block:'start'})})}catch(e){if(btn){btn.disabled=false;btn.textContent='Create Flow From This Image'}alert((e&&e.message?e.message:'Could not recognize bracket.')+' You can still use Create Manually.')}
}
async function buildImageFlow(){if(!root||!scanImage)return;var n=Number(root.querySelector('#tmImgCount').value),l=Number(root.querySelector('#tmImgLeft').value),r=Number(root.querySelector('#tmImgRight').value);if(!Number.isInteger(n)||l+r!==n)return;try{var next=generateCustomTwoSided(n,l,[],[],'Imported Tournament');next.imageReference=true;await commitDraw(next,true)}catch(e){alert(e&&e.message?e.message:'Could not create bracket.')}}
function backToImportedImage(){showImportedPhoto()}
function manualCreate(){creationScreenPinned=false;scanImage=null;scanRecognition=null;assistStep=1;render();editor()}
function edit(){creationScreenPinned=false;editor()}
function editPattern(){
  if(readonly||!draw||!draw.matches.length)return;
  if(tournamentStarted()){alert('Tournament Pattern is locked because a match has already started.');return}
  var n=draw.entries.length,l=Number(draw.leftCount||Math.ceil(n/2)),r=n-l,title=draw.title||'Tournament';
  var needL=firstRoundByeNeed(l),needR=firstRoundByeNeed(r),leftIds=Array.from({length:l},function(_,i){return i+1}),rightIds=Array.from({length:r},function(_,i){return l+i+1});
  var patterns=buildByePatterns(leftIds,rightIds,needL,needR);
  if(!patterns.left.length||!patterns.right.length){alert('SCS could not build a valid balanced Tournament Pattern for these side counts.');return}
  function key(a){return (a||[]).slice().map(Number).sort(function(x,y){return x-y}).join(',')}
  var lk=key(draw.leftByeIds),rk=key(draw.rightByeIds),lc=draw.leftBranchCut,rc=draw.rightBranchCut;
  var li=patterns.left.findIndex(function(p){return key(p.byes)===lk&&(lc==null||Number(lc)===Number(p.cut))});
  var ri=patterns.right.findIndex(function(p){return key(p.byes)===rk&&(rc==null||Number(rc)===Number(p.cut))});
  if(li<0)li=0;if(ri<0)ri=0;
  byeSelection={total:n,leftCount:l,needLeft:needL,needRight:needR,leftSelected:[],rightSelected:[],leftPatterns:patterns.left,rightPatterns:patterns.right,leftIndex:li,rightIndex:ri,patternMode:'left',title:title,names:draw.entries.map(function(e){return e.name||('Entry '+e.id)}),imageReference:!!draw.imageReference};
  byeSelection.sourceDraw=JSON.parse(JSON.stringify(draw));
  applyCurrentByePattern();
}
function renderHome(){scanImage=null;scanRecognition=null;creationScreenPinned=true;render()}
function cancelEditor(){var e=root&&root.querySelector('.scs-tm-editor');if(e)e.remove();render()}

function open(data,ro,onSave,onAssign,onClear){if(data==='new'){window.ScsApi.events.requestCreate({onCreate:function(name){koMain={id:koId(),title:name,events:[],activeEventId:null};koActiveId=null;koSaveMain();koShowHome()},onCancel:function(){if(typeof window.scsReturnToTournamentParent==='function')window.scsReturnToTournamentParent()}});return}if(!ro&&!data){if(!koReadMain()&&!localStorage.getItem(LOCAL_TOURNAMENT_KEY)){window.ScsApi.events.requestCreate({onCreate:function(name){koMain={id:koId(),title:name,events:[],activeEventId:null};koSaveMain();koShowHome()},onCancel:function(){if(typeof window.scsReturnToTournamentParent==='function')window.scsReturnToTournamentParent()}});return}koMainStart();koShowHome();return}tournamentActiveTab='main';assistStep=0;assistSaved=!!(data&&data.assistFinalized);draw=ro&&data?JSON.parse(JSON.stringify(data)):(data||(restoreAssistDraft()||init()));assistAssignmentsConfirmed=!!(assistAssignmentsConfirmed||draw.assistAssignmentsConfirmed);draw.assistAssignmentsConfirmed=assistAssignmentsConfirmed;creationScreenPinned=!data||!data.matches||!data.matches.length;bracketViewInitialized=false;bracketScrollState=null;ensure();readonly=!!ro;saveFn=onSave||localTournamentSave;assignFn=onAssign;clearFn=onClear||localTournamentClear;selected=null;zoom=1;root=document.getElementById('scsTournamentOverlay');root.hidden=false;render();observeAssistHeader()}

async function clearTournament(){
  if(readonly)return;
  if(!confirm('Clear this tournament?\n\nThis will remove the bracket, tournament teams, tournament match assignments/results and tournament progress. Manual Court Center matches and registered players are not affected.'))return;
  try{
    /* V94: clearing an image-created tournament must clear both the Court Center
       tournament links and the persisted draw.  Previously clearFn deleted the
       server tournament, but the image flow could leave the overlay holding its
       old draw/reference state.  Re-save one fresh empty tournament after the
       linked matches are cleared so manual and image-created tournaments return
       through exactly the same clean state. */
    if(clearFn)await clearFn();
    var fresh=init();
    if(saveFn)await saveFn(fresh);
    draw=fresh;selected=null;swapEntryId=null;
    if(scanImage&&scanImage.startsWith('blob:')){try{URL.revokeObjectURL(scanImage)}catch(_){}}
    scanImage=null;zoom=1;render();
  }catch(e){alert(e.message||'Could not clear tournament.')}
}
function close(){if(assistHeaderObserver){assistHeaderObserver.disconnect();assistHeaderObserver=null}if(koMain&&draw&&draw.matches&&draw.matches.length&&!readonly)koSyncEvent(draw);saveAssistDraft();if(root)root.hidden=true;root=null;if(window.scsTournamentReturnPage&&typeof window.scsReturnToTournamentParent==='function')window.scsReturnToTournamentParent()}function load(data){draw=data||init();ensure()}function select(id){if(koScoreForMatch(id)){openMatchScore(id,!readonly);return}selected=id;render()}
function editor(){creationScreenPinned=false;if(readonly)return;if(Object.keys(draw.results).length){alert('Approved results must be cleared before changing the draw.');return}var old=root.querySelector('.scs-tm-editor,.scs-tm-import,.scs-tm-review');if(old)old.remove();var current=draw.entries.length||8,left=draw.leftCount||Math.ceil(current/2),right=current-left;var el=document.createElement('section');el.className='scs-tm-editor';el.innerHTML='<div class="scs-tm-step">STEP 1 · SIDE ENTRIES</div><h3>Create tournament structure</h3><p class="scs-tm-editor-help">'+(scanImage?'Reference image loaded. Use the same SCS creator below; player names are ignored at this stage.':'Set the total teams. SCS splits the sides evenly and creates valid BYE positions automatically.')+'</p><div class="scs-tm-form-grid scs-tm-compact-grid"><label class="scs-tm-title-field">Tournament title<input id="tmTitle" value="'+esc(draw.title||'Tournament')+'"></label><label class="scs-tm-total-field">Total teams<input id="tmCount" type="number" min="4" max="64" value="'+current+'"></label><div class="scs-tm-side-row"><label>Left side<input id="tmLeft" type="number" min="1" value="'+left+'"></label><label>Right side<input id="tmRight" type="number" min="1" value="'+right+'"></label></div></div><p id="tmSetupStatus" class="scs-tm-note"></p><div class="scs-tm-import-actions"><button type="button" class="scs-tm-primary" id="tmNextByes" onclick="SCSTournament.setupByes()">Build Bracket</button>'+'</div>';var workspace=root.querySelector('.scs-tm-workspace');if(workspace)root.insertBefore(el,workspace);else root.appendChild(el);function update(){var n=Number(el.querySelector('#tmCount').value),l=Number(el.querySelector('#tmLeft').value),r=Number(el.querySelector('#tmRight').value),valid=Number.isInteger(n)&&n>=4&&n<=64&&Number.isInteger(l)&&l>=1&&Number.isInteger(r)&&r>=1&&l+r===n,needL=valid?firstRoundByeNeed(l):0,needR=valid?firstRoundByeNeed(r):0;el.querySelector('#tmSetupStatus').textContent=valid?'Left '+l+' · '+needL+' bye(s) · Right '+r+' · '+needR+' bye(s).':'Left + Right must equal Total teams.';el.querySelector('#tmNextByes').disabled=!valid}el.querySelector('#tmCount').addEventListener('input',function(){var n=Number(this.value);if(Number.isInteger(n)&&n>=4&&n<=64){var l=Math.ceil(n/2);el.querySelector('#tmLeft').value=l;el.querySelector('#tmRight').value=n-l}update()});['#tmLeft','#tmRight'].forEach(function(q){el.querySelector(q).addEventListener('input',update)});update()}
function setupByes(){
  var panel=root&&root.querySelector('.scs-tm-editor');if(!panel)return;
  var n=Number(panel.querySelector('#tmCount').value),l=Number(panel.querySelector('#tmLeft').value),r=Number(panel.querySelector('#tmRight').value),title=panel.querySelector('#tmTitle').value.trim().slice(0,120);
  if(!title||title.toLocaleLowerCase()==='tournament'){alert('Enter a specific tournament name before choosing the pattern.');panel.querySelector('#tmTitle').focus();return}
  if(!Number.isInteger(n)||n<4||n>64||!Number.isInteger(l)||!Number.isInteger(r)||l<1||r<1||l+r!==n){alert('Left + Right must equal Total teams.');return}
  var needL=firstRoundByeNeed(l),needR=firstRoundByeNeed(r),names=Array.from({length:n},function(_,i){return draw.entries[i]&&draw.entries[i].name||'Entry '+(i+1)});
  var rec=scanRecognition&&scanRecognition.total===n&&scanRecognition.left===l&&scanRecognition.right===r?scanRecognition:null;
  var leftIds=Array.from({length:l},function(_,i){return i+1}),rightIds=Array.from({length:r},function(_,i){return l+i+1}),patterns=buildByePatterns(leftIds,rightIds,needL,needR);
  if(!patterns.left.length||!patterns.right.length){alert('SCS could not build a valid balanced BYE pattern for these side counts.');return}
  var leftIndex=0,rightIndex=0;if(rec){var lk=(rec.leftByeIds||[]).slice().sort(function(a,b){return a-b}).join(','),rk=(rec.rightByeIds||[]).slice().sort(function(a,b){return a-b}).join(',');var lf=patterns.left.findIndex(function(p){return (p.byes||[]).slice().sort(function(a,b){return a-b}).join(',')===lk&&(rec.leftBranchCut==null||Number(rec.leftBranchCut)===Number(p.cut))}),rf=patterns.right.findIndex(function(p){return (p.byes||[]).slice().sort(function(a,b){return a-b}).join(',')===rk&&(rec.rightBranchCut==null||Number(rec.rightBranchCut)===Number(p.cut))});if(lf>=0)leftIndex=lf;if(rf>=0)rightIndex=rf}
  byeSelection={total:n,leftCount:l,needLeft:needL,needRight:needR,leftSelected:[],rightSelected:[],leftPatterns:patterns.left,rightPatterns:patterns.right,leftIndex:leftIndex,rightIndex:rightIndex,patternMode:'left',title:title,names:names,imageReference:!!scanImage};
  byeSelection.sourceDraw=JSON.parse(JSON.stringify(draw));
  applyCurrentByePattern();
}
async function confirmByeSelection(){
  if(!byeSelection)return;
  if(byeSelection.leftSelected.length!==byeSelection.needLeft||byeSelection.rightSelected.length!==byeSelection.needRight){alert('Select the required BYE positions on both sides.');return}
  var next=generateCustomTwoSided(byeSelection.total,byeSelection.leftCount,byeSelection.leftSelected,byeSelection.rightSelected,byeSelection.title,byeSelection.names,byeSelection.leftCut,byeSelection.rightCut);next.imageReference=byeSelection.imageReference;
  // The pattern generator creates name-only entries. Carry the original player
  // identities and tournament roster into the new bracket by stable entry slot.
  // Only the bracket positions/matches should be regenerated.
  if(byeSelection.sourceDraw||draw){
   var originalDraw=byeSelection.sourceDraw||draw;
   var oldEntries=Array.isArray(originalDraw.entries)?originalDraw.entries:[];
   next.entries=next.entries.map(function(entry,i){
    var previous=oldEntries.find(function(e){return Number(e.id)===Number(entry.id)})||oldEntries[i];
    return previous?Object.assign({},previous,{id:entry.id}):entry;
   });
   if(Array.isArray(originalDraw.selectedPlayerDetails))
    next.selectedPlayerDetails=JSON.parse(JSON.stringify(originalDraw.selectedPlayerDetails));
   ['selectedClubIds','selectedClubs','clubId','mainClubId','playerPool','allPlayers'].forEach(function(k){
    if(originalDraw[k]!==undefined)next[k]=JSON.parse(JSON.stringify(originalDraw[k]));
   });
  }
  preserveTeamPlayerDetails(next);
  byeSelection=null;if(assistStep===2){draw=next;assistAssignmentsConfirmed=false;draw.assistAssignmentsConfirmed=false;draw.knockoutFixturesGenerated=false;selected=null;swapEntryId=null;assistStep=3;saveAssistDraft();render();return}assistStep=3;await commitDraw(next,!!scanImage);
}
function cancelByeSelection(){byeSelection=null;if(assistStep===2){assistPatternPage();return}assistStep=1;render();editor()}
async function createManualTemplate(){return setupByes()}
function review(){var panel=root.querySelector('.scs-tm-editor');if(!panel)return;var count=Number(panel.querySelector('#tmCount').value),title=panel.querySelector('#tmTitle').value.trim(),third=panel.querySelector('#tmThird').checked;if(!Number.isInteger(count)||count<2||count>256){alert('Enter between 2 and 256 entries.');return}var proposed=emptyBracket(count,title,third);proposed.layout=panel.querySelector('#tmLayout').value;var form=document.createElement('section');form.className='scs-tm-review';form.innerHTML='<div class="scs-tm-step">STEP 2 · VERIFY AGAINST PHOTO</div><h3>Check the bracket connections</h3><p>All player and club fields remain empty. Change the match sources to match the photo, including byes. No predefined chart is loaded. Set the two sources for each match from the image; SCS validates the resulting flow before saving.</p>'+(scanImage?'<img class="scs-tm-original" src="'+scanImage+'" alt="Original bracket">':'')+'<div class="scs-tm-review-grid"><div><h4>Entry positions ('+count+')</h4>'+proposed.entries.map(function(e){return '<div class="scs-tm-entry-row"><strong>Entry '+e.id+'</strong><span>Player 1: — &nbsp; Player 2: — &nbsp; Club: —</span></div>'}).join('')+'</div><div><h4>Matches ('+proposed.matches.length+')</h4>'+proposed.matches.map(function(m){var options='<option value="">BYE / Empty</option>'+proposed.entries.map(function(e){return '<option value="'+e.id+'">Entry '+e.id+'</option>'}).join('')+proposed.matches.filter(function(other){return other.id<m.id}).map(function(other){return '<option value="W'+other.id+'">Winner of Match '+other.id+'</option><option value="L'+other.id+'">Loser of Match '+other.id+'</option>'}).join('');return '<div class="scs-tm-connection"><strong>Match '+m.id+(m.third?' · Third place':'')+'</strong><label>Position A<select data-match="'+m.id+'" data-side="a">'+options+'</select></label><label>Position B<select data-match="'+m.id+'" data-side="b">'+options+'</select></label></div>'}).join('')+'</div></div><div class="scs-tm-import-actions">'+button('Save empty flowchart','saveScan()')+button('Back','cancelReview()')+'</div><p class="scs-tm-save-status" role="status"></p>';panel.replaceWith(form);form._proposed=proposed;proposed.matches.forEach(function(m){['a','b'].forEach(function(side){var el=form.querySelector('[data-match="'+m.id+'"][data-side="'+side+'"]');if(el)el.value=String(m[side])})})}
async function saveScan(){var form=root&&root.querySelector('.scs-tm-review');if(!form||!form._proposed)return;var next=form._proposed;next.entries.forEach(function(e){e.name=''});next.matches.forEach(function(m){['a','b'].forEach(function(side){var v=form.querySelector('[data-match="'+m.id+'"][data-side="'+side+'"]').value;m[side]=!v?null:/^\d+$/.test(v)?Number(v):v})});var bad=next.matches.find(function(m){return m.a==null||m.b==null||String(m.a)===String(m.b)});if(bad){form.querySelector('.scs-tm-save-status').textContent='Match '+bad.id+' must have exactly two different inputs.';return}var used={};next.matches.forEach(function(m){[m.a,m.b].forEach(function(src){if(typeof src==='string'&&/^W\d+$/.test(src))used[src]=(used[src]||0)+1})});var fork=Object.keys(used).find(function(k){return used[k]>1});if(fork){form.querySelector('.scs-tm-save-status').textContent=fork.replace('W','Winner of Match ')+' cannot feed more than one next match.';return}try{if(saveFn)await saveFn(next);draw=next;render()}catch(e){form.querySelector('.scs-tm-save-status').textContent=e.message||'Could not save tournament'}}
function cancelReview(){var e=root&&root.querySelector('.scs-tm-review');if(e){e.remove();editor()}}
function removeEntry(){alert('Change the entry count in Edit flowchart.')}function entryValue(){return ''}
function scan(){if(readonly||!root)return;var old=root.querySelector('.scs-tm-import');if(old){old.remove();return}var panel=document.createElement('section');panel.className='scs-tm-import';panel.innerHTML='<div class="scs-tm-step">REFERENCE IMAGE</div><h3>Upload the tournament bracket</h3><p>Use the photo to verify the empty flowchart. This version does not guess connections or extract player names.</p><div class="scs-tm-photo-choices"><button type="button" id="scsTmTakePhoto">Take photo</button><button type="button" id="scsTmChoosePhoto">Choose existing photo</button></div><input type="file" accept="image/*" capture="environment" id="scsTmCamera" hidden><input type="file" accept="image/*" id="scsTmPhoto" hidden><div class="scs-tm-preview"></div><div class="scs-tm-import-actions">'+button('Create empty flowchart','applyScan()')+button('Cancel','scan()')+'</div><p id="scsTmScanStatus" role="status"></p>';root.insertBefore(panel,root.querySelector('.scs-tm-workspace'));['Camera','Photo'].forEach(function(type){var btn=panel.querySelector(type==='Camera'?'#scsTmTakePhoto':'#scsTmChoosePhoto'),input=panel.querySelector('#scsTm'+type);btn.onclick=function(){input.click()};input.onchange=function(){var f=input.files&&input.files[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>18*1024*1024){alert('Select an image under 18 MB.');return}if(scanImage&&scanImage.startsWith('blob:'))URL.revokeObjectURL(scanImage);scanImage=URL.createObjectURL(f);panel.querySelector('.scs-tm-preview').innerHTML='<img alt="Original bracket" src="'+scanImage+'">';panel.querySelector('#scsTmScanStatus').textContent='Photo loaded. Create the empty flowchart and verify connections.'}})}
function recognize(){alert('Player and club recognition is reserved for the next step.')}function applyScan(){createImageFlow()}
function example(){alert('Enter teams or import your own photograph; no predefined tournament is loaded.')}
function renderLiveSafe(){
  /* V108: Court Center polls every 2 seconds. Never rebuild the tournament DOM while
     the organizer is typing a late team entry; otherwise mobile Safari loses focus. */
  if(root&&root.querySelector('.scs-tm-entry-modal'))return;
  var a=document.activeElement;
  if(a&&root&&root.contains(a)&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT'))return;
  /* Polling must not rebuild an unchanged live screen. Replacing the DOM every
     two seconds resets the organizer's scroll position and can move a button
     between pointer-down and click on mobile. Only redraw when court state
     actually changed, and preserve the page position across that redraw. */
  var state=window.SCSCourtCenter&&SCSCourtCenter.liveState?SCSCourtCenter.liveState():null;
  var round=state&&state.tournament?state:null;
  var signature='';
  try{signature=JSON.stringify(round&&{t:round.tournament&&round.tournament.id,c:round.tournament&&round.tournament.courtCount,g:(round.games||[]).map(function(g){return [g.ccid,g.tournament_match,g.court,g.court_center_status,g.score_status,g.score,g.winner,g.started_at,g.completed_at]})})}catch(_){signature=String(Date.now())}
  if(!lastLiveRenderSignature){lastLiveRenderSignature=signature;return}
  if(signature===lastLiveRenderSignature)return;
  lastLiveRenderSignature=signature;
  if(round&&Array.isArray(round.games)&&!readonly){var changed=false;round.games.forEach(function(g){if(g&&g.tournament_match!=null&&g.score&&g.score.finished===true)changed=koCaptureMatchScore(Number(g.tournament_match),g)||changed});if(changed)localTournamentSave(draw)}
  var y=window.scrollY||document.documentElement.scrollTop||0;
  render();
  requestAnimationFrame(function(){window.scrollTo(0,y)});
}
function liveTab(name){if(!draw)return;draw.liveTab=name;render();}
function approveLive(id){var g=window.SCSCourtCenter&&SCSCourtCenter.tournamentGame&&SCSCourtCenter.tournamentGame(id);if(!g)return;if(g.score_status!=='scored'){alert('Complete the score first.');return;}koCaptureMatchScore(id,g);localTournamentSave(draw);if(window.SCSCourtCenter&&SCSCourtCenter.approve)SCSCourtCenter.approve(g.ccid).then(function(){draw.liveTab='completed';localTournamentSave(draw);render();});}
function chooseCourt(n){draw.assigningCourt=Number(n)||0;draw.liveTab='waiting';render()}
async function queueMatch(id){
 if(readonly||!draw||!draw.live||!draw.knockoutFixturesGenerated)return;
 var m=getMatch(id),info=matchInfo(id);
 if(!m||!info||draw.results[id]||/^(Winner|Loser) of /.test(info.a)||/^(Winner|Loser) of /.test(info.b)||/^Entry \\d+$/.test(info.a)||/^Entry \\d+$/.test(info.b))return;
 var old=Array.isArray(draw.matchCenterQueue)?draw.matchCenterQueue.slice():[];
 draw.matchCenterQueue=Array.from(new Set(old.concat(Number(id))));
 try{
  await localTournamentSave(draw);
  if(saveFn&&saveFn!==localTournamentSave)await saveFn(draw);
  await localTournamentSave(draw);
  render();
 }catch(e){draw.matchCenterQueue=old;alert(e.message||'Could not send match to Match Center.')}
}
function assign(id){
 if(readonly||!draw)return;
 var info=matchInfo(id),cc=window.SCSCourtCenter;if(!info||!cc||!cc.assignTournamentMatch){alert('Tournament courts unavailable.');return;}
 var state=cc.liveState(),games=state.games||[],current=games.find(function(g){return Number(g.tournament_match)===Number(id)});
 if(current&&(current.started_at||current.score||current.score_status)){alert('This match has already started.');return;}
 var recent=latestCompletedPlayerKeys(games),target=getMatch(id),alternatives=playableTournamentMatches();
 if(target&&matchNeedsRest(target,recent)&&alternatives.some(function(m){return !matchNeedsRest(m,recent)})){alert('Give these players one match of rest. Assign another ready match first.');return;}
 draw.assigningMatch=Number(id);
 var count=Math.max(1,Number(state.courtCount)||Number(draw.numCourts)||1);
 SCSCourtAssignmentPopup.open({title:'Match '+matchDisplayNumber(id),courts:Array.from({length:count},function(_,i){return {number:i+1,occupied:games.some(function(g){return Number(g.court)===i+1&&g.court_center_status!=='approved'})}}),onChoose:function(n){return selectAssignmentCourt(n)}});
}
function cancelCourtSelection(){SCSCourtAssignmentPopup.close();if(draw){draw.assigningMatch=0;render()}}
function quickAssign(id){var cc=window.SCSCourtCenter,info=matchInfo(id);if(!cc||!info){alert('Tournament courts unavailable.');return}var free=cc.freeCourts?cc.freeCourts():[];draw.assigningMatch=Number(id);if(free.length===1){selectAssignmentCourt(free[0]);return}render()}
async function selectAssignmentCourt(court){
 if(!draw||!draw.assigningMatch)return;
 var id=Number(draw.assigningMatch),cc=window.SCSCourtCenter,state=cc.liveState(),games=state.games||[];
 var occupied=games.find(function(g){return Number(g.court)===Number(court)&&g.court_center_status!=='approved'&&Number(g.tournament_match)!==id});
 if(occupied){alert('Court is occupied. Select a free court.');return false;}
 try{var ok=await cc.assignTournamentMatch(id,matchInfo(id),Number(court));if(ok){draw.assigningMatch=0;render();return true}return false}
 catch(e){alert(e.message||'Court assignment failed.');return false;}
}

async function changeLiveCourts(delta){
 if(!draw)return;
 var cc=window.SCSCourtCenter;
 var state=cc&&cc.liveState?cc.liveState():null;
 var current=Math.max(1,Number(state&&state.tournament&&state.courtCount)||Number(draw.numCourts)||1);
 var next=Math.max(1,Math.min(20,current+Number(delta||0)));
 if(next===current)return;
 if(next<current&&state&&(state.games||[]).some(function(g){return Number(g.court)>next&&g.court_center_status!=='approved'})){
  alert('Move or finish the match on the last court before removing it.');return;
 }
 try{
  /* The tournament's local state is authoritative; restore/create the court session
     instead of silently returning when the previous session is missing. */
  if(cc&&cc.startTournament){
   if(!state||!state.tournament){await cc.startTournament(draw,next)}
   else {var updated=await cc.changeTournamentCourts(next-current);if(!updated) return;}
  }
  draw.numCourts=next;
  await localTournamentSave(draw);
  render();
 }catch(e){alert(e.message||'Unable to change court count.')}
}
function startCourtMatch(id){if(!window.SCSCourtCenter||!SCSCourtCenter.startTournamentMatch){alert('Match Center is still loading.');return}SCSCourtCenter.startTournamentMatch(id).then(function(ok){if(!ok)throw new Error('Match assignment is unavailable. Reopen Match Center and try again.');render();if(window.SCSScoring&&SCSScoring.open)SCSScoring.open();else alert('Scoring is still loading.');}).catch(function(e){alert((e&&e.message)||'Could not start this match.');})}

function approved(id,winner){var info=matchInfo(id);if(!info||winner!==info.a&&winner!==info.b)throw Error('Winner must match a team in the bracket');draw.results[id]={winner:winner,loser:winner===info.a?info.b:info.a};render()}
window.SCSTournament={saveProgressNow:koSaveProgressNow,adoptCloudMaster:koAdoptCloudMaster,adoptCloudEvent:koAdoptCloudEvent,generateKnockoutFixtures:koGenerateFixtures,assistSaveDraft:assistSaveDraft,quickAssign:quickAssign,assistOpen:assistOpen,assistBack:assistBack,assistCloseStep:assistCloseStep,assistPatternPage:assistPatternPage,assistClearPattern:assistClearPattern,assistConfirmPage:assistConfirmPage,assistAddTeam:assistAddTeam,addNextTeam:addNextTeam,assistRemoveTeam:assistRemoveTeam,assistFinishPlayers:assistFinishPlayers,assistConfirmAssignments:assistConfirmAssignments,autoAssignTournament:autoAssignTournament,togglePool:togglePool,setBracketHeight:setBracketHeight,switchTournamentCenterTab:switchTournamentCenterTab,openPlayersManager:openPlayersManager,playersManagerReturned:playersManagerReturned,filterPlayerPool:filterPlayerPool,setPoolPlayer:setPoolPlayer,chooseCourt:chooseCourt,selectAssignmentCourt:selectAssignmentCourt,cancelCourtSelection:cancelCourtSelection,changeLiveCourts:changeLiveCourts,startCourtMatch:startCourtMatch,liveTab:liveTab,approveLive:approveLive,renderLive:renderLiveSafe,init:init,analyzeBracketImage:analyzeBracketImage,generate:generate,generateTwoSided:generateTwoSided,generateCustomTwoSided:generateCustomTwoSided,emptyBracket:emptyBracket,cleanOCR:cleanOCR,splitTeam:splitTeam,removeEntry:removeEntry,load:load,open:open,close:close,pickImage:pickImage,renderHome:renderHome,manualCreate:manualCreate,editPattern:editPattern,setupByes:setupByes,confirmByeSelection:confirmByeSelection,cancelByeSelection,nextByePattern:nextByePattern,setByePatternMode:setByePatternMode,createManualTemplate:createManualTemplate,createImageFlow:createImageFlow,backToImportedImage:backToImportedImage,buildImageFlow:buildImageFlow,select:select,openMatchScore:openMatchScore,koUpdateCompletedScore:koUpdateCompletedScore,entryTap:entryTap,undoTeamSwap:undoTeamSwap,editEntry:editEntry,closeEntryPopup:closeEntryPopup,doneEntry:doneEntry,editEntry:editEntry,saveEntry:saveEntry,fit:fit,zoomBy:zoomBy,edit:edit,editor:editor,review:review,cancelEditor:cancelEditor,scan:scan,example:example,recognize:recognize,applyScan:applyScan,saveScan:saveScan,cancelReview:cancelReview,assign:assign,queueMatch:queueMatch,approved:approved,matchInfo:matchInfo,clearTournament:clearTournament,saveTournament:saveTournament,startLive:startLive,enterSavedTournament:enterSavedTournament,startSavedTournament:startSavedTournament,setTournamentCourts:setTournamentCourts,openCourtCenter:openCourtCenter};
window.SCSTournament.generateCustomTwoSided=generateCustomTwoSided;
window.SCSTournament.switchTournamentTab=switchTournamentTab;
window.SCSTournament.selectKnockoutEvent=function(id){koOpenEvent(id,'flowchart')};
window.SCSTournament.addKnockoutEvent=koAddEvent;
window.SCSTournament.renameKnockout=koRename;
window.SCSTournament.showKnockoutHome=koShowHome;
})();

/* V59: completed winning route remains green through the next match, even when that team loses there. */

/* V59: user-entered left/right split; first-round byes calculated independently as side entries minus the previous power of two. Irregular later rounds advance one source without creating phantom matches. */

/* V60: Clear Tournament resets only the current tournament and its tournament-linked Court Center matches. */

/* V62: BYE-position fix. Selected BYEs retain their actual bracket position on either side; no first/last-position assumption. */
/* V62: BYE skips Round 1 only. Every selected BYE is forced into Round 2 against a Round-1 winner, independent of visual order or side. */

/* V94: Automatic structural BYE knowledge. SCS calculates BYE positions from each side count (4→0, 5→1, 6→2, 7→1, 8→0 and the same nearest-power rule at larger sizes). BYEs always skip Round 1 only and meet a Round-1 winner in Round 2. Users swap teams into fixed BYE positions after flow creation. */

/* V94: structural BYE placement. BYE slots are placed only after complete Round-1 pairs; they can never sit between the two teams of a Round-1 match. */

/* V94: BYE Pattern Slider. The bracket itself is the preview; arrows browse generated valid balanced BYE patterns, with no duplicate mini-bracket previews. */

/* V94: BYE pattern browsing uses Left / Right only. Each side is tuned independently; the combined bracket updates automatically. */

/* V94: Tournament Pattern remains editable until the first match actually starts. Assignment alone does not lock the pattern; scoring/results do. Edit Pattern reopens the same Left/Right pattern browser and preserves team names. */

/* V94: Start Tournament promotes the currently saved setup draw to Live in place. It never opens an empty/image flow or creates a second bracket. */

/* V108: Setup action is Save Tournament. Saving persists the bracket and closes Setup; the saved tournament card is the entry point to Live Tournament. */

/* V108: Live Tournament is one combined screen: Court Center first, fitted live bracket directly below. */

/* V108: A live tournament may start with incomplete Entry placeholders. Only a match whose two teams are complete can be assigned. Unplayed entries remain editable; Court Center polling no longer interrupts player-name typing. */
