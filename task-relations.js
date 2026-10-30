/* Momentum task relationship proposals.
 * A task has one structural parent; cross-project references are separate links.
 * This module only prepares proposals. It NEVER writes task moves automatically.
 */
(function(root){
  'use strict';
  var TYPES=['related','blocks','supports','alternative'];
  function index(nodes){var out=Object.create(null);(nodes||[]).forEach(function(n){out[String(n.id)]=n;});return out;}
  function isAncestor(map,ancestor,descendant){
    var seen=Object.create(null),at=String(descendant);
    while(at && map[at] && !seen[at]){
      if(at===String(ancestor))return true;
      seen[at]=true;at=map[at].parentId==null?'':String(map[at].parentId);
    }
    return false;
  }
  function proposeMove(nodes,taskId,parentId){
    var map=index(nodes),id=String(taskId),pid=parentId==null?null:String(parentId);
    if(!map[id])throw new Error('Task not found');
    if(pid!==null&&!map[pid])throw new Error('Destination not found');
    if(pid===id||(pid!==null&&isAncestor(map,id,pid)))throw new Error('Cannot move a task under itself or its descendant');
    if(map[id].isSection)throw new Error('Moving sections requires a separate review');
    return {kind:'move',taskId:id,taskName:map[id].name,fromParentId:map[id].parentId||null,
      fromParentName:map[id].parentId&&map[String(map[id].parentId)]?map[String(map[id].parentId)].name:'Root',
      toParentId:pid,toParentName:pid?map[pid].name:'Root',requiresApproval:true};
  }
  function proposeLink(nodes,fromId,toId,type){
    var map=index(nodes),from=String(fromId),to=String(toId),t=String(type||'related');
    if(!map[from]||!map[to])throw new Error('Task not found');
    if(from===to)throw new Error('A task cannot link to itself');
    if(TYPES.indexOf(t)<0)throw new Error('Unknown relationship');
    return {kind:'link',fromId:from,toId:to,fromName:map[from].name,toName:map[to].name,
      type:t,requiresApproval:true};
  }
  root.MomentumTaskRelations={types:TYPES.slice(),proposeMove:proposeMove,proposeLink:proposeLink};
})(typeof window!=='undefined'?window:this);
