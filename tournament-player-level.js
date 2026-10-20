
(function(){
'use strict';
const cache=new Map(),pending=new Map(),key=n=>String(n||'').trim().toLocaleLowerCase();
const valid=v=>v!==null&&v!==undefined&&Number.isInteger(Number(v))&&Number(v)>=1&&Number(v)<=5;
async function load(name){
 // Legacy cards have no selected player identity; never query across unrelated clubs.
 return null;
}
function ring(name,gender,level){
 const e=createRatingRing(name,gender||'Male',valid(level)?6-Number(level):null);
 e.classList.add('scs-tournament-level-ring');

 e.title=valid(level)?'Level '+level+' (1 strongest, 5 weakest)':'Level unavailable';
 return e;
}
function hydrate(root){
 if(!root||typeof createRatingRing!=='function')return;
 root.querySelectorAll('.scs-tm-ring-slot[data-tm-player]').forEach(async slot=>{
  if(slot.dataset.levelPending==='1')return;
  const name=slot.dataset.tmPlayer;if(!name)return;
  slot.dataset.levelPending='1';
  const info=await load(name);
  if(!slot.isConnected)return;
  slot.replaceChildren(ring(name,info?.gender,info?.level));
  slot.dataset.levelPending='0';
  const label=slot.closest('.scs-tm-shared-player')?.querySelector('.scs-tournament-gender-level');
  if(label){const prefix=/female|woman|lady|women|f$/i.test(String(info?.gender||''))?'L':'M';label.textContent=valid(info?.level)?prefix+info.level:'—';label.classList.toggle('scs-level-female',prefix==='L');}
 });
}
window.SCSTournamentPlayerLevel={hydrate,load,ring,clear:()=>cache.clear()};
})();
