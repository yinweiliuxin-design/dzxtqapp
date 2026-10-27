/* V25: visual viewport and measured chrome. No device sniffing or permissions. */
(function(root){
 'use strict';
 const doc=root.document;if(!doc)return;
 const state=doc.documentElement;let pending=0;
 function update(){
  pending=0;
  const view=root.visualViewport,scale=view?.scale||1,height=view?.height||root.innerHeight;
  state.style.setProperty('--sv-visible-height',Math.round(height)+'px');
  const editable=doc.activeElement?.matches?.('textarea,input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),[contenteditable=true]');
  state.dataset.keyboard=editable&&scale<1.05&&root.innerHeight-height-(view?.offsetTop||0)>120?'open':'closed';
  const nav=doc.querySelector('.bottom-nav'),header=doc.querySelector('.app-header');
  const navHeight=nav&&root.getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().height:0;
  state.style.setProperty('--sv-nav-height',Math.ceil(navHeight)+'px');
  state.style.setProperty('--sv-header-height',Math.ceil(header?.getBoundingClientRect().height||0)+'px');
 }
 function schedule(){if(!pending)pending=root.requestAnimationFrame(update);}
 root.addEventListener('resize',schedule);root.visualViewport?.addEventListener('resize',schedule);root.visualViewport?.addEventListener('scroll',schedule);
 doc.addEventListener('focusin',schedule);doc.addEventListener('focusout',schedule);
 if(root.ResizeObserver){const observer=new root.ResizeObserver(schedule);for(const el of doc.querySelectorAll('.app-header,.bottom-nav'))observer.observe(el);}
 update();
})(window);
