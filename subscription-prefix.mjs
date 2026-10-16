export const CLAUDE_PREFIX = 'claude-subscription/';
export const GPT_PREFIX = 'chatgpt-codex/';

export function requireSubscriptionPrefix(prefix) {
  if (prefix !== CLAUDE_PREFIX && prefix !== GPT_PREFIX) throw new Error('Unknown subscription provider');
  return prefix;
}
