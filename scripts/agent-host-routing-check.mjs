import assert from 'node:assert/strict';
import {createChatgptExecutionStrategy} from '../src/agent-host-routing.mjs';

export function verifyAgentHostRouting(source) {
  const match=source.match(/this\._executionStrategy=(createChatgptExecutionStrategy\(([\w$]+)\?\.executionStrategy,new ([\w$]+)\(this\.agentClientService\)\))/);
  assert.ok(match,'Actual AgentCompat constructor routes subscription models before Agent Host');
  const factory=new Function('createChatgptExecutionStrategy',match[2],match[3],'return '+match[1]);
  const local=class { executeTurn(turn) { return {kind:'local',turn}; } };
  const primary={executeTurn(turn) { return {kind:'host',turn}; }};
  const route=factory.call({agentClientService:{}},createChatgptExecutionStrategy,{executionStrategy:primary},local);
  for(const modelId of ['chatgpt-codex/gpt-6.1-sol','ordinary-model']) {
    const turn={modelDetails:{modelId:'default'},runOptions:{requestedModel:{modelId}},conversationState:{turns:['previous']}};
    const result=route.executeTurn(turn);
    assert.equal(result.kind,modelId.startsWith('chatgpt-codex/')?'local':'host');assert.equal(result.turn,turn);
  }
  console.log('Actual AgentCompat constructor: subscription local path and ordinary Agent Host path passed.');
}

export function verifySharedLocalProvider(source) {
  const options=source.match(/\/\* chatgpt-keep-local-provider \*\/[\w$]+\([\w$]+,(\{\.\.\.([\w$]+),registerAgentExecProvider:true\}),\{factory:/);
  const gate=source.match(/function [\w$]+\(([\w$]+)=\{\}\)\{return!1!==\1\.registerAgentExecProvider\}/);
  assert.ok(options,'Actual shared runtime activation retains its local provider');assert.ok(gate,'Native provider registration gate found');
  const enabled=new Function('return ('+gate[0]+')')();
  const hostOptions={registerAgentExecProvider:false,runtimeExtensionPath:'/fixture'};
  assert.equal(enabled(hostOptions),false,'Reproduces the missing provider with native Agent Host options');
  const patchedOptions=new Function(options[2],'return '+options[1])(hostOptions);
  assert.equal(enabled(patchedOptions),true);assert.equal(patchedOptions.runtimeExtensionPath,hostOptions.runtimeExtensionPath);
  console.log('Actual shared runtime activation: local provider registers under Agent Host.');
}
