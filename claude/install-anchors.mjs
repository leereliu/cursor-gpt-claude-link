import {CLAUDE_PREFIX} from './subscription-prefix.mjs';

export const CURSOR_VERSION = '3.22.12';
export const SUBSCRIPTION_PREFIX = CLAUDE_PREFIX;

export const workbench = {
  [CURSOR_VERSION]: {
    commit: '3a92974361033b2051526321308c2740fe5912c0',
    features: {max: true, settings: true, lifecycle: true, actions: true, bubbles: true, model: true},
    desktop: {
      picker: {
        groupReturn: 'return c.mergeLeadingIntoPromotedSection===!0?{leading:[],promoted:[...se,...ee],others:ae}:{leading:se,promoted:ee,others:ae}',
        promotedAnchor: 'oL(tgt,{models:B.promoted,title:c?.promotedSectionTitle',
        modelsVar: 'B', jsx: 'oL', fmt: 'tgt', renderModel: 'x',
      },
      models: 'c',
      mapper: 'j=>yNt(j)',
      provider: 'async getLocalAgentProviderConfig(e,t){',
      model: 't?.requestedModel?.modelId??e?.modelId',
      local: 'Rc',
      run: 'async run(e,t,n,i,r,s,o,a,c,l,u){const h=PGd(u,',
      native: 'jh(this.storageService,"useDedicatedLocalAgentRuntimeHost")',
      nativeModel: 'g',
      activation: 'function $wp(e){return Rc.localMode&&e?.get(T0y,-1)==="true"}',
      usage: {
        jsx: '$7y', useState: 'cpr', useEffect: 'Y8y', card: 'Sv', zs: 'ks', bar: 'SR', barStyle: 'gpr',
        fn: 'function q7y(e){const t=Exp(119)',
        children: 'title:"Plan & Usage",children:[qt,Jt,Pt,on]',
        childrenGpt: 'title:"Plan & Usage",children:[qt,Jt,Pt,on,$7y(__chatgptUsageSection,{})]',
      },
    },
    glass: {
      picker: {
        groupReturn: 'return l.mergeLeadingIntoPromotedSection===!0?{leading:[],promoted:[...ne,...X],others:re}:{leading:ne,promoted:X,others:re}',
        promotedAnchor: '_F(p8t,{models:N.promoted,title:l?.promotedSectionTitle',
        modelsVar: 'N', jsx: '_F', fmt: 'p8t', renderModel: 'w',
      },
      models: 'l',
      mapper: 'U=>fln(U)',
      provider: 'async getLocalAgentProviderConfig(t,e){',
      model: 'e?.requestedModel?.modelId??t?.modelId',
      local: 'fl',
      run: 'async run(t,e,n,i,r,s,o,a,l,c,u){const d=rwm(u,',
      native: 'Op(this.storageService,"useDedicatedLocalAgentRuntimeHost")',
      nativeModel: 'p',
      activation: 'function HWg(t){return fl.localMode&&t?.get(XWg,-1)==="true"}',
      usage: {
        jsx: 'JCk', useState: 'wms', useEffect: 'ZCk', card: 'rf', zs: 'Hs', bar: 'Pg', barStyle: 'PIi',
        fn: 'function nTk(t){const e=XQg(119)',
        children: 'title:"Plan & Usage",children:[lt,dt,gt,vt]',
        childrenGpt: 'title:"Plan & Usage",children:[lt,dt,gt,vt,JCk(__chatgptUsageSection,{})]',
      },
    }
  },
};

export function workbenchEntry(version = CURSOR_VERSION) {
  const entry = workbench[version];
  if (!entry) throw new Error('Unsupported Cursor version: ' + version);
  return entry;
}
