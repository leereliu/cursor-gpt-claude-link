import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {patchRemoteControlGuard, remoteControlPrelude} from './remote-control.mjs';

const guard = new Function(remoteControlPrelude + '\nreturn __subscriptionRemoteControlGuard;')();
const localWorkspace = {id: 'this-mac-workspace'};
const unavailable = /Subscription models are not available on This Mac \(Remote Control\)/;

function modelConfig(modelId) {
  return {selectedModels: [{modelId}], modelName: modelId};
}

const subscriptionConfigs = ['claude-subscription/opus', 'chatgpt-codex/test-model'].flatMap(modelId => [
  modelConfig(modelId),
  {modelName: modelId, selectedModels: [{modelId: 'grok-4.6'}]},
  {modelName: 'grok-4.6', selectedModels: [{modelId: 'grok-4.6'}, {modelId}]},
  {modelName: 'grok-4.6', selectedModels: [{modelId}, {modelId: 'grok-4.6'}]},
  {modelName: modelId, selectedModels: []},
  {modelName: modelId},
  {selectedModels: [null, {}, {modelId: 7}, {modelId}]}
]);

const remoteControl = config => ({modelConfig: config, usePrivateWorker: true, privateWorkspaceIdentifier: localWorkspace});

test('Remote Control rejects subscription models; pools, cloud VMs and native models pass through', () => {
  for (const config of subscriptionConfigs) {
    assert.throws(() => guard(remoteControl(config)), unavailable);
    assert.doesNotThrow(() => guard({modelConfig: config, usePrivateWorker: true, poolName: 'pool'}));
    assert.doesNotThrow(() => guard({modelConfig: config}));
    for (const usePrivateWorker of [false, 'true', undefined]) {
      assert.doesNotThrow(() => guard({modelConfig: config, usePrivateWorker, privateWorkspaceIdentifier: localWorkspace}));
    }
  }
  assert.doesNotThrow(() => guard(remoteControl(modelConfig('grok-4.6'))));
  for (const modelId of ['claude-subscription', 'chatgpt-codex', 'other/claude-subscription/opus']) {
    assert.doesNotThrow(() => guard(remoteControl(modelConfig(modelId))));
  }
  assert.doesNotThrow(() => guard(remoteControl({selectedModels: [null, {}, {modelId: 7}]})));
  assert.doesNotThrow(() => guard(remoteControl(undefined)));
});

// Mirrors the 3.21.13 CloudAgentRepositoryService.createAgent shape around Cursor's fault-injection point.
const cloudFixture = `class Cloud{constructor(start){this.start=start;this.errors=[]}
async createAgent(t,e,n){const{environment:i,options:r}={environment:e,options:n},s=r.modelConfig,o=r.usePrivateWorker??i.environment.usePrivateWorker,a=r.privateWorkspaceIdentifier??i.environment.privateWorkspaceIdentifier,l=void 0,c=r.poolName,u={...r,modelConfig:s,usePrivateWorker:o,privateWorkspaceIdentifier:a,privateWorkerOwnerFilter:l,poolName:c},{onCreated:d,richText:h}=u,p=r.context;let g,v;try{if(false)throw new ua("Debug simulated cloud agent creation failure",zs.Internal);g=await this.start(u)}catch(X){throw this.errors.push({submitErrorDetails:{message:X.message}}),X}return g}}
class ua extends Error{};const zs={Internal:13};`;

test('cloud createAgent reports the rejection through its submit-error path before the create RPC', async () => {
  const source = patchRemoteControlGuard(cloudFixture);
  execFileSync(process.execPath, ['--check', '--input-type=module'], {input: source, stdio: 'pipe'});
  const Cloud = new Function(source + '\nreturn Cloud;')();
  const started = [];
  const cloud = new Cloud(async options => { started.push(options); return 'created'; });
  const remoteControlEnvironment = {type: 'new', environment: {usePrivateWorker: true, privateWorkspaceIdentifier: localWorkspace}};
  for (const config of subscriptionConfigs) {
    await assert.rejects(cloud.createAgent('prompt', remoteControlEnvironment, {modelConfig: config}), unavailable);
    assert.match(cloud.errors.at(-1).submitErrorDetails.message, unavailable);
  }
  assert.deepEqual(started, []);
  assert.equal(await cloud.createAgent('prompt', remoteControlEnvironment, {modelConfig: modelConfig('grok-4.6')}), 'created');
  const pool = {type: 'new', environment: {usePrivateWorker: true, selectedPoolName: 'pool'}};
  assert.equal(await cloud.createAgent('prompt', pool, {modelConfig: modelConfig('claude-subscription/opus')}), 'created');
});

test('the guard anchor fails closed when missing, duplicated or already rerouted, and patches once', () => {
  assert.throws(() => patchRemoteControlGuard('workbench'), /anchor missing/);
  assert.throws(() => patchRemoteControlGuard(cloudFixture + cloudFixture.replace(/\bu\b(?==\{)/, 'w')), /not unique/);
  const patched = patchRemoteControlGuard(cloudFixture);
  assert.equal(patchRemoteControlGuard(patched), patched);
  assert.throws(() => patchRemoteControlGuard('function __subscriptionRemoteControlEnvironment(){}' + cloudFixture), /earlier Remote Control reroute/);
});
