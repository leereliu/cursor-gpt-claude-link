import {CLAUDE_PREFIX,requireSubscriptionPrefix} from './subscription-prefix.mjs';
import {patchAgentHostRouting} from './agent-host-routing.mjs';

export function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Unsupported or repeated patch anchor: ' + before.slice(0, 100));
  return source.replace(before, after);
}

export function patchRuntimeReasoning(source, prefix) {
  requireSubscriptionPrefix(prefix);
  const quoted = JSON.stringify(prefix);
  const anchor = source.match(/\}\(([\w$]+)\);if\(typeof t==="string"&&t\.startsWith\("chatgpt-codex\/"\)\)/)
    ?? source.match(/\}\(([\w$]+)\);if\(void 0===a\)return;if\(void 0!==i&&"openai_compatible"===[\w$]+\)/);
  if (!anchor) throw new Error('Reasoning effort anchor missing.');
  const params = anchor[1];
  source = once(source, anchor[0], '}(' + params + ');if(typeof t==="string"&&t.startsWith(' + quoted + ')){const selected=' + params + '?.find(p=>p.id==="reasoning")?.value;if(selected!==undefined)e.reasoning={...e.reasoning,effort:selected};const context=' + params + '?.find(p=>p.id==="context")?.value;if(context!==undefined)e.claude_context=Number(context);delete e.reasoning_effort;delete e.service_tier;return}' + anchor[0].slice(('}(' + params + ');').length));
  const already = source.includes('.includes("codex")||') && source.includes('.startsWith(' + quoted + ')?"responses":"chat_completions"');
  if (already) return source;
  const heuristic = source.match(/([\w$]+)\.includes\("codex"\)\?"responses":"chat_completions"/);
  if (!heuristic) throw new Error('Local API type heuristic missing.');
  return once(source, heuristic[0], heuristic[1] + '.includes("codex")||' + heuristic[1] + '.startsWith(' + quoted + ')?"responses":"chat_completions"');
}

export function patchLocalBridgeMode(source, surface) {
  source=patchAgentHostRouting(source,CLAUDE_PREFIX);
  if (source.includes('const __chatgptLocal=__isChatgptBridgeModel(u?.requestedModel?.modelId??i?.modelId);')) {
    return once(source, 'const __chatgptLocal=__isChatgptBridgeModel(u?.requestedModel?.modelId??i?.modelId);',
      'const __chatgptLocal=__isChatgptBridgeModel(u?.requestedModel?.modelId??i?.modelId)||__isClaudeBridgeModel(u?.requestedModel?.modelId??i?.modelId);');
  }
  const before = surface.run;
  const after = before.replace('{const ', '{const __claudeLocal=__isClaudeBridgeModel(u?.requestedModel?.modelId??i?.modelId);const ');
  source = once(source, before, after);
  return once(source, 'localMode:' + surface.local + '.localMode});if(' + surface.local + '.localMode){',
    'localMode:' + surface.local + '.localMode||__claudeLocal});if(' + surface.local + '.localMode||__claudeLocal){');
}
