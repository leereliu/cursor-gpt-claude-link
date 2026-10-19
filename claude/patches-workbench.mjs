// The workbench patch driven by a build's derived symbol table.
//
// Up to 3.22.12 every installer carried this logic with the build's names
// written in. From 3.24.12 a build is only its symbols-<version>.json, derived
// by cursor-gpt-link's scripts/derive-symbols.mjs and reviewed; this file holds
// the logic once. The older installers stay as they were reviewed.
import {patchPickerSections} from './picker-sections.mjs';
import {usageSectionSrc} from './usage-section.mjs';
import {patchMaxMode} from './max-mode.mjs';
import {patchSubagentSettingsWorkbench} from './subagent-settings.mjs';
import {patchSubagentBubbles} from './subagent-bubbles.mjs';
import {patchSubagentLifecycle} from './subagent-lifecycle.mjs';
import {patchConversationActionsWorkbench} from './conversation-actions.mjs';
import {patchAgentHost} from './agent-host.mjs';

const prefix = 'claude-subscription/';

// The model a request is for, spelled with this build's parameter names.
function requestedModel(runAnchor) {
  const params = runAnchor.match(/^async run\(([\w$,]+)\)/)?.[1].split(',');
  if (!params || params.length < 11) throw new Error('Unrecognised run signature: ' + runAnchor.slice(0, 60));
  return `${params[10]}?.requestedModel?.modelId??${params[3]}?.modelId`;
}

function providerModel(providerConfig) {
  const [first, second] = providerConfig.match(/\(([\w$]+),([\w$]+)\)/).slice(1);
  return `${second}?.requestedModel?.modelId??${first}?.modelId`;
}

export function patchClaudeWorkbench(source, surface, s, {once, prelude}) {
  if (!['desktop', 'glass'].includes(surface)) throw new Error('Unknown workbench surface: ' + surface);
  // The declaration, not the name: a companion's picker section mentions this
  // constant defensively when it renders the usage label.
  if (source.includes('const __claudeBridgeBase=')) throw new Error('Claude patch marker already present.');
  source = prelude + source;
  source = patchPickerSections(source, once, s);
  source = once(source, 'async refreshDefaultModels(){', 'async refreshDefaultModels(){await __refreshClaudeBridgeModels();');
  const getter = source.includes('return __withChatgptBridgeModels([...this._availableDefaultModels()])')
    ? 'getAvailableDefaultModels(){return __withChatgptBridgeModels([...this._availableDefaultModels()])}'
    : 'getAvailableDefaultModels(){return[...this._availableDefaultModels()]}';
  source = once(source, getter, getter.replace(/return\s*(.+)}/, 'return __withClaudeBridgeModels($1)}'));
  const models = s.mapVar, mapper = s.mapper;
  const map = source.includes(models + '=__withChatgptBridgeModels(' + models + ').map(' + mapper + ')')
    ? models + '=__withChatgptBridgeModels(' + models + ').map(' + mapper + ')' : models + '=' + models + '.map(' + mapper + ')';
  source = once(source, map, map.replace('=' + models + '.map', '=' + '__withClaudeBridgeModels(' + models + ').map')
    .replace('=__withChatgptBridgeModels(' + models + ').map', '=__withClaudeBridgeModels(__withChatgptBridgeModels(' + models + ')).map'));
  source = once(source, s.providerConfig,
    s.providerConfig + 'if(__isClaudeBridgeModel(' + providerModel(s.providerConfig) + '))return{baseUrl:__claudeBridgeBase+"/v1",apiKey:__claudeBridgeKey,customHeaders:{}};');

  // Let subscription models take the local agent runtime. Up to 3.22 the run
  // options also carried the local mode; from 3.24 only the branch reads it.
  const model = requestedModel(s.runAnchor);
  const chatgptLocal = 'const __chatgptLocal=__isChatgptBridgeModel(' + model + ');';
  if (source.includes(chatgptLocal)) {
    source = once(source, chatgptLocal, 'const __chatgptLocal=__isChatgptBridgeModel(' + model + ')||__isClaudeBridgeModel(' + model + ');');
  } else {
    source = once(source, s.runAnchor, s.runAnchor
      .replace('{const ', '{const __claudeLocal=__isClaudeBridgeModel(' + model + ');const ')
      .replace(`localMode:${s.localMode}.localMode})`, `localMode:${s.localMode}.localMode||__claudeLocal})`)
      .replace(`if(${s.localMode}.localMode){`, `if(${s.localMode}.localMode||__claudeLocal){`));
  }
  // Remote sessions keep Cursor's own routing: the agent runs on the SSH host,
  // where the workspace actually lives, and reaches the bridge through the ssh
  // reverse forward.

  const usage = {jsx:s.usageJsx, useState:s.usageUseState, useEffect:s.usageUseEffect, card:s.card, zs:s.zs, bar:s.bar, barStyle:s.barStyle};
  const childrenGpt = s.usageChildren.slice(0, -1) + ',' + s.usageJsx + '(__chatgptUsageSection,{})]';
  source = once(source, s.usageFn, usageSectionSrc(usage) + s.usageFn);
  const usageChildren = source.includes(childrenGpt) ? childrenGpt : s.usageChildren;
  source = once(source, usageChildren, usageChildren.slice(0, -1) + ',' + s.usageJsx + '(__claudeUsageSection,{})]');
  source = patchMaxMode(patchSubagentSettingsWorkbench(source));
  source = patchSubagentBubbles(source, surface, s);
  source = patchSubagentLifecycle(source, surface, prefix, s);
  return patchAgentHost(patchConversationActionsWorkbench(source, surface, prefix));
}
