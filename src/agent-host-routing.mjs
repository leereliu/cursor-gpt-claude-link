// Agent Host became the high-level execution strategy in Cursor 3.24. The
// subscription provider still uses the native local runtime configured by the
// bridge. Select that existing strategy per turn, including resume and summary,
// before Agent Host can send the private model ID to Cursor's managed service.
export function createChatgptExecutionStrategy(primary, local) {
  if (!primary) return local;
  return {
    executeTurn(turn) {
      const model = turn.runOptions?.requestedModel?.modelId ?? turn.modelDetails?.modelId;
      const strategy = typeof model === 'string' && model.startsWith('chatgpt-codex/') ? local : primary;
      return strategy.executeTurn(turn);
    },
    dispose() { try { primary.dispose?.(); } finally { local.dispose?.(); } }
  };
}

export function patchAgentHostRouting(source) {
  if (source.includes('function createChatgptExecutionStrategy(')) return source;
  const pattern = /this\._executionStrategy=([\w$]+)\?\.executionStrategy\?\?new ([\w$]+)\(this\.agentClientService\)/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error('AgentCompat execution strategy anchor is not unique: ' + matches.length);
  const [before, options, LocalStrategy] = matches[0];
  const after = `this._executionStrategy=createChatgptExecutionStrategy(${options}?.executionStrategy,new ${LocalStrategy}(this.agentClientService))`;
  return createChatgptExecutionStrategy.toString() + '\n' + source.replace(before, after);
}

// Agent Host shares this runtime but passes registerAgentExecProvider:false.
// Keep its native provider registered too, so subscription turns can use it.
export function patchSharedLocalProvider(source) {
  const marker = '/* chatgpt-keep-local-provider */';
  if (source.includes(marker)) return source;
  const pattern = /([\w$]+)\(([\w$]+),([\w$]+),\{factory:([\w$]+),teamSettingsService:/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) throw new Error('Shared local provider registration anchor is not unique: ' + matches.length);
  const [before, register, context, options, factory] = matches[0];
  return source.replace(before,`${marker}${register}(${context},{...${options},registerAgentExecProvider:true},{factory:${factory},teamSettingsService:`);
}
