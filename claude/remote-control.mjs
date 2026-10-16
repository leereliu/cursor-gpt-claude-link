// Cursor's own fault-injection point inside CloudAgentRepositoryService.createAgent. Throwing here reuses the
// catch that restores the draft with submitErrorDetails, the same place BAD_MODEL_NAME was reported.
export const CLOUD_CREATE_GUARD_POINT = /([\w$]+)=\{\.\.\.[\w$]+,modelConfig:[\w$]+,usePrivateWorker:[\w$]+,privateWorkspaceIdentifier:[\w$]+,[^{}]*\}[\s\S]{0,200}?throw new [\w$]+\("Debug simulated cloud agent creation failure",[\w$.]+\);/;

// Remote Control agents must be registered through Cursor's cloud create RPC so other devices can control them.
// That RPC rejects subscription IDs and the cloud cannot reach the local bridge, so reject them with a clear message.
export const remoteControlPrelude = `
function __subscriptionRemoteControlGuard(options) {
  if (options?.usePrivateWorker !== true || options.privateWorkspaceIdentifier === undefined) return;
  const models = [options.modelConfig?.modelName, ...(options.modelConfig?.selectedModels ?? []).map(model => model?.modelId)];
  if (!models.some(model => typeof model === "string" && (model.startsWith("chatgpt-codex/") || model.startsWith("claude-subscription/")))) return;
  throw new Error("Subscription models are not available on This Mac (Remote Control): Cursor's cloud agent service cannot reach the local bridge. Choose This Mac instead.");
}
`;

export function patchRemoteControlGuard(source) {
  if (source.includes('function __subscriptionRemoteControlEnvironment(')) {
    throw new Error('An earlier Remote Control reroute patch is installed; restore Cursor and update both installers');
  }
  if (source.includes('function __subscriptionRemoteControlGuard(')) return source;
  const matches = [...source.matchAll(new RegExp(CLOUD_CREATE_GUARD_POINT.source, 'g'))];
  if (!matches.length) throw new Error('Remote Control cloud create guard anchor missing');
  if (matches.length !== 1) throw new Error('Remote Control cloud create guard anchor not unique');
  const [match] = matches;
  const end = match.index + match[0].length;
  return remoteControlPrelude + source.slice(0, end) + '__subscriptionRemoteControlGuard(' + match[1] + ');' + source.slice(end);
}
