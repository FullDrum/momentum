/* Shared proposals and sandbox application. No network or automatic writes. */
(function(root){
  'use strict';
  var TYPES=['related','blocks','supports','alternative'];
  function index(nodes){var out=Object.create(null);(nodes||[]).forEach(function(n){if(out[String(n.id)])throw new Error('Duplicate task ID');out[String(n.id)]=n;});return out;}
  function isAncestor(map,ancestor,descendant){
    var seen=Object.create(null),at=String(descendant);
    while(at&&map[at]){if(at===String(ancestor))return true;if(seen[at])throw new Error('Existing parent cycle');seen[at]=true;at=map[at].parentId==null?'':String(map[at].parentId);}
    return false;
  }
  function fingerprint(nodes){return JSON.stringify(nodes.map(function(n){return [String(n.id),n.name,n.parentId||null,!!n.isSection,!!n.readOnlyContext,n.owner||'',!!n.done];}).sort(function(a,b){return a[0].localeCompare(b[0]);}));}
  function writable(n){if(n.readOnlyContext)throw new Error('Read-only task cannot be changed');}
  function proposeMove(nodes,taskId,parentId){
    var map=index(nodes),id=String(taskId),pid=parentId==null||parentId===''?null:String(parentId);
    if(!map[id])throw new Error('Task not found');writable(map[id]);
    if(pid!==null&&!map[pid])throw new Error('Destination not found');
    if(pid!==null){writable(map[pid]);if(isAncestor(map,id,pid))throw new Error('Cannot move a task under itself or its descendant');}
    if(map[id].isSection)throw new Error('Moving sections requires a separate review');
    if((map[id].parentId||null)===pid)throw new Error('Task is already under that parent');
    return {kind:'move',taskId:id,taskName:map[id].name,fromParentId:map[id].parentId||null,
      fromParentName:map[id].parentId&&map[String(map[id].parentId)]?map[String(map[id].parentId)].name:'Inbox / root',
      toParentId:pid,toParentName:pid?map[pid].name:'Inbox / root',requiresApproval:true,revision:fingerprint(nodes)};
  }
  function proposeLink(nodes,fromId,toId,type){
    var map=index(nodes),from=String(fromId),to=String(toId),t=String(type||'related');
    if(!map[from]||!map[to])throw new Error('Task not found');
    writable(map[from]);writable(map[to]);
    if(map[from].isSection||map[to].isSection)throw new Error('Relationships require two tasks');
    if(from===to)throw new Error('A task cannot link to itself');
    if(TYPES.indexOf(t)<0)throw new Error('Unknown relationship');
    return {kind:'link',fromId:from,toId:to,fromName:map[from].name,toName:map[to].name,type:t,requiresApproval:true,revision:fingerprint(nodes)};
  }
  function applyProposal(nodes,links,proposal,approved){
    if(approved!==true)throw new Error('Explicit approval required');
    if(!proposal||proposal.revision!==fingerprint(nodes))throw new Error('Tasks changed. Preview again.');
    var next=nodes.map(function(n){return Object.assign({},n);}),nextLinks=links.slice();
    if(proposal.kind==='move'){
      proposeMove(nodes,proposal.taskId,proposal.toParentId);
      next.find(function(n){return String(n.id)===proposal.taskId;}).parentId=proposal.toParentId;
    }else if(proposal.kind==='link'){
      proposeLink(nodes,proposal.fromId,proposal.toId,proposal.type);
      var symmetric=['related','alternative'].indexOf(proposal.type)>=0;
      if(nextLinks.some(function(l){return l.type===proposal.type&&((l.fromId===proposal.fromId&&l.toId===proposal.toId)||(symmetric&&l.fromId===proposal.toId&&l.toId===proposal.fromId));}))throw new Error('Relationship already exists');
      nextLinks.push({fromId:proposal.fromId,toId:proposal.toId,type:proposal.type});
    }else throw new Error('Unknown proposal');
    return {nodes:next,links:nextLinks};
  }
  var STOP=new Set('a an and are as at be by for from in is it of on or task the this to with need please'.split(' '));
  function tokens(text){return Array.from(new Set((String(text||'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]).filter(function(t){return t.length>2&&!STOP.has(t);})));}
  function suggest(nodes,text,excludeId){
    var query=tokens(text);if(!query.length)return [];
    return nodes.filter(function(n){return !n.isSection&&!n.readOnlyContext&&!n.done&&String(n.id)!==String(excludeId);}).map(function(n){
      var terms=tokens(n.name),shared=query.filter(function(t){return terms.indexOf(t)>=0;});
      return {taskId:n.id,name:n.name,score:shared.length/Math.sqrt(query.length*Math.max(terms.length,1)),reason:'Shared words: '+shared.join(', '),matches:shared.length};
    }).filter(function(s){return s.matches>0;}).sort(function(a,b){return b.score-a.score||String(a.taskId).localeCompare(String(b.taskId));}).slice(0,3);
  }
  root.MomentumTaskRelations={types:TYPES.slice(),proposeMove:proposeMove,proposeLink:proposeLink,applyProposal:applyProposal,suggest:suggest};
})(typeof window!=='undefined'?window:globalThis);
