/* V37: editable OCR entries and player/club parsing; input-driven knockout draw. OCR reads text; the organizer confirms teams and connections. */
(function(){'use strict';
var assistStep=0,assistSaved=false,draw=null,readonly=false,selected=null,saveFn=null,assignFn=null,clearFn=null,root=null,scanImage=null,scanText='',scanBusy=false,scanRecognition=null,zoom=1,panX=0,panY=0,gesture=null,byeSelection=null;
var LOCAL_TOURNAMENT_KEY='scs_knockout_tournament_v94';
function localTournamentLoad(){try{var x=JSON.parse(localStorage.getItem(LOCAL_TOURNAMENT_KEY)||'null');return x&&x.matches&&x.matches.length?x:null}catch(_){return null}}
function localTournamentSave(d){try{localStorage.setItem(LOCAL_TOURNAMENT_KEY,JSON.stringify(d));return Promise.resolve(d)}catch(e){return Promise.reject(e)}}
function localTournamentClear(){try{localStorage.removeItem(LOCAL_TOURNAMENT_KEY)}catch(_){ }return Promise.resolve()}

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
  var names=byeSelection.names;draw=generateCustomTwoSided(n,l,leftFull,rightFull,byeSelection.title,names,byeSelection.leftCut,byeSelection.rightCut);
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

function init(){return {layout:'ltr',title:'Tournament',entries:[],matches:[],results:{}}}


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
  var teams=draw.entries.length,entryW=170,entryH=54,dot=46,pad=42,rowGap=26,entryGap=44,matchGap=62,finalGap=60;
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
  function entryCard(e){var name=e.name||('Entry '+e.id),tag=readonly?'div':'button',click=readonly?'':' onclick="SCSTournament.entryTap('+e.id+')"',eliminated=Object.keys(draw.results||{}).some(function(k){var r=draw.results[k];return r&&r.loser===name}),bye=(draw.leftByeIds||[]).concat(draw.rightByeIds||[]).indexOf(e.id)>=0,previewSelected=byeSelection&&selectedByeIds().indexOf(e.id)>=0,previewAuto=byeSelection&&draw.previewAutoByeIds&&draw.previewAutoByeIds.indexOf(e.id)>=0,valid=true;if(byeSelection&&!previewSelected){var side=byeSelectionSide(e.id),arr=side==='left'?byeSelection.leftSelected:byeSelection.rightSelected,need=side==='left'?byeSelection.needLeft:byeSelection.needRight,start=side==='left'?1:byeSelection.leftCount+1,count=side==='left'?byeSelection.leftCount:byeSelection.total-byeSelection.leftCount,ids=Array.from({length:count},function(_,i){return start+i});valid=arr.length<need&&!!completeValidByeSet(ids,need,arr.concat([e.id]))}return '<'+tag+' type="button" class="scs-tm-template-entry '+(eliminated?'eliminated':'active')+(previewSelected?' bye bye-selected':previewAuto?' bye-preview':bye?' bye':'')+(byeSelection&&!valid?' bye-invalid':'')+'" data-entry-id="'+e.id+'" style="left:'+entryPos[e.id].x+'px;top:'+entryPos[e.id].y+'px"'+click+'><span class="scs-tm-bracket-entry-content">'+(tournamentEntryPlayers(name)||'<span>'+esc(name)+'</span>')+((byeSelection?previewSelected:bye)?' <small>BYE</small>':'')+'</span></'+tag+'>'}
  function junction(m){var p=positions[m.id];if(!p)return '';var r=draw.results[m.id],g=window.SCSCourtCenter&&window.SCSCourtCenter.tournamentGame&&window.SCSCourtCenter.tournamentGame(m.id),st=r?'completed':g?(g.score_status==='scored'?'completed':g.score_status==='scoring'?'progress':'assigned'):'waiting';return '<button type="button" data-tm-id="'+m.id+'" aria-label="Match '+m.id+'" class="scs-tm-template-junction '+(m.final?'final ':'')+'status-'+st+' '+(selected===m.id?'selected':'')+'" style="left:'+p.x+'px;top:'+p.y+'px" onclick="SCSTournament.select('+m.id+')"><span>'+m.id+'</span></button>'}
  var currentPattern=byeSelection?(byeSelection.patternMode==='right'?(byeSelection.rightPatterns[byeSelection.rightIndex]||{}):(byeSelection.leftPatterns[byeSelection.leftIndex]||{})):null;
  var currentSideCount=byeSelection?(byeSelection.patternMode==='right'?byeSelection.total-byeSelection.leftCount:byeSelection.leftCount):0;
  var currentCut=currentPattern&&currentPattern.cut!=null?Number(currentPattern.cut):Math.ceil(currentSideCount/2);
  var patternSplit=byeSelection?'<small class="scs-tm-pattern-split">Top '+currentCut+' · Bottom '+Math.max(0,currentSideCount-currentCut)+'</small>':'';
  var swapHint=(!byeSelection&&!readonly&&!Object.keys(draw.results||{}).length?'<div class="scs-tm-swap-hint">Before the first match starts: tap one team, then another to swap positions. The bracket structure and BYE positions stay fixed.</div>':'');
  return '<div class="scs-tm-zoom-bar"><button type="button" onclick="SCSTournament.zoomBy(.8)">−</button><span id="scsTmZoomLabel">100%</span><button type="button" onclick="SCSTournament.zoomBy(1.25)">+</button><button type="button" onclick="SCSTournament.fit()">Fit</button><span class="scs-tm-gesture-hint">Pinch with two fingers · Drag to move</span></div>'+swapHint+'<div class="scs-tm-scroll" id="scsTmScroll"><div class="scs-tm-stage" id="scsTmStage"><div class="scs-tm-chart scs-tm-template-chart" id="scsTmChart" style="width:'+width+'px;height:'+height+'px;min-width:'+width+'px;min-height:'+height+'px"><svg class="scs-tm-wires" aria-hidden="true"></svg>'+draw.entries.map(entryCard).join('')+draw.matches.map(junction).join('')+'</div></div></div><div class="scs-tm-details">'+details()+'</div>';
}
function ensure(){if(!draw)draw=init();if(!Array.isArray(draw.matches))draw.matches=[];if(!Array.isArray(draw.entries))draw.entries=[];if(!draw.results)draw.results={}}
function getMatch(id){return draw.matches.find(function(m){return String(m.id)===String(id)})}
function resolve(src){if(src==null)return 'BYE';if(typeof src==='number'){var e=draw.entries.find(function(e){return e.id===src});return e?(e.name||'Entry '+src):'Entry '+src}var type=String(src).charAt(0),id=String(src).slice(1),r=draw.results[id];return r?(type==='L'?r.loser:r.winner):(type==='L'?'Loser':'Winner')+' of '+id}
function matchInfo(id){var m=getMatch(id);if(!m)return null;return {a:resolve(m.a),b:resolve(m.b)}}
function button(s,call){return '<button type="button" onclick="SCSTournament.'+call+'">'+s+'</button>'}
function card(m){var r=draw.results[m.id],info=matchInfo(m.id),g=window.SCSCourtCenter&&window.SCSCourtCenter.tournamentGame&&window.SCSCourtCenter.tournamentGame(m.id),state=r?'Completed':g?(g.score_status==='scored'?'Awaiting approval':g.score_status==='scoring'?'Playing':'Assigned'):'Waiting';var label=function(src,value){return typeof src==='number'&&!draw.entries.some(function(e){return e.id===src&&e.name&&!/^Entry \d+$/.test(e.name)})?'Entry '+src+' · Empty':value};return '<button type="button" data-tm-id="'+m.id+'" class="scs-tm-node '+(r?'done ':'')+(selected===m.id?'selected':'')+'" onclick="SCSTournament.select('+m.id+')"><span class="scs-tm-number">MATCH '+m.id+(m.third?' · THIRD PLACE':'')+'</span><span class="scs-tm-team '+(r&&r.winner===info.a?'winner':'')+'">'+esc(label(m.a,info.a))+'</span><span class="scs-tm-team '+(r&&r.winner===info.b?'winner':'')+'">'+esc(label(m.b,info.b))+'</span><span class="scs-tm-status">'+esc(state)+(g&&g.court?' · Court '+esc(g.court):'')+'</span></button>'}
function isReferenceDraw(){var ids=draw.matches.map(function(m){return Number(m.id)}).sort(function(a,b){return a-b}).join(',');return draw.layout==='center'&&draw.entries.length===10&&ids==='1,2,3,4,5,6,7,8,10'}
function referenceDiagram(){
  var pos={1:[70,75],2:[70,195],3:[70,265],4:[70,455],5:[70,525],6:[930,75],7:[930,195],8:[930,355],9:[930,425],10:[930,545]};
  var j={1:[300,230],3:[405,145],4:[300,490],7:[455,315],5:[700,145],2:[700,390],6:[595,510],8:[545,315],10:[500,445]};
  function en(id){var e=draw.entries.find(function(x){return x.id===id}),name=e&&e.name?e.name:'Team '+id,x=pos[id][0],y=pos[id][1],right=id>=6;return '<g class="scs-tm-entry-card"><rect x="'+(right?x-125:x)+'" y="'+(y-22)+'" width="125" height="44" rx="9"></rect><text x="'+(right?x-62.5:x+62.5)+'" y="'+(y+5)+'" text-anchor="middle">'+esc(name)+'</text></g>'}
  function junction(id){var x=j[id][0],y=j[id][1];return '<g class="scs-tm-junction '+(selected===id?'selected':'')+'" data-ref-match="'+id+'" onclick="SCSTournament.select('+id+')"><circle cx="'+x+'" cy="'+y+'" r="18"></circle><text x="'+x+'" y="'+(y+5)+'" text-anchor="middle">'+id+'</text></g>'}
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
function applyZoom(){var chart=root&&root.querySelector('#scsTmChart'),stage=root&&root.querySelector('#scsTmStage'),label=root&&root.querySelector('#scsTmZoomLabel');if(!chart||!stage)return;chart.style.transform='scale('+zoom+')';stage.style.width=(chart.scrollWidth*zoom)+'px';stage.style.height=(chart.scrollHeight*zoom)+'px';if(label)label.textContent=Math.round(zoom*100)+'%'}
function zoomBy(factor){setZoom(zoom*factor)}
function setZoom(value,cx,cy){var scroll=root&&root.querySelector('#scsTmScroll');if(!scroll)return;var old=zoom;zoom=Math.max(.2,Math.min(4,value));if(cx==null){cx=scroll.clientWidth/2;cy=scroll.clientHeight/2}var contentX=(scroll.scrollLeft+cx)/old,contentY=(scroll.scrollTop+cy)/old;applyZoom();scroll.scrollLeft=contentX*zoom-cx;scroll.scrollTop=contentY*zoom-cy}
function fit(){var chart=root&&root.querySelector('#scsTmChart'),scroll=root&&root.querySelector('#scsTmScroll');if(!chart||!scroll)return;zoom=Math.max(.2,Math.min(1,(scroll.clientWidth-12)/chart.scrollWidth,(scroll.clientHeight-12)/chart.scrollHeight));applyZoom();scroll.scrollLeft=0;scroll.scrollTop=0}
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
 return Array.isArray(draw.playerPool)?draw.playerPool:[];
}
// Reuse Round Manager's existing createRatingRing; no player/round changes.
function tournamentPlayerRow(name){
 return '<span class="scs-tm-shared-player"><span class="scs-tm-ring-slot" data-tm-player="'+esc(name)+'"></span><span class="scs-tm-shared-name">'+esc(name)+'</span></span>';
}
function hydrateTournamentPlayerCards(){
 if(!root||typeof createRatingRing!=='function')return;
 root.querySelectorAll('.scs-tm-ring-slot[data-tm-player]').forEach(function(slot){
  if(slot.firstChild)return;
  var name=slot.getAttribute('data-tm-player');
  var all=[];
  if(typeof schedulerState!=='undefined'&&schedulerState&&Array.isArray(schedulerState.allPlayers))all=all.concat(schedulerState.allPlayers);
  try{var stored=JSON.parse(localStorage.getItem('schedulerPlayers')||'[]');if(Array.isArray(stored))all=all.concat(stored)}catch(e){}
  var player=all.find(function(p){return p&&typeof p==='object'&&String(p.name||'').toLocaleLowerCase()===String(name||'').toLocaleLowerCase()});
  var gender=player&&(player.gender||player.sex)||'Male';
  var rating=player&&Number(player.activeRating||player.clubRating||player.rating);
  try{slot.appendChild(createRatingRing(name,gender,Number.isFinite(rating)&&rating>=1?rating:null))}catch(e){}
 });
}
var poolExpanded=false;
function togglePool(){poolExpanded=!poolExpanded;render();}
function tournamentPoolCard(){
 if(!draw)return '';
 var pool=tournamentPool();
 return '<section class="scs-tm-pool"><div class="scs-tm-pool-heading"><div><small>TOURNAMENT PLAYERS</small><h3>Players ('+pool.length+')</h3></div><div class="scs-tm-pool-actions"><button type="button" onclick="SCSTournament.togglePool()" aria-expanded="'+(poolExpanded?'true':'false')+'">'+(poolExpanded?'Hide ▲':'Show ▼')+'</button><button type="button" onclick="SCSTournament.openPlayersManager()">+ Players Manager</button></div></div>'+
 (poolExpanded?(pool.length?'<div class="scs-tm-pool-chips">'+pool.map(tournamentPlayerRow).join('')+'</div>':'<p>Select players using the existing Players Manager.</p>'):'')+'</section>';
}
function openPlayersManager(){
 if(!draw||!root)return;
 window.__scsTournamentPlayersReturn=true;
 root.hidden=true;
 if(typeof scsPushChildReturnState==='function')scsPushChildReturnState('playersPage');
 if(typeof homeHideScreen==='function')homeHideScreen();
 if(typeof showPage==='function')showPage('playersPage',null);
 else {var page=document.getElementById('playersPage');if(page)page.style.display='block'}
 if(typeof _updateDynamicBackBtns==='function')_updateDynamicBackBtns('playersPage');
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
var swapEntryId=null;
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
function tournamentEntryPlayers(name){
 if(!name||/^Entry \d+$/.test(name))return '';
 return '<span class="scs-tm-bracket-players">'+splitTeam(name).players.map(tournamentPlayerRow).join('')+'</span>';
}
function entryTap(id){
  if(readonly)return;id=Number(id);
  if(byeSelection){return}
  if(entryInStartedMatch(id)){alert('This team is locked because its match has already started.');return}
  if(tournamentStarted()){editEntry(id);return}if(swapEntryId==null){swapEntryId=id;var e=draw.entries.find(function(x){return x.id===id});if(e){var box=root&&root.querySelector('.scs-tm-details');if(box)box.innerHTML='<p><strong>'+esc(e.name||('Entry '+id))+'</strong> selected. Tap another team to swap positions, or tap this team again to edit it.</p>'}return}if(swapEntryId===id){swapEntryId=null;editEntry(id);return}var a=draw.entries.find(function(x){return x.id===swapEntryId}),b=draw.entries.find(function(x){return x.id===id});if(a&&b){var t=a.name;a.name=b.name;b.name=t}swapEntryId=null;if(saveFn)Promise.resolve(saveFn(draw)).then(render).catch(function(e){alert(e.message||'Could not save swap')});else render()}
function editEntry(id){
 if(readonly)return;
 var e=draw.entries.find(function(x){return Number(x.id)===Number(id)});if(!e)return;
 if(entryInStartedMatch(id)){alert('This team already played and cannot be changed.');return}
 selected=null;render();
 var detailsBox=document.createElement('section');detailsBox.className='scs-tm-entry-modal';detailsBox.setAttribute('role','dialog');detailsBox.setAttribute('aria-modal','true');detailsBox.setAttribute('aria-label','Assign tournament players');root.appendChild(detailsBox);
 var current=/^Entry \d+$/.test(e.name||'')?[]:splitTeam(e.name||'').players;
 var used=tournamentAssignedNames(id);var names=(tournamentPool().length?tournamentPool():availablePlayerNames()).filter(function(n){return !used.has(n.trim().toLocaleLowerCase())});
 var opts=names.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>'}).join('');
 detailsBox.innerHTML='<div class="scs-tm-entry-editor"><button type="button" class="scs-tm-entry-close" aria-label="Close player assignment" onclick="SCSTournament.closeEntryPopup()">×</button><h3>Entry '+id+' · Assign Players</h3><p>Choose players from the tournament pool, or enter a name manually.</p>'+
 [1,2].map(function(num){var val=current[num-1]||'';return '<label>Player '+num+'<select class="scs-tm-player-select" data-player="'+num+'"><option value="">Select player</option>'+names.map(function(n){return '<option value="'+esc(n)+'"'+(n===val?' selected':'')+'>'+esc(n)+'</option>'}).join('')+'</select><input id="scsTmP'+num+'" autocomplete="off" placeholder="Or type player name" value="'+esc(val)+'"></label>'}).join('')+
 '<div class="scs-tm-entry-player-preview">'+current.map(tournamentPlayerRow).join('')+'</div><div class="scs-tm-import-actions">'+(assistStep===1&&!assistSaved?'<button type="button" onclick="SCSTournament.addNextTeam('+id+')">+ Add Team</button>':'')+'<button type="button" class="scs-tm-primary" onclick="SCSTournament.doneEntry('+id+')">Done</button></div><p class="scs-tm-entry-status" role="status"></p></div>';
 [1,2].forEach(function(num){var input=detailsBox.querySelector('#scsTmP'+num),sel=detailsBox.querySelector('[data-player="'+num+'"]');sel.addEventListener('change',function(){if(sel.value)input.value=sel.value})});
 hydrateTournamentPlayerCards();detailsBox.addEventListener('click',function(ev){if(ev.target===detailsBox)closeEntryPopup()});
}
async function addNextTeam(id){
 if(readonly||assistStep!==1||assistSaved)return;
 var ok=await saveEntry(id,true);if(ok!==true)return;
 if(draw.entries.length>=64){var status=root&&root.querySelector('.scs-tm-entry-status');if(status)status.textContent='Maximum 64 teams.';return}
 var nextId=draw.entries.reduce(function(m,e){return Math.max(m,Number(e.id)||0)},0)+1;
 draw.entries.push({id:nextId,name:'Entry '+nextId});saveAssistDraft();
 closeEntryPopup();render();editEntry(nextId);
}
async function doneEntry(id){var ok=await saveEntry(id,true);if(ok===true){closeEntryPopup();render()}}
function closeEntryPopup(){if(!root)return;var popup=root.querySelector('.scs-tm-entry-modal');if(popup)popup.remove()}
async function saveEntry(id,noRender){if(readonly)return;if(entryInStartedMatch(id)){var locked=root&&root.querySelector('.scs-tm-entry-status');if(locked)locked.textContent='This team has already played and cannot be edited.';return;}var e=draw.entries.find(function(x){return Number(x.id)===Number(id)}),box=root&&root.querySelector('.scs-tm-entry-editor');if(!e||!box)return;var p1=box.querySelector('#scsTmP1').value.trim(),p2=box.querySelector('#scsTmP2').value.trim(),status=box.querySelector('.scs-tm-entry-status');if(!p1||!p2){if(status)status.textContent='Enter both player names to save this team.';return false}if(p1.toLowerCase()===p2.toLowerCase()){if(status)status.textContent='Choose two different players.';return false}var assigned=tournamentAssignedNames(id),played=tournamentPlayedNames();if(played.has(p1.toLocaleLowerCase())||played.has(p2.toLocaleLowerCase())){if(status)status.textContent='A player who has already played cannot be reassigned.';return false}if(assigned.has(p1.toLocaleLowerCase())||assigned.has(p2.toLocaleLowerCase())){if(status)status.textContent='Player already assigned to another tournament team. Choose an available player.';return false}var next=p1+' / '+p2,old=e.name;if(old===next){return true}e.name=next;if(!assistSaved){saveAssistDraft();if(status)status.textContent='Saved to draft.';if(!noRender)render();return true}try{await localTournamentSave(draw);if(saveFn&&saveFn!==localTournamentSave)await saveFn(draw);await localTournamentSave(draw);if(status)status.textContent='Saved automatically.';if(!noRender)render();return true;}catch(err){e.name=old;await localTournamentSave(draw).catch(function(){});if(status)status.textContent=err.message||'Could not save team entry.';return false}}
function scoreSummary(g){if(!g||!g.score)return '';var s=g.score,sets=Array.isArray(s.completedSets)?s.completedSets:[];if(sets.length)return sets.map(function(x){return Array.isArray(x.score)?x.score.join('–'):''}).filter(Boolean).join(' · ');return Array.isArray(s.currentScore)?s.currentScore.join('–'):''}
function details(){
 if(!selected)return '<p class="scs-tm-hint">Tap a numbered junction to see the two teams playing.</p>';
 var m=getMatch(selected),info=matchInfo(selected),r=draw.results[selected],g=window.SCSCourtCenter&&window.SCSCourtCenter.tournamentGame&&window.SCSCourtCenter.tournamentGame(selected);if(!m)return '';
 var score=scoreSummary(g);
 // Reuse the one shared tournament result card below the bracket as well.
 if((score||r)&&window.SCSSharedMatchCenter&&typeof SCSSharedMatchCenter.completed==='function'){
  var winner='';if(r&&r.winner){if(String(r.winner)===String(info.a))winner='left';else if(String(r.winner)===String(info.b))winner='right'}
  var left=splitTeam(info.a).players,right=splitTeam(info.b).players;
  return SCSSharedMatchCenter.completed({number:selected,title:'Match '+selected,left:info.a,right:info.b,leftPlayers:left,rightPlayers:right,score:String(score||'').replace(/\s*·\s*/g,' | '),winner:winner});
 }
 var h='<h3>Match '+selected+'</h3><p>'+esc(info.a)+' <b>VS</b> '+esc(info.b)+'</p>';
 if(!readonly){['a','b'].forEach(function(side){var src=m[side];if(editableEntryFromSource(src))h+='<button type="button" onclick="SCSTournament.editEntry('+src+')">Edit '+(side==='a'?'Team A':'Team B')+'</button> '})}
 if(!readonly&&!r){if(g)h+='<p>Assigned to '+(g.court?'Court '+g.court:'waiting list')+'.</p>';else if(!/^(Winner|Loser) of /.test(info.a)&&!/^(Winner|Loser) of /.test(info.b)&&!/^Entry \d+$/.test(info.a)&&!/^Entry \d+$/.test(info.b))h+=button('Assign match','assign('+selected+')');else h+='<p>Complete the entry names and previous matches before court assignment.</p>'}return h
}
function patternEditorCard(){
  if(!byeSelection)return '';
  var p=byeSelection.patternMode==='right'?(byeSelection.rightPatterns[byeSelection.rightIndex]||{}):(byeSelection.leftPatterns[byeSelection.leftIndex]||{}),n=byeSelection.patternMode==='right'?byeSelection.total-byeSelection.leftCount:byeSelection.leftCount,cut=p&&p.cut!=null?Number(p.cut):Math.ceil(n/2);
  return '<div class="scs-tm-pattern-dashboard"><div class="scs-tm-pattern-title"><span class="scs-tm-kicker">ASSIST · STEP 2 OF 5</span><h2>Tournament Pattern</h2><p>Choose the bracket structure and BYE positions for each side.</p></div><div class="scs-tm-bye-summary"><span><b>Left Side</b><em>'+byeSelection.needLeft+' '+(byeSelection.needLeft===1?'BYE':'BYEs')+'</em></span><span><b>Right Side</b><em>'+byeSelection.needRight+' '+(byeSelection.needRight===1?'BYE':'BYEs')+'</em></span></div><div class="scs-tm-pattern-controls"><div class="scs-tm-pattern-tabs"><button type="button" class="'+(byeSelection.patternMode==='left'?'active':'')+'" onclick="SCSTournament.setByePatternMode(\'left\')">Left</button><button type="button" class="'+(byeSelection.patternMode==='right'?'active':'')+'" onclick="SCSTournament.setByePatternMode(\'right\')">Right</button></div><div class="scs-tm-pattern-row"><button type="button" class="scs-tm-pattern-arrow" onclick="SCSTournament.nextByePattern(-1)">‹</button><span class="scs-tm-pattern-label"><b>Pattern '+byePatternNumber()+' of '+byePatternCount()+'</b><small class="scs-tm-pattern-split">Top '+cut+' · Bottom '+Math.max(0,n-cut)+'</small></span><button type="button" class="scs-tm-pattern-arrow" onclick="SCSTournament.nextByePattern(1)">›</button></div><div class="scs-tm-bye-actions"><button type="button" onclick="SCSTournament.assistClearPattern()">Clear Pattern</button><button type="button" class="scs-tm-back-pattern" onclick="SCSTournament.cancelByeSelection()">Back</button><button type="button" class="scs-tm-confirm-pattern" onclick="SCSTournament.confirmByeSelection()">✓ <span>Next · Review</span></button></div></div></div>';
}
function savedTournamentCard(){var saved=localTournamentLoad();if(!saved)return '';var left=Number(saved.leftCount||Math.ceil((saved.entries||[]).length/2)),right=(saved.entries||[]).length-left,live=saved.live===true;return '<section class="scs-tm-saved-card"><div><small>'+(live?'TOURNAMENT LIVE':'SAVED TOURNAMENT')+'</small><h3>'+esc(saved.title||'Tournament')+'</h3><p>'+left+' Left · '+right+' Right · '+(saved.matches||[]).length+' Matches'+(live?' · '+Math.max(1,Number(saved.numCourts)||1)+' Courts':'')+'</p></div><button type="button" class="scs-tm-start-live" onclick="SCSTournament.enterSavedTournament()">'+(live?'● <span>Tournament Live</span>':'▶ <span>Tournament Start</span>')+'</button></section>'}
function tournamentStartPanel(){var n=Math.max(1,Math.min(20,Number(draw.numCourts)||2));return '<section class="scs-tm-start-panel scs-tm-live-prestart"><div><small>TOURNAMENT LIVE</small><h3>Courts &amp; Match Assignment</h3><p>Select the number of courts, then start this live tournament.</p></div><div class="scs-tm-court-picker"><button type="button" onclick="SCSTournament.setTournamentCourts(-1)">−</button><b>'+n+'</b><button type="button" onclick="SCSTournament.setTournamentCourts(1)">+</button></div><div class="scs-tm-prestart-courts">'+Array.from({length:n},function(_,i){return '<div class="scs-tm-court-card is-free"><div class="scs-tm-court-head"><strong>COURT '+(i+1)+'</strong><span>FREE</span></div><p>Available when tournament starts</p></div>'}).join('')+'</div><button type="button" class="scs-tm-start-live" onclick="SCSTournament.startSavedTournament()">▶ Start Tournament</button></section>'}
function setTournamentCourts(delta){if(!draw)return;draw.numCourts=Math.max(1,Math.min(20,(Number(draw.numCourts)||2)+Number(delta||0)));localTournamentSave(draw);render()}
async function startSavedTournament(){if(!draw||!draw.matches||!draw.matches.length)return;if(!window.SCSCourtCenter||typeof SCSCourtCenter.startTournament!=='function'){alert('Court Center is still loading. Please try again.');return}try{draw.live=true;draw.livePage=true;draw.numCourts=Math.max(1,Math.min(20,Number(draw.numCourts)||2));await SCSCourtCenter.startTournament(draw,draw.numCourts);await localTournamentSave(draw);render()}catch(e){draw.live=false;alert(e.message||'Could not start the live tournament.')}}
async function enterSavedTournament(){readonly=false;tournamentActiveTab='home';var saved=localTournamentLoad();if(!saved){alert('No saved tournament found.');render();return}try{creationScreenPinned=false;bracketViewInitialized=false;bracketScrollState=null;draw=saved;selected=null;swapEntryId=null;draw.livePage=true;ensure();restoreTournamentPlayerPool(draw);root=document.getElementById('scsTournamentOverlay');if(root)root.hidden=false;if(saved.live===true&&window.SCSCourtCenter&&typeof SCSCourtCenter.resumeTournament==='function'){var state=await SCSCourtCenter.resumeTournament();if(state&&state.tournament){draw=state.tournament;draw.live=true;draw.livePage=true;draw.numCourts=state.courtCount;restoreTournamentPlayerPool(draw);await localTournamentSave(draw)}}render()}catch(e){alert(e.message||'Could not open the tournament.')}}
function openCourtCenter(){if(window.SCSCourtCenter&&typeof window.SCSCourtCenter.open==='function'){window.SCSCourtCenter.open();return}alert('Court Center is not available.')}
function liveTournamentPanel(){
  if(!draw||draw.live!==true)return '';
  var state=window.SCSCourtCenter&&SCSCourtCenter.liveState?SCSCourtCenter.liveState():{ready:false,courtCount:Number(draw.numCourts)||1,games:[]};
  var allGames=state.games||[];
  function tg(id){return allGames.find(function(g){return Number(g.tournament_match)===Number(id)})}
  var matches=draw.matches.map(function(m){return {m:m,info:matchInfo(m.id),g:tg(m.id)}});
  var completed=matches.filter(function(x){return x.g&&x.g.court_center_status==='approved'});
  var waiting=matches.filter(function(x){return (!x.g||x.g.court_center_status!=='approved')&&!draw.results[x.m.id]&&!/^(Winner|Loser) of /.test(x.info.a)&&!/^(Winner|Loser) of /.test(x.info.b)&&!/^Entry \d+$/.test(x.info.a)&&!/^Entry \d+$/.test(x.info.b)});
  var tab=draw.liveTab||'waiting',targetCourt=Number(draw.assigningCourt)||0;
  function scoreText(g){if(!g)return '';var sc=g.score;if(!sc)return '';if(typeof sc==='string')return sc;var sets=Array.isArray(sc.completedSets)?sc.completedSets:(Array.isArray(sc.sets)?sc.sets:[]);if(sets.length)return sets.map(function(x){if(Array.isArray(x.score))return x.score.join('–');return (x.a!=null?x.a:x.left)+'–'+(x.b!=null?x.b:x.right)}).join('  |  ');if(sc.currentScore)return sc.currentScore.join(' – ');return ''}
  function teamPlayers(label){var parts=splitTeam(label||'').players;return parts.length?parts.map(tournamentPlayerRow).join(''):esc(label||'')}
  var courtCount=Math.max(1,Number(state.courtCount)||Number(draw.numCourts)||1);
  var courts=Array.from({length:courtCount},function(_,i){
    var n=i+1,g=allGames.find(function(x){return Number(x.court)===n&&x.court_center_status!=='approved'});
    if(!g)return {number:n};
    var id=Number(g.tournament_match),info=id?matchInfo(id):null,ready=g.score_status==='scored',playing=g.score_status==='scoring';
    return {number:n,playerRenderer:tournamentPlayerRow,match:{status:ready?'AWAITING APPROVAL':playing?'IN PROGRESS':'ASSIGNED (Not Started)',label:'MATCH '+id,left:(g.pair1||[]).length?g.pair1:splitTeam(info?info.a:'').players,right:(g.pair2||[]).length?g.pair2:splitTeam(info?info.b:'').players,score:scoreText(g),winner:g&&g.winner==='L'?'left':g&&g.winner==='R'?'right':null,ready:ready,started:playing||ready||!!g.started_at,action:ready?'onclick="SCSTournament.approveLive('+id+')"':playing?'onclick="SCSScoring.open()"':'onclick="SCSTournament.startCourtMatch('+id+')"',actionLabel:ready?'Approve Result':playing?'View Score':'Start Match'}};
  });
  return SCSSharedMatchCenter.panel({courtCount,courts,tab,assigning:draw.assigningMatch,
   waiting:waiting.map(function(x){var g=x.g,started=g&&(g.score_status==='scoring'||g.score_status==='scored'||g.started_at||g.score),assigned=g&&g.court&&!started;return {number:x.m.id,left:x.info.a,right:x.info.b,label:started?(g.score_status==='scored'?'Score Ready':'In Progress'):assigned?'Assigned · Court '+g.court:'Assign',assigned:assigned,action:readonly?'':started?'':'onclick="SCSTournament.assign('+x.m.id+')"'}}),
   completed:completed.map(function(x){var r=draw.results[x.m.id];return {number:x.m.id,left:x.info.a,right:x.info.b,leftPlayers:splitTeam(x.info.a).players,rightPlayers:splitTeam(x.info.b).players,score:scoreText(x.g),winner:r?(r.winner===x.info.a?'left':r.winner===x.info.b?'right':null):null}}),
   attrs:{change:n=>'onclick="SCSTournament.changeLiveCourts('+n+')"',choose:n=>'onclick="SCSTournament.selectAssignmentCourt('+n+')"',cancel:'onclick="SCSTournament.cancelCourtSelection()"',tab:id=>'onclick="SCSTournament.liveTab(\''+id+'\')"'}
  });
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
  return '<div class="scs-tm-pool" style="padding:12px;margin:8px 0"><strong>Match '+esc(String(m.id))+'</strong><p>'+esc(info.a||'TBD')+' vs '+esc(info.b||'TBD')+'</p>'+(result?'<small>Completed · Winner: '+esc(String(result.winner||''))+'</small>':'<small>Upcoming</small>')+'</div>';
 }).join('')+'</section>';
}
function organizeTournamentTabs(){
 if(!root||!draw||!draw.matches||!draw.matches.length)return;
 if(!readonly&&draw.live!==true&&draw.livePage!==true)return;
 var summary=root.querySelector('.scs-tm-tournament-dashboard,.scs-tm-pattern-dashboard');
 var pool=root.querySelector('.scs-tm-pool')||root.querySelector('[class*="scs-tm-pool"]');
 var workspace=root.querySelector('.scs-tm-workspace');
 var match=root.querySelector('.scs-tm-live-center,.scs-tm-start-panel');
 var hint=root.querySelector('.scs-tm-swap-hint');
 var details=root.querySelector('.scs-tm-details');
 var old=root.querySelector('.scs-tm-organized-tabs');if(old)old.remove();
 var live=draw.live===true||readonly;
 var tabs=live?(readonly?[['home','Home','⌂'],['flowchart','Flowchart','⑂'],['match','Match Center','▣']]:[['home','Home','⌂'],['players','Players','♙'],['flowchart','Flowchart','⑂'],['match','Match Center','▣']]):[['main','Main'],['players','Players'],['flowchart','Flowchart'],['match','Match Center']];
 var bar=document.createElement('nav');bar.className='scs-tm-organized-tabs'+(live?' scs-tm-bottom-nav':'');bar.setAttribute('aria-label','Tournament sections');
 tabs.forEach(function(item){var btn=document.createElement('button');btn.type='button';btn.setAttribute('data-tm-tab',item[0]);
  if(live){var ico=document.createElement('span');ico.className='scs-tm-nav-icon';ico.setAttribute('aria-hidden','true');ico.textContent=item[2];var label=document.createElement('span');label.className='scs-tm-nav-label';label.textContent=item[1];btn.appendChild(ico);btn.appendChild(label)}else btn.textContent=item[1];
  btn.onclick=function(){switchTournamentTab(item[0])};bar.appendChild(btn)});
 root.insertBefore(bar,root.firstChild);
 function panel(name,els){var wrap=document.createElement('section');wrap.className='scs-tm-tab-panel';wrap.setAttribute('data-tm-panel',name);root.appendChild(wrap);els.forEach(function(el){if(el)wrap.appendChild(el)});return wrap}
 var organizerTeams=null;
 if(!readonly){organizerTeams=document.createElement('div');organizerTeams.innerHTML=assistTeamsCard();}
 panel('home',[summary]);panel('players',[pool,organizerTeams]);panel('flowchart',[workspace,hint,details]);panel('match',[match]);
 if(!readonly)hydrateTournamentPlayerCards();
 // Spectators reuse the live Match Center markup but cannot operate any court or match.
 if(readonly&&live){var viewPanel=root.querySelector('[data-tm-panel="match"]');if(viewPanel){viewPanel.querySelectorAll('button').forEach(function(btn){if(!btn.closest('.scs-tm-live-tabs'))btn.remove()});viewPanel.querySelectorAll('[onclick]').forEach(function(node){var call=node.getAttribute('onclick')||'';if(!/^SCSTournament\.liveTab\(/.test(call))node.removeAttribute('onclick')});}}
 if(readonly&&live&&(tournamentActiveTab==='main'||!tournamentActiveTab))tournamentActiveTab='flowchart';
 if(readonly&&live&&tournamentActiveTab==='players')tournamentActiveTab='flowchart';
 if(!tabs.some(function(t){return t[0]===tournamentActiveTab}))tournamentActiveTab=readonly?'flowchart':'home';
 switchTournamentTab(tournamentActiveTab);
}

var ASSIST_DRAFT_KEY='scs-knockout-assist-draft-v1';
function saveAssistDraft(){
 if(readonly||assistSaved||!draw)return;
 try{localStorage.setItem(ASSIST_DRAFT_KEY,JSON.stringify({draw:draw,step:assistStep,updated:Date.now()}))}catch(e){}
}
function restoreAssistDraft(){
 try{var raw=localStorage.getItem(ASSIST_DRAFT_KEY);if(!raw)return null;var data=JSON.parse(raw);return data&&data.draw&&Array.isArray(data.draw.entries)?data.draw:null}catch(e){return null}
}
function assistTeamsCard(){
 var entries=draw&&Array.isArray(draw.entries)?draw.entries:[];
 var canAdd=!readonly&&assistStep===1&&!assistSaved;
 return '<section class="scs-tm-pool" style="margin-top:14px;border-color:#0f766e"><div class="scs-tm-pool-heading"><div><small>TOURNAMENT TEAMS</small><h3>Teams ('+entries.length+')</h3></div><div class="scs-tm-pool-actions">'+(canAdd?'<button type="button" onclick="SCSTournament.assistAddTeam()" aria-label="Add team" title="Add team">+</button>':'')+'</div></div>'+
 (entries.length?'<div style="display:grid;gap:10px;padding:12px">'+entries.map(function(e,i){
 var names=/^Entry \\d+$/.test(e.name||'')?[]:splitTeam(e.name||'').players;
 return '<div style="background:#142d4b;border:2px solid #3184df;border-left:7px solid #2899f0;border-radius:14px;padding:12px"><div style="display:flex;align-items:center;gap:10px"><div style="flex:1;min-width:0">'+(names.length?names.map(function(n){return '<div style="display:flex;align-items:center;gap:8px;margin:5px 0">'+tournamentPlayerRow(n)+'</div>'}).join(''):'<span style="color:#b9c9df">Select two players</span>')+'</div><button type="button" onclick="SCSTournament.editEntry('+e.id+')" aria-label="Edit team '+(i+1)+'">✎</button>'+(canAdd?'<button type="button" onclick="SCSTournament.assistRemoveTeam('+e.id+')" aria-label="Remove team '+(i+1)+'">−</button>':'')+'</div></div>'
 }).join('')+'</div>':'<p style="padding:12px">Create teams, then select players using the existing assignment popup.</p>')+'</section>';
}
function assistAddTeam(){
 if(readonly||assistStep!==1)return;
 if(draw.entries.length>=64){alert('Maximum 64 teams.');return}
 var id=draw.entries.reduce(function(m,e){return Math.max(m,Number(e.id)||0)},0)+1;
 draw.entries.push({id:id,name:'Entry '+id});
 saveAssistDraft();render();editEntry(id);
}
function assistRemoveTeam(id){
 if(readonly||assistStep!==1)return;
 draw.entries=draw.entries.filter(function(e){return Number(e.id)!==Number(id)});
 saveAssistDraft();render();
}
function assistPlayersTeams(){
 if(!root)return;
 root.innerHTML='<section style="max-width:720px;margin:auto;padding:14px"><div style="background:#0f766e;color:white;border-radius:14px;padding:16px"><small>TOURNAMENT ASSIST · STEP 1 OF 5</small><h2>Players and Teams</h2></div>'+tournamentPoolCard()+assistTeamsCard()+'<div style="display:flex;justify-content:space-between;gap:12px;margin-top:18px"><button type="button" onclick="SCSTournament.assistBack()">‹ Assist Home</button><button type="button" onclick="SCSTournament.assistFinishPlayers()">Done ✓</button></div></section>';
 hydrateTournamentPlayerCards();
}
function assistFinishPlayers(){
 if(!assistReady(1)){alert('Assign players to every team before completing Step 1.');return}
 assistBack();
}
function assistReady(step){
 if(step===1)return !!(draw&&draw.entries&&draw.entries.length>=4&&draw.entries.every(function(e){return e.name&&!/^Entry \\d+$/.test(e.name)}));
 if(step===2)return !!(draw&&draw.matches&&draw.matches.length);
 if(step===3)return assistReady(2)&&draw.entries.every(function(e){return e.name&&e.name.trim()&&!/^Entry \d+$/.test(e.name.trim())});
 if(step===4)return assistSaved;
 return false;
}
function assistIndex(){
 if(!root)return;
 var names=['Players and Teams','Setup Pattern','Assign Teams to Pattern','Confirm and Save','Start'];
 var colors=['#0f766e','#6d28d9','#b45309','#1d4ed8','#15803d'];
 root.innerHTML='<section class="scs-tm-assist" style="padding:16px;max-width:720px;margin:auto"><div style="display:flex;align-items:center;justify-content:space-between"><h2>Knockout Assist</h2><button type="button" onclick="SCSTournament.close()">Close</button></div><p>Complete each step to unlock the next.</p>'+names.map(function(n,i){var available=i===0||assistReady(i);return '<button type="button" '+(available?'':'disabled')+' onclick="SCSTournament.assistOpen('+i+')" style="display:flex;width:100%;align-items:center;text-align:left;gap:14px;padding:18px;margin:12px 0;border-radius:14px;border:2px solid '+colors[i]+';background:'+colors[i]+';color:#fff;opacity:'+(available?'1':'.48')+'"><strong style="font-size:24px">'+(i+1)+'</strong><span style="flex:1"><b>'+n+'</b><small style="display:block">'+(available?'Open step':'Locked until previous step is complete')+'</small></span><span>'+(available?'›':'🔒')+'</span></button>'}).join('')+'</section>';
}
function assistOpen(i){
 if(readonly||i<0||i>4||(i>0&&!assistReady(i)))return;
 assistStep=i+1;
 if(i===0){assistPlayersTeams();return}
 if(i===1){assistPatternPage();return}
 if(i===2){render();return}
 if(i===3){assistConfirmPage();return}
 if(i===4){startSavedTournament();return}
}
function assistPatternPage(){
 if(!root||readonly)return;
 creationScreenPinned=false;
 if(draw&&draw.matches&&draw.matches.length){editPattern();render();return}
 root.innerHTML='<section class="scs-tm-assist-pattern" style="max-width:720px;margin:auto;padding:14px"><div style="background:#6d28d9;color:#fff;border-radius:14px;padding:16px"><small>TOURNAMENT ASSIST · STEP 2 OF 5</small><h2>Setup Pattern</h2></div><div style="margin:12px 0"><button type="button" onclick="SCSTournament.assistBack()">‹ Assist Home</button><button type="button" onclick="SCSTournament.assistClearPattern()">Clear Pattern</button></div></section>';
 editor();
 var panel=root.querySelector('.scs-tm-editor');
 if(panel){var total=panel.querySelector('#tmCount'),left=panel.querySelector('#tmLeft'),right=panel.querySelector('#tmRight');var n=draw.entries.length;if(total){total.value=n;total.readOnly=true}if(left&&right){var l=Number(draw.leftCount)||Math.ceil(n/2);if(l>=n)l=Math.ceil(n/2);left.value=l;right.value=n-l}var status=panel.querySelector('#tmSetupStatus');if(status)status.textContent='Left + Right must equal '+n+' teams.'}
}
function assistConfirmPage(){
 if(!root||readonly)return;
 var n=draw.entries.length,l=Number(draw.leftCount)||Math.ceil(n/2);
 root.innerHTML='<section style="max-width:720px;margin:auto;padding:14px"><div style="background:#1d4ed8;color:white;border-radius:14px;padding:16px"><small>TOURNAMENT ASSIST · STEP 4 OF 5</small><h2>Confirm and Save</h2></div><div class="scs-tm-tournament-dashboard" style="margin-top:14px"><h3>'+esc(draw.title||'Tournament')+'</h3><div class="scs-tm-side-summary"><div><small>LEFT SIDE</small><b>'+l+' Teams</b><em>'+((draw.leftByeIds||[]).length)+' BYEs</em></div><div><small>RIGHT SIDE</small><b>'+(n-l)+' Teams</b><em>'+((draw.rightByeIds||[]).length)+' BYEs</em></div></div><p>'+n+' teams · '+(draw.matches||[]).length+' matches</p><button type="button" class="scs-tm-start-live" onclick="SCSTournament.saveTournament()">✓ Save Tournament</button></div><div style="margin-top:14px"><button type="button" onclick="SCSTournament.assistBack()">‹ Assist Home</button></div></section>';
}
function assistClearPattern(){
 if(readonly||!confirm('Clear the selected pattern and BYE positions? Players and teams will be kept.'))return;
 draw.matches=[];draw.leftByeIds=[];draw.rightByeIds=[];byeSelection=null;assistSaved=false;saveAssistDraft();assistStep=2;assistPatternPage();
}
function assistBack(){saveAssistDraft();assistStep=0;byeSelection=null;assistIndex()}
function render(){if(!root)return;if(!readonly&&!assistSaved)saveAssistDraft();if(!readonly&&assistStep===1){assistPlayersTeams();return}if(!readonly&&assistStep===2&&!byeSelection){assistPatternPage();return}if(!readonly&&assistStep===4){assistConfirmPage();return}if(!readonly&&!assistSaved&&assistStep===0){assistIndex();return}var retainedEntryPopup=root.querySelector(".scs-tm-entry-modal");if(retainedEntryPopup)retainedEntryPopup.remove();ensure();if(!readonly&&(creationScreenPinned||!draw.matches.length)){root.innerHTML='<div class="scs-tm-head"><div><small class="scs-tm-flow-kicker">KNOCKOUT · SETUP</small><h2>Knockout</h2></div><button type="button" onclick="SCSTournament.close()">Close</button></div><div class="scs-tm-one-card"><h3>Create Tournament</h3><p>Choose how to create the knockout bracket.</p><div class="scs-tm-import-actions"><button type="button" class="scs-tm-primary" onclick="SCSTournament.pickImage()">Import Image</button><button type="button" onclick="SCSTournament.manualCreate()">Create Manually</button></div><input id="scsTmSinglePhoto" type="file" accept="image/*" hidden><div id="scsTmSingleStatus" role="status"></div></div>'+savedTournamentCard();var input=root.querySelector('#scsTmSinglePhoto');input.onchange=function(){var f=input.files&&input.files[0];if(!f)return;if(!f.type.startsWith('image/')||f.size>18*1024*1024){root.querySelector('#scsTmSingleStatus').textContent='Select an image under 18 MB.';return}if(scanImage&&scanImage.startsWith('blob:'))URL.revokeObjectURL(scanImage);scanImage=URL.createObjectURL(f);scanRecognition=null;draw=init();showImportedPhoto()};return}var livePage=draw.livePage===true||draw.live===true;var patternEditable=!readonly&&draw.matches.length&&!byeSelection&&!tournamentStarted()&&!livePage;var normalSummary=!byeSelection&&draw.matches.length?'<div class="scs-tm-tournament-dashboard"><div class="scs-tm-tournament-title"><span class="scs-tm-kicker">KNOCKOUT · '+(livePage?'LIVE TOURNAMENT':'ASSIST · STEP 3 OF 3')+'</span><h2>'+esc(draw.title||'Tournament')+'</h2><span class="scs-tm-pattern-state">'+(livePage?(draw.live===true?'Tournament in progress':'Ready to start tournament'):(patternEditable?'Review the bracket, then save the tournament':'Tournament pattern locked'))+'</span></div><div class="scs-tm-side-summary"><div><small>LEFT SIDE</small><b>'+Number(draw.leftCount||Math.ceil(draw.entries.length/2))+' Teams</b><em>'+((draw.leftByeIds||[]).length)+' '+(((draw.leftByeIds||[]).length)===1?'BYE':'BYEs')+'</em></div><div><small>RIGHT SIDE</small><b>'+Number(draw.entries.length-(draw.leftCount||Math.ceil(draw.entries.length/2)))+' Teams</b><em>'+((draw.rightByeIds||[]).length)+' '+(((draw.rightByeIds||[]).length)===1?'BYE':'BYEs')+'</em></div></div><div class="scs-tm-dashboard-actions">'+(livePage?'':(patternEditable?'<button type="button" class="scs-tm-edit-pattern" onclick="SCSTournament.editPattern()">✎ <span>Edit Pattern</span></button>':''))+'</div></div>':'';var assistReturn=!readonly&&!assistSaved&&assistStep>0?'<div style="padding:12px"><button type="button" onclick="SCSTournament.assistBack()">‹ Assist Home</button></div>':'';var oldBracketScroll=root.querySelector('#scsTmScroll');if(oldBracketScroll)bracketScrollState={left:oldBracketScroll.scrollLeft,top:oldBracketScroll.scrollTop};root.innerHTML=assistReturn+(byeSelection?patternEditorCard():normalSummary)+(readonly||assistStep===3||assistStep===2?'':tournamentPoolCard())+'<div class="scs-tm-workspace"'+(draw.live===true?' data-live-tournament="true"':'')+'>'+(scanImage?'<aside class="scs-tm-reference"><strong>Original photo</strong><img src="'+scanImage+'" alt="Original tournament bracket"></aside>':'')+'<main class="scs-tm-main">'+diagram()+'</main></div>'+(!byeSelection&&livePage?(readonly&&!draw.live?spectatorMatchList():(draw.live===true?liveTournamentPanel():tournamentStartPanel())):'');if(retainedEntryPopup)root.appendChild(retainedEntryPopup);requestAnimationFrame(function(){arrangeBracketControls();hydrateTournamentPlayerCards();if(byeSelection){fit()}else if(!bracketViewInitialized){fit();bracketViewInitialized=true}else{applyZoom();var restored=root.querySelector('#scsTmScroll');if(restored&&bracketScrollState){restored.scrollLeft=bracketScrollState.left;restored.scrollTop=bracketScrollState.top}}if(!isReferenceDraw())wires();bindGestures();organizeTournamentTabs()})}
async function saveTournament(){if(!assistReady(3)){alert("Assign all teams before saving.");return}if(!draw||!draw.matches||!draw.matches.length){alert('Create the knockout bracket first.');return}var previous=draw.live;var previousPage=draw.livePage;draw.live=false;draw.livePage=false;try{if(saveFn)await saveFn(draw);await localTournamentSave(draw);assistSaved=true;try{localStorage.removeItem(ASSIST_DRAFT_KEY)}catch(e){}assistStep=0;selected=null;swapEntryId=null;assistIndex();}catch(e){draw.live=previous;draw.livePage=previousPage;alert(e.message||'Could not save tournament.')}}
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
function playableTournamentMatches(){
  if(!draw||!draw.live||!window.SCSCourtCenter||!SCSCourtCenter.liveState)return [];
  var games=SCSCourtCenter.liveState().games||[],assigned=new Set(games.filter(function(g){return g.tournament_match!=null}).map(function(g){return Number(g.tournament_match)}));
  var busyNames=new Set();games.filter(function(g){return g.court_center_status!=='approved'}).forEach(function(g){(g.pair1||[]).concat(g.pair2||[]).forEach(function(n){busyNames.add(String(n).trim().toLowerCase())})});
  return draw.matches.filter(function(m){if(assigned.has(Number(m.id))||draw.results[m.id])return false;var x=matchInfo(m.id);if(!x)return false;var a=splitTeam(x.a).players,b=splitTeam(x.b).players,v=a.concat(b).map(function(n){return String(n).trim().toLowerCase()});return a.length===2&&b.length===2&&new Set(v).size===4&&!v.some(function(n){return busyNames.has(n)})&&!/^(Winner|Loser) of |^Entry \d+$/.test(x.a)&&!/^(Winner|Loser) of |^Entry \d+$/.test(x.b)}).sort(function(a,b){return Number(a.id)-Number(b.id)});
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
  applyCurrentByePattern();
}
function renderHome(){scanImage=null;scanRecognition=null;creationScreenPinned=true;render()}
function cancelEditor(){var e=root&&root.querySelector('.scs-tm-editor');if(e)e.remove();render()}

function open(data,ro,onSave,onAssign,onClear){tournamentActiveTab=ro?'flowchart':'home';assistStep=0;assistSaved=!!(data&&data.matches&&data.matches.length);draw=ro&&data?JSON.parse(JSON.stringify(data)):(data||(restoreAssistDraft()||init()));creationScreenPinned=!data||!data.matches||!data.matches.length;bracketViewInitialized=false;bracketScrollState=null;ensure();readonly=!!ro;saveFn=onSave||localTournamentSave;assignFn=onAssign;clearFn=onClear||localTournamentClear;selected=null;zoom=1;root=document.getElementById('scsTournamentOverlay');root.hidden=false;render()}

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
function close(){saveAssistDraft();if(root)root.hidden=true;root=null;if(window.scsTournamentReturnPage&&typeof window.scsReturnToTournamentParent==='function')window.scsReturnToTournamentParent()}function load(data){draw=data||init();ensure()}function select(id){selected=id;render()}
function editor(){creationScreenPinned=false;if(readonly)return;if(Object.keys(draw.results).length){alert('Approved results must be cleared before changing the draw.');return}var old=root.querySelector('.scs-tm-editor,.scs-tm-import,.scs-tm-review');if(old)old.remove();var current=draw.entries.length||8,left=draw.leftCount||Math.ceil(current/2),right=current-left;var el=document.createElement('section');el.className='scs-tm-editor';el.innerHTML='<div class="scs-tm-step">STEP 1 · SIDE ENTRIES</div><h3>Create tournament structure</h3><p class="scs-tm-editor-help">'+(scanImage?'Reference image loaded. Use the same SCS creator below; player names are ignored at this stage.':'Set the total teams. SCS splits the sides evenly and creates valid BYE positions automatically.')+'</p><div class="scs-tm-form-grid scs-tm-compact-grid"><label class="scs-tm-title-field">Tournament title<input id="tmTitle" value="'+esc(draw.title||'Tournament')+'"></label><label class="scs-tm-total-field">Total teams<input id="tmCount" type="number" min="4" max="64" value="'+current+'"></label><div class="scs-tm-side-row"><label>Left side<input id="tmLeft" type="number" min="1" value="'+left+'"></label><label>Right side<input id="tmRight" type="number" min="1" value="'+right+'"></label></div></div><p id="tmSetupStatus" class="scs-tm-note"></p><div class="scs-tm-import-actions"><button type="button" class="scs-tm-primary" id="tmNextByes" onclick="SCSTournament.setupByes()">Next · Choose pattern</button>'+button('Cancel','cancelEditor()')+'</div>';var workspace=root.querySelector('.scs-tm-workspace');if(workspace)root.insertBefore(el,workspace);else root.appendChild(el);function update(){var n=Number(el.querySelector('#tmCount').value),l=Number(el.querySelector('#tmLeft').value),r=Number(el.querySelector('#tmRight').value),valid=Number.isInteger(n)&&n>=4&&n<=64&&Number.isInteger(l)&&l>=1&&Number.isInteger(r)&&r>=1&&l+r===n,needL=valid?firstRoundByeNeed(l):0,needR=valid?firstRoundByeNeed(r):0;el.querySelector('#tmSetupStatus').textContent=valid?'Left '+l+' · '+needL+' bye(s) · Right '+r+' · '+needR+' bye(s).':'Left + Right must equal Total teams.';el.querySelector('#tmNextByes').disabled=!valid}el.querySelector('#tmCount').addEventListener('input',function(){var n=Number(this.value);if(Number.isInteger(n)&&n>=4&&n<=64){var l=Math.ceil(n/2);el.querySelector('#tmLeft').value=l;el.querySelector('#tmRight').value=n-l}update()});['#tmLeft','#tmRight'].forEach(function(q){el.querySelector(q).addEventListener('input',update)});update()}
function setupByes(){
  var panel=root&&root.querySelector('.scs-tm-editor');if(!panel)return;
  var n=Number(panel.querySelector('#tmCount').value),l=Number(panel.querySelector('#tmLeft').value),r=Number(panel.querySelector('#tmRight').value),title=panel.querySelector('#tmTitle').value.trim()||'Tournament';
  if(!Number.isInteger(n)||n<4||n>64||!Number.isInteger(l)||!Number.isInteger(r)||l<1||r<1||l+r!==n){alert('Left + Right must equal Total teams.');return}
  var needL=firstRoundByeNeed(l),needR=firstRoundByeNeed(r),names=Array.from({length:n},function(_,i){return draw.entries[i]&&draw.entries[i].name||'Entry '+(i+1)});
  var rec=scanRecognition&&scanRecognition.total===n&&scanRecognition.left===l&&scanRecognition.right===r?scanRecognition:null;
  var leftIds=Array.from({length:l},function(_,i){return i+1}),rightIds=Array.from({length:r},function(_,i){return l+i+1}),patterns=buildByePatterns(leftIds,rightIds,needL,needR);
  if(!patterns.left.length||!patterns.right.length){alert('SCS could not build a valid balanced BYE pattern for these side counts.');return}
  var leftIndex=0,rightIndex=0;if(rec){var lk=(rec.leftByeIds||[]).slice().sort(function(a,b){return a-b}).join(','),rk=(rec.rightByeIds||[]).slice().sort(function(a,b){return a-b}).join(',');var lf=patterns.left.findIndex(function(p){return (p.byes||[]).slice().sort(function(a,b){return a-b}).join(',')===lk&&(rec.leftBranchCut==null||Number(rec.leftBranchCut)===Number(p.cut))}),rf=patterns.right.findIndex(function(p){return (p.byes||[]).slice().sort(function(a,b){return a-b}).join(',')===rk&&(rec.rightBranchCut==null||Number(rec.rightBranchCut)===Number(p.cut))});if(lf>=0)leftIndex=lf;if(rf>=0)rightIndex=rf}
  byeSelection={total:n,leftCount:l,needLeft:needL,needRight:needR,leftSelected:[],rightSelected:[],leftPatterns:patterns.left,rightPatterns:patterns.right,leftIndex:leftIndex,rightIndex:rightIndex,patternMode:'left',title:title,names:names,imageReference:!!scanImage};
  applyCurrentByePattern();
}
async function confirmByeSelection(){
  if(!byeSelection)return;
  if(byeSelection.leftSelected.length!==byeSelection.needLeft||byeSelection.rightSelected.length!==byeSelection.needRight){alert('Select the required BYE positions on both sides.');return}
  var next=generateCustomTwoSided(byeSelection.total,byeSelection.leftCount,byeSelection.leftSelected,byeSelection.rightSelected,byeSelection.title,byeSelection.names,byeSelection.leftCut,byeSelection.rightCut);next.imageReference=byeSelection.imageReference;byeSelection=null;if(assistStep===2){draw=next;selected=null;swapEntryId=null;saveAssistDraft();assistBack();return}assistStep=3;await commitDraw(next,!!scanImage);
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
  var a=document.activeElement;
  if(a&&root&&root.contains(a)&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.tagName==='SELECT'))return;
  render();
}
function liveTab(name){if(!draw)return;draw.liveTab=name;render();}
function approveLive(id){var g=window.SCSCourtCenter&&SCSCourtCenter.tournamentGame&&SCSCourtCenter.tournamentGame(id);if(!g)return;if(g.score_status!=='scored'){alert('Complete the score first.');return;}if(window.SCSCourtCenter&&SCSCourtCenter.approve)SCSCourtCenter.approve(g.ccid).then(function(){draw.liveTab='completed';localTournamentSave(draw);render();});}
function chooseCourt(n){draw.assigningCourt=Number(n)||0;draw.liveTab='waiting';render()}
function assign(id){
 if(readonly||!draw)return;
 var info=matchInfo(id),cc=window.SCSCourtCenter;if(!info||!cc||!cc.assignTournamentMatch){alert('Tournament courts unavailable.');return;}
 var state=cc.liveState(),games=state.games||[],current=games.find(function(g){return Number(g.tournament_match)===Number(id)});
 if(current&&(current.started_at||current.score||current.score_status)){alert('This match has already started.');return;}
 draw.assigningMatch=Number(id);render();
}
function cancelCourtSelection(){if(draw){draw.assigningMatch=0;render()}}
async function selectAssignmentCourt(court){
 if(!draw||!draw.assigningMatch)return;
 var id=Number(draw.assigningMatch),cc=window.SCSCourtCenter,state=cc.liveState(),games=state.games||[];
 var occupied=games.find(function(g){return Number(g.court)===Number(court)&&g.court_center_status!=='approved'&&Number(g.tournament_match)!==id});
 if(occupied&&(occupied.started_at||occupied.score||occupied.score_status)){alert('This court has a started match.');return;}
 if(occupied&&!confirm('Replace Match '+occupied.tournament_match+' on Court '+court+'?'))return;
 try{var ok=await cc.assignTournamentMatch(id,matchInfo(id),Number(court));if(ok){draw.assigningMatch=0;render()}}
 catch(e){alert(e.message||'Court assignment failed.');}
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
function startCourtMatch(id){if(!window.SCSCourtCenter||!SCSCourtCenter.startTournamentMatch)return;SCSCourtCenter.startTournamentMatch(id).then(function(ok){if(ok){render();if(window.SCSScoring&&SCSScoring.open)SCSScoring.open()}})}

function approved(id,winner){var info=matchInfo(id);if(!info||winner!==info.a&&winner!==info.b)throw Error('Winner must match a team in the bracket');draw.results[id]={winner:winner,loser:winner===info.a?info.b:info.a};render()}
window.SCSTournament={assistOpen:assistOpen,assistBack:assistBack,assistPatternPage:assistPatternPage,assistClearPattern:assistClearPattern,assistConfirmPage:assistConfirmPage,assistAddTeam:assistAddTeam,addNextTeam:addNextTeam,assistRemoveTeam:assistRemoveTeam,assistFinishPlayers:assistFinishPlayers,autoAssignTournament:autoAssignTournament,togglePool:togglePool,setBracketHeight:setBracketHeight,switchTournamentCenterTab:switchTournamentCenterTab,openPlayersManager:openPlayersManager,playersManagerReturned:playersManagerReturned,filterPlayerPool:filterPlayerPool,setPoolPlayer:setPoolPlayer,chooseCourt:chooseCourt,selectAssignmentCourt:selectAssignmentCourt,cancelCourtSelection:cancelCourtSelection,changeLiveCourts:changeLiveCourts,startCourtMatch:startCourtMatch,liveTab:liveTab,approveLive:approveLive,renderLive:renderLiveSafe,init:init,analyzeBracketImage:analyzeBracketImage,generate:generate,generateTwoSided:generateTwoSided,generateCustomTwoSided:generateCustomTwoSided,emptyBracket:emptyBracket,cleanOCR:cleanOCR,splitTeam:splitTeam,removeEntry:removeEntry,load:load,open:open,close:close,pickImage:pickImage,renderHome:renderHome,manualCreate:manualCreate,editPattern:editPattern,setupByes:setupByes,confirmByeSelection:confirmByeSelection,cancelByeSelection:cancelByeSelection,nextByePattern:nextByePattern,setByePatternMode:setByePatternMode,createManualTemplate:createManualTemplate,createImageFlow:createImageFlow,backToImportedImage:backToImportedImage,buildImageFlow:buildImageFlow,select:select,entryTap:entryTap,editEntry:editEntry,closeEntryPopup:closeEntryPopup,doneEntry:doneEntry,editEntry:editEntry,saveEntry:saveEntry,fit:fit,zoomBy:zoomBy,edit:edit,editor:editor,review:review,cancelEditor:cancelEditor,scan:scan,example:example,recognize:recognize,applyScan:applyScan,saveScan:saveScan,cancelReview:cancelReview,assign:assign,approved:approved,matchInfo:matchInfo,clearTournament:clearTournament,saveTournament:saveTournament,startLive:startLive,enterSavedTournament:enterSavedTournament,startSavedTournament:startSavedTournament,setTournamentCourts:setTournamentCourts,openCourtCenter:openCourtCenter};
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
