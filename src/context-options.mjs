// Use the catalog default for everyday work. The user-selected 500K preset
// stays within max_context_window, the catalog ceiling for manual overrides.
// supports_experimental_context controls Codex experimental context management;
// it does not define the ceiling for this explicit local window selection.
export function contextSizes(model) {
  const standard=Number(model.context_window);
  if(!Number.isSafeInteger(standard)||standard<=0)throw new Error('Model catalog has no valid context window.');
  const advertised=Number(model.max_context_window);
  const ceiling=Number.isSafeInteger(advertised)&&advertised>=standard?advertised:standard;
  return standard<500000&&ceiling>=500000?[standard,500000]:[standard];
}
export const contextLabel=value=>value>=1000000?String(value/1000000)+'M':String(value/1000)+'K';
export function contextDefinition(sizes) {
  return {id:'context',name:'Context',markdownTooltip:'The default uses the Codex model catalog window. A separate 500K option is offered when it extends the default. A larger window can use more of your subscription allowance and take longer. Reasoning effort and Fast are configured separately.',
    parameterType:{enumParameter:{values:sizes.map((value,index)=>({value:String(value),displayName:index===0?'Codex default · '+contextLabel(value):contextLabel(value),modelPickerBadges:[]}))}}};
}
