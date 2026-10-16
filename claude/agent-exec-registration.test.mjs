import test from 'node:test';
import assert from 'node:assert/strict';
import {patchAgentExecRegistration} from './agent-exec-registration.mjs';
import {verifyAgentExecRegistration} from './scripts/agent-exec-registration-check.mjs';

const fixture = `const Fl={activate:(Ul={state:Al,activate:ql,deactivate:Nl}).activate,deactivate:Ul.deactivate,getGitExecutor:()=>Ul.state.activeGitExecutor,getMcpProvider:()=>Ul.state.activeMcpProvider};var Ul;let Ll=!1;async function $l(e){if(G.cursor.cursorAgentHostEnabled){const n=(t=Fl,r=e.extensionPath,{...t,extensionPath:r});e.subscriptions.push(G.cursor.registerAgentHostRuntime(n));if(function(e){return e.localLoopEnabled&&!e.moveExecEnabled}({moveExecEnabled:await Promise.resolve(G.cursor.checkFeatureGate(El)).catch(()=>!1),localLoopEnabled:await Promise.resolve(G.cursor.checkFeatureGate(Il)).catch(()=>!1)})){const{disposeProvider:t}=$a({context:e,runtimeExtensionPath:e.extensionPath,serviceCtx:(0,f.q6)()});e.subscriptions.push({dispose:t})}return}var t,r;G.cursor.cursorAgentHostEnabled||(await ql(e),Ll=!0)}async function jl(){Ll&&(Ll=!1,await Nl())}`;

test('shared native provider registers without initializing alongside independent Agent Host', async () => {
  await verifyAgentExecRegistration(patchAgentExecRegistration(fixture));
});

test('combined provider installation preserves one native registration patch', () => {
  const patched = patchAgentExecRegistration(fixture);
  assert.equal(patchAgentExecRegistration(patched), patched);
  assert.equal(patched.split('/* subscription-agent-exec-provider */').length, 2);
});

test('unrecognized native activation contract is rejected before applying patches', () => {
  assert.throws(() => patchAgentExecRegistration(fixture.replace('activate:ql,deactivate:Nl}).activate', 'activate:ql}).activate')), /anchor/);
});
