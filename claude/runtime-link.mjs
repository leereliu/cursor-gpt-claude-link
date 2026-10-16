// What this link contributes to an agent runtime, on the client and on an SSH
// host. The marker is what this provider leaves behind, so a second link can
// patch the same file without tripping over the first one's work.
import {patchRuntime} from './patches-runtime.mjs';

export const link = 'cursor-claude-link';
export const prefix = 'claude-subscription/';
export const marker = 't.startsWith("claude-subscription/")';
export {patchRuntime};
