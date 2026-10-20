import assert from 'node:assert/strict';
import {taskDisplayConfig, taskDisplaySelection, plainSubscriptionModel} from '../src/subagent-display.mjs';

export function verifySubagentDisplay(source) {
  const match = source.match(/function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)\)\{const __selected=__cursorLinkTaskDisplaySelection\(/);
  assert.ok(match,'Native Task model label function found');
  const tail = source.slice(match.index);
  let fn;
  for(let end=tail.indexOf('}');end>=0&&end<4000;end=tail.indexOf('}',end+1)){
    try { new Function('return ('+tail.slice(0,end+1)+')'); fn=tail.slice(0,end+1); break; } catch {}
  }
  assert.ok(fn,'Native Task model label function end found');
  const format = fn.match(/if\(__selected\)return ([\w$]+)\(/)[1];
  const native = fn.match(/;const ([\w$]+)=([\w$]+)\([^;]+\?\.maxMode\);if\(\1===([\w$]+)\)/);
  assert.ok(native,'Original bare model label path retained');
  const deps={__cursorLinkTaskDisplaySelection:taskDisplaySelection,__cursorLinkPlainTaskModel:plainSubscriptionModel,
    [format]:selected=>selected.parameters,[native[2]]:id=>'native:'+id,[native[3]]:'composer-1'};
  const display=new Function(...Object.keys(deps),'return ('+fn+')')(...Object.values(deps));
  for(const modelId of ['chatgpt-codex/gpt-6.1-sol','claude-subscription/opus']){
    const parameters=[{id:'reasoning',value:'xhigh'},{id:'fast',value:'true'},{id:'context',value:'500000'}];
    const config={maxMode:true,selectedModels:[{modelId,parameters}]};
    const models=[{name:modelId,clientDisplayName:'Subscription model'}];
    assert.strictEqual(display(modelId,models,config),parameters);
    assert.equal(display(modelId,models,undefined),'Subscription model');
    assert.strictEqual(taskDisplayConfig(false,config),config);
  }
  assert.equal(display('native-model',[],undefined),'native:native-model');
  assert.match(source,/const [\w$]+=__cursorLinkTaskDisplayConfig\([\w$]+,[\w$]+\?\.data\.modelConfig\)/);
  console.log('Native Task labels: actual child reasoning/Fast/context retained; missing parameters do not advertise Low.');
}
