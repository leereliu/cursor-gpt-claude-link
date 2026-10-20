import test from 'node:test';
import assert from 'node:assert/strict';
import {patchSubagentDisplay, taskDisplayConfig, taskDisplaySelection} from '../src/subagent-display.mjs';

const modelId = 'chatgpt-codex/gpt-6.1-sol';
const parameters = [{id:'reasoning',value:'xhigh'},{id:'fast',value:'true'},{id:'context',value:'500000'}];
const config = {maxMode:true,selectedModels:[{modelId,parameters}]};
const catalog = [{name:modelId,clientDisplayName:'GPT-6.1-Sol'}];
const formatter = selection => 'GPT-6.1-Sol ' + (selection.parameters.find(p=>p.id==='reasoning')?.value === 'xhigh' ? 'Extra High Fast' : 'Low');
const original = 'function display(t,e,n){const i=bare(t,e,n?.maxMode);if(i===defaultModel)return"";if(i)return i;const r=n?.selectedModels?.[0];return r?format({modelId:r.modelId,parameters:r.parameters},e,n.maxMode):""}';
const input = original + '\nfunction card(real,child,saved){const De=real?child?.data.modelConfig:void 0,Ne=saved?.modelConfig,be=!De?.selectedModels?.length&&Ne?.selectedModels?.length?Ne:De??Ne,unused=0;return display("'+modelId+'",catalog,be)}';
const setup = source => new Function('bare','format','defaultModel','catalog',source+';return {display,card}')(id=>id===modelId?'GPT-6.1-Sol Low':'bare:'+id,formatter,'composer-1',catalog);

test('Task card reproduces bare-ID loss and displays inherited reasoning and Fast after patching',()=>{
  assert.equal(setup(input).card(false,{data:{modelConfig:config}}),'GPT-6.1-Sol Low');
  const patched = setup(patchSubagentDisplay(input));
  assert.equal(patched.card(false,{data:{modelConfig:config}}),'GPT-6.1-Sol Extra High Fast');
  assert.equal(patched.card(true,{data:{modelConfig:config}}),'GPT-6.1-Sol Extra High Fast');
  assert.strictEqual(taskDisplaySelection(modelId,config).parameters,parameters);
});

test('unloaded subscription parameters do not fabricate Low; explicit low selections stay Low',()=>{
  const {display} = setup(patchSubagentDisplay(input));
  assert.equal(display(modelId,catalog,undefined),'GPT-6.1-Sol');
  assert.equal(display(modelId,catalog,{selectedModels:[{modelId,parameters:[]}]}),'GPT-6.1-Sol');
  assert.equal(display(modelId,catalog,{selectedModels:[{modelId,parameters:[{id:'reasoning',value:'low'}]}]}),'GPT-6.1-Sol Low');
  assert.equal(display('native-model',catalog,config),'bare:native-model');
  assert.equal(display(modelId+'[reasoning=low]',catalog,config),'bare:'+modelId+'[reasoning=low]');
});

test('live bubble metadata is accepted for both subscription providers and ordinary cards retain native handling',()=>{
  for(const id of [modelId,'claude-subscription/opus']){
    const value={selectedModels:[{modelId:id,parameters}]};
    assert.strictEqual(taskDisplayConfig(false,value),value);
    assert.strictEqual(taskDisplaySelection(id,value).parameters,parameters);
    assert.equal(taskDisplaySelection('another-model',value),undefined);
  }
  const ordinary={selectedModels:[{modelId:'native-model',parameters}]};
  assert.equal(taskDisplayConfig(false,ordinary),undefined);
  assert.strictEqual(taskDisplayConfig(true,ordinary),ordinary);
});

test('ambiguous or changed native anchors stop patch generation',()=>{
  assert.throws(()=>patchSubagentDisplay('unknown build'),/display anchor/);
  assert.throws(()=>patchSubagentDisplay(input+original),/display anchor/);
  assert.throws(()=>patchSubagentDisplay(original),/config anchor/);
  assert.throws(()=>patchSubagentDisplay(patchSubagentDisplay(input)),/already present/);
});
