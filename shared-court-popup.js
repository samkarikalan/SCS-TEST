/* One court-assignment popup for Team, Knockout and other SCS tournaments. */
(function(){'use strict';
let active=null;
function close(){if(active){active.remove();active=null;}}
function open(opts){
 close();const o=opts||{},overlay=document.createElement('div');active=overlay;
 overlay.className='scs-court-popup-overlay';overlay.setAttribute('role','presentation');
 const modal=document.createElement('section');modal.className='scs-court-popup';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Assign Court');
 const head=document.createElement('div');head.className='scs-court-popup-head';
 const h=document.createElement('h3');h.textContent='Assign Court';head.appendChild(h);
 const x=document.createElement('button');x.type='button';x.textContent='×';x.setAttribute('aria-label','Close');x.onclick=close;head.appendChild(x);modal.appendChild(head);
 const subtitle=document.createElement('p');subtitle.textContent=String(o.title||'');modal.appendChild(subtitle);
 const choices=document.createElement('div');choices.className='scs-court-popup-choices';
 (o.courts||[]).forEach(c=>{const b=document.createElement('button');b.type='button';b.className='scs-court-popup-option';b.disabled=!!c.occupied;b.textContent='Court '+c.number+' · '+(c.occupied?'Occupied':'Free');b.onclick=()=>{if(b.disabled)return;const result=o.onChoose&&o.onChoose(c.number);if(result&&typeof result.then==='function'){b.disabled=true;result.then(ok=>{if(ok!==false)close();else b.disabled=false}).catch(()=>{b.disabled=false})}else if(result!==false)close()};choices.appendChild(b)});
 modal.appendChild(choices);
 const cancel=document.createElement('button');cancel.type='button';cancel.className='scs-court-popup-cancel';cancel.textContent='Cancel';cancel.onclick=close;modal.appendChild(cancel);
 overlay.appendChild(modal);overlay.onclick=e=>{if(e.target===overlay)close()};
 overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close()}});
 document.body.appendChild(overlay);x.focus();return overlay;
}
window.SCSCourtAssignmentPopup={open,close};
})();
