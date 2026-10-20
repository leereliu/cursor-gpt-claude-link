import test from 'node:test';
import assert from 'node:assert/strict';
import {patchCompletedWork} from '../src/completed-work.mjs';

test('completed latest-turn groups start folded while active progress remains unchanged',()=>{
  const source='function group(rows,n){if(!n.isCompletedTurn)return rows;return [{kind:"workGroup",defaultOpen:n.isLastTurn&&n.unfoldLatestTurn,rows:rows.slice(0,-1)},rows.at(-1)]}';
  const load=text=>new Function(text+';return group')();
  const rows=[{text:'process'},{text:'final'}],options={isCompletedTurn:true,isLastTurn:true,unfoldLatestTurn:true};
  assert.equal(load(source)(rows,options)[0].defaultOpen,true);
  const group=load(patchCompletedWork(source));
  assert.equal(group(rows,options)[0].defaultOpen,false);
  assert.strictEqual(group(rows,options)[1],rows[1]);
  assert.strictEqual(group(rows,{...options,isCompletedTurn:false}),rows);
});

test('unknown, ambiguous and already-patched work grouping anchors are rejected',()=>{
  const source='defaultOpen:options.isLastTurn&&options.unfoldLatestTurn';
  assert.throws(()=>patchCompletedWork('unknown'),/not unique/);
  assert.throws(()=>patchCompletedWork(source+';'+source),/not unique/);
  assert.throws(()=>patchCompletedWork(patchCompletedWork(source)),/already present/);
});
