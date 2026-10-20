// The Task card resolves a bare model ID before looking at selectedModels.
// For subscription models that loses reasoning, Fast and context parameters.
export function taskDisplaySelection(modelName, config) {
  const selected = config?.selectedModels?.[0];
  const id = selected?.modelId;
  if (typeof id !== 'string' || !/^(chatgpt-codex|claude-subscription)\//.test(id)) return;
  if (modelName && modelName !== id) return;
  if (selected.parameters?.length) return selected;
}

export function taskDisplayConfig(isReal, config) {
  // Cursor's bubble handle can already read the live child even before the
  // card's separate asynchronous repository handle has been marked real.
  return isReal || config?.selectedModels?.some(({modelId}) =>
    typeof modelId === 'string' && /^(chatgpt-codex|claude-subscription)\//.test(modelId)) ? config : undefined;
}

export function plainSubscriptionModel(modelName, models) {
  if (typeof modelName !== 'string' || !/^(chatgpt-codex|claude-subscription)\//.test(modelName)) return;
  // Until the child's parameters are available, show its name without guessing
  // a reasoning level from the catalog's first variant.
  return models.find(model => model.name === modelName);
}

const definition = (fn, name) => fn.toString().replace('function ' + fn.name, 'function ' + name);

export function patchSubagentDisplay(source) {
  if (source.includes('function __cursorLinkTaskDisplaySelection(')) throw new Error('Subagent display patch already present');
  const display = /function ([\w$]+)\(([\w$]+),([\w$]+),([\w$]+)\)\{const ([\w$]+)=([\w$]+)\(\2,\3,\4\?\.maxMode\);if\(\5===([\w$]+)\)return"";if\(\5\)return \5;const ([\w$]+)=\4\?\.selectedModels\?\.\[0\];return \8\?([\w$]+)\(\{modelId:\8\.modelId,parameters:\8\.parameters\},\3,\4\.maxMode\):""\}/g;
  const matches = [...source.matchAll(display)];
  if (matches.length !== 1) throw new Error('Task model display anchor is not unique: ' + matches.length);
  const [original, fn, name, models, config, , , , , format] = matches[0];
  const header = `function ${fn}(${name},${models},${config}){`;
  const early = `const __selected=__cursorLinkTaskDisplaySelection(${name},${config});if(__selected)return ${format}(__selected,${models},${config}.maxMode);const __plain=__cursorLinkPlainTaskModel(${name},${models});if(__plain)return __plain.clientDisplayName??__plain.inputboxShortModelName??__plain.name;`;
  source = source.replace(original, original.replace(header, header + early));

  const configAnchor = /const ([\w$]+)=([\w$]+)\?([\w$]+)\?\.data\.modelConfig:void 0,([\w$]+)=([\w$]+)\?\.modelConfig,([\w$]+)=!\1\?\.selectedModels\?\.length&&\4\?\.selectedModels\?\.length\?\4:\1\?\?\4,/g;
  const configs = [...source.matchAll(configAnchor)];
  if (configs.length !== 1) throw new Error('Task child model config anchor is not unique: ' + configs.length);
  const [before, result, real, child] = configs[0];
  source = source.replace(before, before.replace(`${result}=${real}?${child}?.data.modelConfig:void 0`,
    `${result}=__cursorLinkTaskDisplayConfig(${real},${child}?.data.modelConfig)`));
  return source + '\n' + definition(taskDisplaySelection, '__cursorLinkTaskDisplaySelection') + '\n'
    + definition(taskDisplayConfig, '__cursorLinkTaskDisplayConfig') + '\n'
    + definition(plainSubscriptionModel, '__cursorLinkPlainTaskModel') + '\n';
}
