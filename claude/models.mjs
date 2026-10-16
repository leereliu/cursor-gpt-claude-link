import {modelTooltip} from './model-tooltip.mjs';
import {prefix} from './runner.mjs';
import {modelOptions} from './model-options.mjs';
import fs from 'node:fs';

// Source: https://cdn.jsdelivr.net/gh/selfhst/icons/svg/claude.svg
const claudeIcon=fs.readFileSync(new URL('./claude.svg',import.meta.url),'utf8').trim()
  .replace('<svg ', '<svg width="12" height="12" aria-hidden="true" style="display:inline-block;vertical-align:-2px;margin-right:6px;flex:none" ');

const effortName=value=>value==='xhigh'?'Very high':value[0].toUpperCase()+value.slice(1);
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function pickerModels(catalog) {
  return modelOptions(catalog).map(model=>{
    const id=prefix+model.value,name=model.displayName,efforts=model.supportedEffortLevels;
    const defaultEffort=efforts.includes('medium')?'medium':efforts[0];
    const contexts=model.extended?[200000,1000000]:[200000];
    const tooltip=(context,effort)=>modelTooltip(name,model.summary,context,effort);
    return {name:id,serverModelName:id,clientDisplayName:name,inputboxShortModelName:name,
      defaultOn:true,supportsAgent:true,supportsImages:true,supportsThinking:efforts.length>0,
      supportsNonMaxMode:true,supportsMaxMode:model.extended,supportsPlanMode:true,supportsAutoContext:true,
      contextTokenLimit:200000,contextTokenLimitForMaxMode:contexts.at(-1),autoContextMaxTokens:contexts.at(-1),namedModelSectionIndex:0,
      vendorName:'anthropic',vendor:{id:1,displayName:'Anthropic'},modelPickerBadges:[],cloudAgentEffortModes:[],tagline:model.summary,tooltipData:tooltip(200000,defaultEffort),
      parameterDefinitions:[
        ...(model.extended?[{id:'context',name:'Context',markdownTooltip:'Choose the context budget for this conversation. 1M gives Claude more room for large codebases and long sessions.',
          parameterType:{enumParameter:{values:contexts.map(value=>({value:String(value),displayName:value===1000000?'1M':'200K',modelPickerBadges:[]}))}}}]:[]),
        ...(efforts.length?[{id:'reasoning',name:'Effort',markdownTooltip:'How much reasoning effort Claude spends on each response.',isCycleableByHotkey:true,
          parameterType:{enumParameter:{values:efforts.map(value=>({value,displayName:effortName(value),modelPickerBadges:[]}))}}}]:[])
      ],
      variants:(efforts.length?efforts:[undefined]).flatMap(effort=>contexts.map(context=>{
        const parameters=[...(model.extended?[{id:'context',value:String(context)}]:[]),...(effort?[{id:'reasoning',value:effort}]:[])];
        const detail=[...(effort?[effortName(effort)]:[]),...(context===1000000?['1M']:[])].join(' ');
        return {parameterValues:parameters,displayName:claudeIcon+escape(name)+(detail?' <span style="color: var(--cursor-text-tertiary);">'+detail+'</span>':''),
          displayNameOutsidePicker:name+(detail?' '+detail:''),
          variantStringRepresentation:id+(parameters.length?'['+parameters.map(p=>p.id+'='+p.value).join(',')+']':''),
          isMaxMode:context>200000,isDefaultNonMaxConfig:effort===defaultEffort&&context===200000,
          isDefaultMaxConfig:effort===defaultEffort&&context>200000,
          tagline:model.summary,tooltipData:tooltip(context,effort)};
      })),legacySlugs:[],idAliases:catalog.filter(m=>m.value!==model.value&&(m.value.replace(/\[1m\]$/i,'')===model.value||m.value==='default'&&m.resolvedModel?.replace(/\[1m\]$/i,'')===model.resolvedModel)).map(m=>prefix+m.value)};
  });
}

export function providerModels(catalog) {
  return pickerModels(catalog).map(m=>({id:m.name,object:'model',owned_by:'anthropic',context_window:m.contextTokenLimitForMaxMode??m.contextTokenLimit,api_types:['openai_responses'],
    capabilities:{context_length:m.contextTokenLimitForMaxMode??m.contextTokenLimit,supports_vision:m.supportsImages,supports_reasoning:m.supportsThinking}}));
}
