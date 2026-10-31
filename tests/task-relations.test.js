const {test}=require('node:test');const assert=require('node:assert/strict');require('../task-relations.js');
const R=globalThis.MomentumTaskRelations;
const seed=()=>[{id:'goal',name:'Decanter import',parentId:null},{id:'freight',name:'Confirm decanter freight quote',parentId:'goal'},{id:'bill',name:'Freight bill of lading',parentId:null},{id:'other',name:'Plant equipment',parentId:null}];
test('moves require approval, preserve source, and reject cycles/no-ops',()=>{
 const nodes=seed(),proposal=R.proposeMove(nodes,'bill','goal');
 assert.throws(()=>R.applyProposal(nodes,[],proposal,false),/approval/);
 const changed=R.applyProposal(nodes,[],proposal,true);assert.equal(changed.nodes[2].parentId,'goal');assert.equal(nodes[2].parentId,null);
 assert.throws(()=>R.proposeMove(nodes,'goal','freight'),/descendant/);assert.throws(()=>R.proposeMove(nodes,'freight','goal'),/already/);
 assert.equal(R.applyProposal(nodes,[],R.proposeMove(nodes,'freight',null),true).nodes[1].parentId,null);
});
test('stale proposals reject changed parent, title, deletion and permissions',()=>{
 const nodes=seed(),p=R.proposeMove(nodes,'bill','goal');
 for(const change of [n=>n[0].name='Changed',n=>n[2].parentId='other',n=>n.pop(),n=>n[0].readOnlyContext=true]){
  const changed=seed();change(changed);assert.throws(()=>R.applyProposal(changed,[],p,true),/changed/);
 }
});
test('links keep primary parent; symmetric duplicates rejected, blockers directional',()=>{
 const nodes=seed(),p=R.proposeLink(nodes,'freight','other','supports'),changed=R.applyProposal(nodes,[],p,true);
 assert.equal(changed.nodes[1].parentId,'goal');assert.equal(changed.links.length,1);
 const a=R.proposeLink(nodes,'freight','bill','related'),links=R.applyProposal(nodes,[],a,true).links;
 assert.throws(()=>R.applyProposal(nodes,links,R.proposeLink(nodes,'bill','freight','related'),true),/already exists/);
 assert.equal(R.applyProposal(nodes,[{fromId:'bill',toId:'freight',type:'blocks'}],R.proposeLink(nodes,'freight','bill','blocks'),true).links.length,2);
 assert.throws(()=>R.proposeLink(nodes,'bill','bill','related'),/itself/);
});
test('read-only tasks and sections cannot receive relationships',()=>{
 const nodes=seed();nodes[1].readOnlyContext=true;nodes[0].isSection=true;
 assert.throws(()=>R.proposeLink(nodes,'freight','bill','related'),/Read-only/);
 assert.throws(()=>R.proposeLink(nodes,'bill','goal','related'),/two tasks/);
});
test('suggestions rank relevant tasks, explain matches, exclude completed/private/context and cap at three',()=>{
 const nodes=seed().concat([{id:'done',name:'Freight',done:true},{id:'context',name:'Freight',readOnlyContext:true},{id:'section',name:'Freight',isSection:true}]);
 const suggestions=R.suggest(nodes,'Confirm decanter freight booking','goal');
 assert.equal(suggestions[0].taskId,'freight');assert.match(suggestions[0].reason,/decanter, freight/);
 assert.ok(suggestions.every(s=>!['goal','done','context','section'].includes(s.taskId)));assert.ok(suggestions.length<=3);
 assert.deepEqual(R.suggest(nodes,'and the to'),[]);assert.deepEqual(R.suggest(nodes,'unmatched'),[]);
 assert.equal(R.suggest([{id:'ru',name:'Доставка контейнера'}],'Проверить доставку контейнера')[0].taskId,'ru');
});
