/* Shared mobile player picker for Knockout, Group and Team tournaments. */
(function(){'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function render(host,options){
 const names=[...new Set((options.names||[]).map(String))];let chosen=(options.selected||[]).filter(Boolean).slice(0,options.max||2);
 const max=options.max||2, row=options.row||((n)=>esc(n));
 host.innerHTML='<div class="scs-shared-pick-count" role="status"></div><div class="scs-shared-pick-list">'+names.map(n=>'<button type="button" class="scs-shared-pick-row" data-pick="'+esc(n)+'" aria-pressed="false">'+row(n)+'<span class="scs-shared-pick-check" aria-hidden="true">○</span></button>').join('')+'</div>';
 const update=()=>{host.querySelector('.scs-shared-pick-count').textContent='Selected '+chosen.length+' / '+max;host.querySelectorAll('[data-pick]').forEach(b=>{const yes=chosen.includes(b.dataset.pick);b.setAttribute('aria-pressed',String(yes));b.querySelector('.scs-shared-pick-check').textContent=yes?'✓':'○'});options.onChange&&options.onChange(chosen.slice())};
 decorate(host);host.querySelectorAll('[data-pick]').forEach(b=>b.onclick=()=>{const n=b.dataset.pick,i=chosen.indexOf(n);if(i>=0)chosen.splice(i,1);else if(chosen.length<max)chosen.push(n);else chosen=[...chosen.slice(1),n];update()});update();
 return {getSelected:()=>chosen.slice()};
}
function bindTeamSelectors(modal,config){
 const selects=[...modal.querySelectorAll(config.selector||'select[data-pair]')];
 selects.forEach(sel=>{
  const button=document.createElement('button');button.type='button';button.className='scs-shared-pair-trigger';button.textContent=sel.value||'Select player';sel.after(button);sel.hidden=true;
  button.onclick=()=>{
   const old=modal.querySelector('.scs-shared-pair-overlay');if(old)old.remove();
   const overlay=document.createElement('section');overlay.className='scs-shared-pair-overlay';
   overlay.innerHTML='<div class="scs-shared-pair-panel"><header><strong>Select player</strong><button type="button" data-close aria-label="Close">×</button></header><div data-list></div></div>';modal.appendChild(overlay);
   const list=overlay.querySelector('[data-list]');render(list,{names:[...sel.options].filter(o=>o.value&&!o.disabled).map(o=>o.value).concat(sel.value&&!sel.options[sel.selectedIndex]?.disabled?[sel.value]:[]),selected:sel.value?[sel.value]:[],max:1,row:config.row,onChange:a=>{if(!a.length)return;sel.value=a[0];sel.dispatchEvent(new Event('change',{bubbles:true}));button.textContent=a[0];overlay.remove()}});
   overlay.querySelector('[data-close]').onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  };
  sel.addEventListener('change',()=>button.textContent=sel.value||'Select player');
 });
}

// Consistent level and club pills shared by all tournament formats.
function clubColor(name){let h=2166136261;for(const ch of String(name).trim().toLowerCase()){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return `hsl(${(h>>>0)%360} 58% 43%)`}
function decorate(container){
 if(!container)return;
 container.querySelectorAll('.scs-api-roster-row').forEach(el=>{
  if(el.dataset.scsDecorated==='1')return;
  const player=el.querySelector('.scs-tm-shared-player'),name=el.querySelector('.scs-tm-shared-name');if(!player||!name)return;
  const level=player.querySelector('.scs-tournament-gender-level'),club=el.querySelector('.scs-api-subclub-pill,.scs-team-inline-club-pill');
  const meta=document.createElement('span');meta.className='scs-player-meta';
  if(level){const number=(level.textContent.match(/[1-5]/)||[])[0];level.classList.add('scs-player-level-pill');if(number)level.dataset.level=number;meta.appendChild(level)}
  if(club){club.classList.add('scs-player-club-pill');club.style.setProperty('--scs-club-color',clubColor(club.textContent));meta.appendChild(club)}
  const details=document.createElement('span');details.className='scs-player-details';details.appendChild(name);details.appendChild(meta);player.appendChild(details);el.dataset.scsDecorated='1';
 });
}
window.SCSTeamPicker={render,bindTeamSelectors,decorate,clubColor};
})();
