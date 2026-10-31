(function(){
  'use strict';
  var key='momentum_next_sandbox_structure_v1',capture=MomentumCapture.createStore(localStorage,'development-demo');
  var seed=[{id:'decanter',name:'Decanter import',parentId:null},
    {id:'freight',name:'Confirm decanter freight quote',parentId:'decanter'},
    {id:'bill',name:'Obtain freight bill of lading',parentId:'decanter'},
    {id:'container',name:'Purchase shipping container',parentId:null},
    {id:'equipment',name:'Plant equipment',parentId:null}];
  function read(){var raw=localStorage.getItem(key);return raw?JSON.parse(raw):{parents:{},links:[]};}
  function getNodes(){
    var state=read(),all=seed.concat(capture.entries('__inbox__').map(function(entry){return {id:entry.id,name:entry.memory.summary,parentId:null};}));
    return all.map(function(n){return Object.assign({},n,{parentId:Object.prototype.hasOwnProperty.call(state.parents,n.id)?state.parents[n.id]:n.parentId});});
  }
  function render(){
    var tasks=getNodes(),state=read(),tree=document.getElementById('tree');tree.replaceChildren();
    function branch(parent,host){tasks.filter(function(n){return n.parentId===parent;}).forEach(function(n){
      var item=document.createElement('div');item.className='task';var button=document.createElement('button');button.textContent=n.name;button.dataset.voiceTask=n.id;
      var children=document.createElement('div');children.className='children';item.append(button,children);host.append(item);branch(n.id,children);
    });}
    branch(null,tree);var links=document.getElementById('links');links.replaceChildren();
    if(!state.links.length)links.textContent='No relationships yet.';
    state.links.forEach(function(l){var item=document.createElement('p');item.className='link';item.textContent=tasks.find(function(n){return n.id===l.fromId;}).name+' — '+l.type+' → '+tasks.find(function(n){return n.id===l.toId;}).name;links.append(item);});
  }
  window.MomentumVoiceEnvironment={getNodes:getNodes,scope:function(){return 'development-demo';},onCapture:render,
    applyProposal:function(proposal,approved){
      var state=read(),result=MomentumTaskRelations.applyProposal(getNodes(),state.links,proposal,approved);
      var parents={};result.nodes.forEach(function(n){parents[n.id]=n.parentId;});
      localStorage.setItem(key,JSON.stringify({parents:parents,links:result.links}));render();
    }};
  document.getElementById('reset').onclick=function(){localStorage.removeItem(key);render();document.getElementById('demo-status').textContent='Structure and links reset. Captured notes are preserved.';};
  render();
})();
