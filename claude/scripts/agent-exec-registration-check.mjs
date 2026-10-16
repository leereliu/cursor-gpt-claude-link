import assert from 'node:assert/strict';

// Cursor rotates the minified names every build; the shape stays fixed.
// The source may already carry the registration patch, so its wrapper is optional.
function nativeEntrypoints(source) {
  const head = source.match(/const [\w$]+=\{activate:\(([\w$]+)=\{state:([\w$]+),activate:(?:\(context,options\)=>)?([\w$]+)(?:\(context,\{\.\.\.options,registerAgentExecProvider:true\}\))?,deactivate:([\w$]+)\}\)\.activate/);
  const tail = source.match(/async function ([\w$]+)\(\)\{([\w$]+)&&\(\2=!1,await [\w$]+\(\)\)\}/);
  assert.ok(head && tail && tail.index > head.index, 'Native agent-exec activation and cleanup found');
  const text = source.slice(head.index, tail.index + tail[0].length);
  const one = (pattern) => { const match = text.match(pattern); assert.ok(match, 'Native entrypoint symbol found: ' + pattern); return match[1]; };
  const gates = [...text.matchAll(/checkFeatureGate\(([\w$]+)\)/g)].map(match => match[1]);
  assert.equal(gates.length, 2, 'Move-exec and local-loop gates found');
  return {text, state: head[2], activate: head[3], deactivate: head[4], moveGate: gates[0], loopGate: gates[1],
    vscode: one(/([\w$]+)\.cursor\.cursorAgentHostEnabled/), provider: one(/const\{disposeProvider:[\w$]+\}=([\w$]+)\(\{context/),
    services: one(/\(0,([\w$]+)\.q6\)\(\)/), hostActivate: one(/async function ([\w$]+)\(e\)\{if\([\w$]+\.cursor\.cursorAgentHostEnabled/), hostDeactivate: tail[1]};
}

export async function verifyAgentExecRegistration(source) {
  const entry = nativeEntrypoints(source);
  for (const hostEnabled of [false, true]) for (const moveExec of [false, true, 'reject']) for (const localLoop of [false, true]) {
    const state = {}, activations = [], gateCalls = [], registrations = [];
    let runtime, deactivations = 0, providerRegistered = false, localLoopDisposals = 0;
    const context = {extensionPath: '/native/agent-exec', subscriptions: []};
    const hostContext = {extensionPath: '/native/agent-host', subscriptions: []};
    const hostOptions = {registerAgentExecProvider: false, runtimeExtensionPath: context.extensionPath, services: {}, mcpLease: {}, custom: Symbol('preserved')};
    const git = {}, mcp = {}, service = {};
    const cursor = {
      cursorAgentHostEnabled: hostEnabled,
      registerAgentHostRuntime(value) { runtime = value; registrations.push(value); return {dispose() {}}; },
      checkFeatureGate(gate) { gateCalls.push(gate); return gate === 'move' ? moveExec === 'reject' ? Promise.reject(new Error('gate unavailable')) : moveExec : localLoop; }
    };
    const activate = async (receivedContext, options = {}) => {
      activations.push({context: receivedContext, options});
      state.activeGitExecutor = git; state.activeMcpProvider = mcp;
      if (options.registerAgentExecProvider !== false) providerRegistered = true;
    };
    const deactivate = async () => { deactivations++; providerRegistered = false; };
    const localProvider = ({context: receivedContext, runtimeExtensionPath, serviceCtx}) => {
      assert.equal(receivedContext, context); assert.equal(runtimeExtensionPath, context.extensionPath); assert.equal(serviceCtx, service);
      return {disposeProvider() { localLoopDisposals++; }};
    };
    const native = new Function(entry.state, entry.activate, entry.deactivate, entry.vscode, entry.moveGate, entry.loopGate, entry.provider, entry.services,
      entry.text + ';return {activate:' + entry.hostActivate + ',deactivate:' + entry.hostDeactivate + '};')(
      state, activate, deactivate, {cursor}, 'move', 'loop', localProvider, {q6: () => service});
    await native.activate(context);
    const independentHost = hostEnabled && (moveExec === true || localLoop);
    if (hostEnabled) assert.equal(activations.length, 0, 'Extension does not initialize a second runtime alongside Agent Host');
    if (hostEnabled && !independentHost) {
      await runtime.activate(hostContext, hostOptions);
      assert.equal(activations[0].context, hostContext);
      for (const key of Object.keys(hostOptions).filter(key => key !== 'registerAgentExecProvider')) assert.equal(activations[0].options[key], hostOptions[key]);
      assert.equal(hostOptions.registerAgentExecProvider, false, 'Host options were not mutated');
    } else if (!hostEnabled) {
      assert.equal(activations[0]?.context, context);
    }
    assert.equal(providerRegistered, !independentHost, `Native tool provider ownership: host=${hostEnabled}, move=${moveExec}, loop=${localLoop}`);
    assert.equal(activations.length, Number(!independentHost), 'Only the existing native runtime owner initializes');
    assert.equal(registrations.length, Number(hostEnabled));
    assert.equal(gateCalls.filter(gate => gate === 'move').length, Number(hostEnabled), 'Move-exec gate queried once');
    assert.equal(gateCalls.filter(gate => gate === 'loop').length, Number(hostEnabled));
    if (hostEnabled) {
      assert.equal(runtime.extensionPath, context.extensionPath);
      assert.equal(runtime.getGitExecutor(), independentHost ? undefined : git); assert.equal(runtime.getMcpProvider(), independentHost ? undefined : mcp);
    }
    await native.deactivate();
    assert.equal(deactivations, Number(!hostEnabled), 'Native deactivation follows activation ownership');
    if (hostEnabled && !independentHost) await runtime.deactivate();
    assert.equal(deactivations, Number(!independentHost)); assert.equal(providerRegistered, false);
    await native.deactivate(); assert.equal(deactivations, Number(!independentHost), 'Native cleanup runs once');
    for (const subscription of context.subscriptions) subscription.dispose();
    assert.equal(localLoopDisposals, Number(hostEnabled && moveExec !== true && localLoop), 'Existing local-loop registration is preserved');
  }
}
