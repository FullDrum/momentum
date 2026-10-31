/* Fit the original flex outliner to Android's visual viewport above the keyboard. */
(function(){
 'use strict';
 var baseline=window.innerHeight,frame=null;
 function update(){
  frame=null;var app=document.getElementById('app');if(!app)return;
  var mobile=document.body.classList.contains('is-mobile');var viewport=window.visualViewport;
  var height=viewport?viewport.height:window.innerHeight,top=viewport?viewport.offsetTop:0;
  var input=document.activeElement,editing=!!(input&&input.matches('textarea,input:not([type=checkbox]),[contenteditable=true]'));
  if(!editing)baseline=Math.max(height,window.innerHeight);
  var keyboard=mobile&&editing&&(baseline-height>100||height<500);
  document.body.classList.toggle('keyboard-open',keyboard);
  document.documentElement.style.setProperty('--momentum-viewport-height',height+'px');document.documentElement.style.setProperty('--momentum-viewport-top',top+'px');
  var bar=document.getElementById('kbBar'),chat=!!(input&&input.closest('.task-conversation'));
  if(bar&&mobile)bar.classList.toggle('active',editing&&(keyboard||input.classList.contains('node-input')));
  ['kbIndent','kbOutdent','kbUp','kbDown','kbToday'].forEach(function(id){var b=document.getElementById(id);if(b)b.disabled=chat;});
  if(mobile&&editing){
   var tree=document.getElementById('treeEl'),target=input.closest('.task-chat-compose')||input;
   if(tree&&tree.contains(target)){var bounds=tree.getBoundingClientRect(),rect=target.getBoundingClientRect();if(rect.bottom>bounds.bottom-10)tree.scrollTop+=rect.bottom-bounds.bottom+10;else if(rect.top<bounds.top+8)tree.scrollTop-=bounds.top+8-rect.top;}
  }
 }
 function schedule(){if(frame==null)frame=requestAnimationFrame(update);}
 function setup(){
  var bar=document.getElementById('kbBar');if(bar&&!document.getElementById('kbNew')){
   var button=document.createElement('button');button.id='kbNew';button.className='kb-btn';button.type='button';button.textContent='+';button.setAttribute('aria-label','Create task above keyboard');
   button.onmousedown=function(event){event.preventDefault();var input=document.activeElement;if(input&&input.classList.contains('node-input'))input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));else{if(window.MomentumConversations)window.MomentumConversations.close(false);mobileAddItem();}schedule();};bar.insertBefore(button,bar.lastElementChild);
  }
  var done=document.getElementById('kbDone');if(done)done.addEventListener('mousedown',function(event){if(document.activeElement&&document.activeElement.closest('.task-conversation')){event.preventDefault();document.activeElement.blur();schedule();}});
  update();
 }
 document.addEventListener('DOMContentLoaded',setup);document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);window.addEventListener('resize',schedule);
 if(window.visualViewport){window.visualViewport.addEventListener('resize',schedule);window.visualViewport.addEventListener('scroll',schedule);}
 window.addEventListener('orientationchange',function(){baseline=window.innerHeight;schedule();});
})();
