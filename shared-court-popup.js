/* Shared court assignment and success confirmation for all tournament formats. */
(function(){'use strict';
let active=null,confirmation=null,confirmationTimer=null;
function close(){if(active){active.remove();active=null;}}
function clearConfirmation(){if(confirmationTimer){clearTimeout(confirmationTimer);confirmationTimer=null;}if(confirmation){confirmation.remove();confirmation=null;}}
function showConfirmation(title,court){
 clearConfirmation();
 const notice=document.createElement('div');notice.className='scs-court-confirmation';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');
 const panel=document.createElement('div');panel.className='scs-court-confirmation-panel';
 const mark=document.createElement('span');mark.className='scs-court-confirmation-check';mark.textContent='✓';mark.setAttribute('aria-hidden','true');
 const heading=document.createElement('strong');heading.textContent='Court Assigned!';
 const match=document.createElement('div');match.className='scs-court-confirmation-match';match.textContent=String(title||'Match');
 const location=document.createElement('div');location.className='scs-court-confirmation-location';location.textContent='Court '+court+' · Ready to start';
 const hint=document.createElement('div');hint.className='scs-court-confirmation-hint';hint.textContent='Available in Match Center';
 panel.append(mark,heading,match,location,hint);notice.appendChild(panel);document.body.appendChild(notice);confirmation=notice;
 confirmationTimer=setTimeout(()=>{if(confirmation===notice)clearConfirmation()},1500);
}
function open(opts){
 close();clearConfirmation();const o=opts||{},overlay=document.createElement('div');active=overlay;
 overlay.className='scs-court-popup-overlay';overlay.setAttribute('role','presentation');
 const modal=document.createElement('section');modal.className='scs-court-popup';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Assign Court');
 const head=document.createElement('div');head.className='scs-court-popup-head';
 const h=document.createElement('h3');h.textContent='Assign Court';head.appendChild(h);
 const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label','Close');x.onclick=close;head.appendChild(x);modal.appendChild(head);
 const subtitle=document.createElement('p');subtitle.textContent=String(o.title||'');modal.appendChild(subtitle);
 const choices=document.createElement('div');choices.className='scs-court-popup-choices';
 let pending=false;
 (o.courts||[]).forEach(c=>{const b=document.createElement('button');b.type='button';b.className='scs-court-popup-option';b.disabled=!!c.occupied;b.textContent='Court '+c.number+' · '+(c.occupied?'Occupied':'Free');
 b.onclick=()=>{
  if(b.disabled||pending||active!==overlay)return;
  pending=true;choices.querySelectorAll('button').forEach(button=>button.disabled=true);
  const finish=ok=>{if(active!==overlay)return;if(ok!==false){close();showConfirmation(o.title,c.number)}else{pending=false;choices.querySelectorAll('button').forEach((button,i)=>{button.disabled=!!o.courts[i].occupied})}};
  try{const result=o.onChoose&&o.onChoose(c.number);if(result&&typeof result.then==='function')result.then(finish).catch(()=>finish(false));else finish(result)}catch(e){console.error('Court assignment failed:',e);finish(false)}
 };choices.appendChild(b)});
 modal.appendChild(choices);
 const cancel=document.createElement('button');cancel.type='button';cancel.className='scs-court-popup-cancel';cancel.textContent='Cancel';cancel.onclick=close;modal.appendChild(cancel);
 overlay.appendChild(modal);overlay.onclick=e=>{if(e.target===overlay)close()};
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 document.body.appendChild(overlay);x.focus();return overlay;
}
window.SCSCourtAssignmentPopup={open,close,showConfirmation};
})();
