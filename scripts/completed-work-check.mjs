import assert from 'node:assert/strict';
import {completedWorkMarker} from '../src/completed-work.mjs';

export function verifyCompletedWork(source) {
  const at = source.indexOf(completedWorkMarker);
  assert.ok(at >= 0,'Completed work default marker found');
  assert.equal(source.indexOf(completedWorkMarker,at+1),-1,'Only the reviewed work grouping default changes');
  const start=source.lastIndexOf('function ',at),tail=source.slice(start);
  let fn;
  for(let end=tail.indexOf('}');end>=0&&end<6000;end=tail.indexOf('}',end+1)){
    try{new Function('return ('+tail.slice(0,end+1)+')');fn=tail.slice(0,end+1);break;}catch{}
  }
  assert.ok(fn,'Native work grouping function extracted');
  const options=fn.match(/^function [\w$]+\([\w$]+,[\w$]+,([\w$]+)\)/)[1];
  const project=fn.match(/\.useProjectWorkGrouping\)return ([\w$]+)\(/)[1];
  const trim=fn.match(/\.trimSettledThinkingTail\?([\w$]+)\(/)[1];
  const split=fn.match(/,([\w$]+)=([\w$]+)\([\w$]+\),[\w$]+=\[\];for/)[2];
  const pending=fn.match(/\.work\.some\(([\w$]+)\)/)[1];
  const assemble=fn.match(/\.push\(\.\.\.([\w$]+)\(\{idPrefix:/)[1];
  const deps={
    [project]:value=>({project:true,...value}),[trim]:rows=>rows,
    [split]:rows=>[{leadNotifications:[],work:rows}],[pending]:row=>row.pending===true,
    [assemble]:value=>value.completed?[{kind:'workGroup',defaultOpen:value.defaultOpen,rows:value.workRows.slice(0,-1)},value.workRows.at(-1)]:value.workRows
  };
  const load=text=>new Function(...Object.keys(deps),'return ('+text+')')(...Object.values(deps));
  const group=load(fn),original=load(fn.replace('!1'+completedWorkMarker,options+'.isLastTurn&&'+options+'.unfoldLatestTurn'));
  const rows=[{kind:'activity',text:'PROCESS'},{kind:'assistantMarkdown',text:'FINAL'}];
  const input={isCompletedTurn:true,isLastTurn:true,unfoldLatestTurn:true};
  assert.equal(original('turn',rows,input)[0].defaultOpen,true,'Original latest-turn expansion reproduced');
  const result=group('turn',rows,input);
  assert.equal(result[0].defaultOpen,false);
  assert.strictEqual(result[1],rows[1],'Final message remains outside the completed disclosure');
  assert.deepEqual(group('turn',rows,{...input,isCompletedTurn:false}),rows,'Active progress stays visible');
  assert.equal(group('turn',rows,{...input,useProjectWorkGrouping:true}).project,true,'Existing project grouping remains intact');
  console.log('Native Worked for grouping: completed latest turn defaults closed; active progress and final message retained.');
}
