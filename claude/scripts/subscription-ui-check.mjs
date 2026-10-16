import assert from 'node:assert/strict';

export function verifySubscriptionUi(source,providers=['chatgpt']){
  const cards=[...source.matchAll(/function ([\w$]+)\([\w$]+\)\{[^;]{0,400}bodyBackground:/g)];
  assert.equal(cards.length,1,'Native settings card found');
  for(const provider of providers){
    const name='__'+provider+'UsageSection';
    const start=source.indexOf('function '+name+'(){'),end=source.indexOf('\n}\n',start);
    assert.ok(start>=0&&end>start,'Usage function found');
    const body=source.slice(start,end+2);
    const state=body.match(/const __s1=([\w$]+)\(null\)/)[1];
    const effect=body.match(/([\w$]+)\(\(\)=>\{let v=!0/)[1];
    const render=body.match(/return ([\w$]+)\(([\w$]+),\{title:/);
    assert.equal(render[2],cards[0][1],'Usage card uses this build\'s actual Card component');
    assert.ok(source.includes('useState as '+state),'Native state hook exists');
    assert.ok(source.includes('useEffect as '+effect),'Native effect hook exists');
    assert.ok(source.includes('jsx as '+render[1])||source.includes('jsxs as '+render[1]),'Native JSX import exists');
    const root=body.match(/children:[\w$]+\(([\w$]+)\.Root,/)[1];
    assert.ok(source.includes(root+'={Root:'),'Native settings row components exist');
    const bar=body.match(/children:[\w$]+\(([\w$]+),\{"aria-label":(?:label|w\.label),style:([\w$]+),/);
    assert.ok(source.includes(bar[2]+'={...'),'Native progress styling exists');
    const deps={[state]:()=>[null,()=>{}],[effect]:()=>{},[render[1]]:(type,props)=>({type,props}),[render[2]]:cards[0][1],[root]:{Root:'Root',Entry:'Entry',Preview:'Preview'},[bar[1]]:'Progress',[bar[2]]:{}};
    const fn=new Function(...Object.keys(deps),body+';return '+name)(...Object.values(deps));
    assert.equal(fn().props.title,provider==='chatgpt'?'ChatGPT Subscription':'Claude Subscription');
  }
  if(providers.includes('chatgpt')){
    const pivot=source.indexOf('Cannot register two commands with the same id:');
    const registration=source.slice(source.lastIndexOf('function ',pivot),pivot).match(/^function ([\w$]+)\(/)[1];
    const commands=source.split('\n').filter(line=>line.includes('id:"cursor.chatgpt.login"'));
    assert.equal(commands.length,1);
    const match=commands[0].match(/^\s*([\w$]+)\(class extends ([\w$]+)\{/);
    assert.equal(match?.[1],registration,'Login action uses the native command registrar');
    let command;
    new Function(registration,match[2],commands[0])(
      action=>{command=new action();},class{constructor(description){this.description=description;}});
    assert.equal(command.description.id,'cursor.chatgpt.login');
  }
  console.log('Subscription settings render and login action registration passed.');
}
