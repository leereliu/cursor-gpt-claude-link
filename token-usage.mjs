const token = value => Number.isFinite(value) && value >= 0 ? value : 0;
export function inputTokens(usage) {
  return token(usage?.input_tokens)+token(usage?.cache_read_input_tokens)+token(usage?.cache_creation_input_tokens);
}
const validInput = usage => usage && Number.isFinite(usage.input_tokens) && usage.input_tokens >= 0;

// CLI result.usage is cumulative across model steps. A context window contains
// one step's prompt, including its cache reads and writes, not the sum of steps.
export function parseResultStream(stdout) {
  let result, latest, steps=new Map();
  for(const line of stdout.split('\n')) {
    if(!line.trim())continue;
    const event=JSON.parse(line);
    if(event.type==='assistant'&&!event.parent_tool_use_id&&event.message?.id&&validInput(event.message.usage)) {
      const {id,usage}=event.message;
      if(!steps.has(id))latest=id;
      steps.set(id,usage);
    }
    if(event.type!=='result')continue;
    const latestUsage=steps.get(latest);
    const iterations=Array.isArray(event.usage?.iterations)?event.usage.iterations:[];
    const finalIteration=iterations.findLast(item=>item.type==='message'&&validInput(item));
    // Iterations carry final output counts. Assistant output_tokens can be a
    // placeholder, so only use an iteration when its input matches this step.
    const matches=latestUsage&&finalIteration&&['input_tokens','cache_read_input_tokens','cache_creation_input_tokens']
      .every(key=>token(latestUsage[key])===token(finalIteration[key]));
    const current=latestUsage||finalIteration;
    const contextUsage=current?{
      input_tokens:token(current.input_tokens),
      cache_read_input_tokens:token(current.cache_read_input_tokens),
      cache_creation_input_tokens:token(current.cache_creation_input_tokens),
      // Older CLIs lack final per-step output counts. The turn total is a
      // conservative upper bound; it must never be used as prompt occupancy.
      output_tokens:token(matches||!latestUsage?finalIteration?.output_tokens:event.usage?.output_tokens)
    }:undefined;
    result={...event,contextUsage,usageDiagnostics:{
      modelSteps:steps.size,
      contextInputTokens:contextUsage?inputTokens(contextUsage):null,
      cumulativeInputTokens:inputTokens(event.usage),
      outputCountSource:matches||!latestUsage&&finalIteration?'last_iteration':'turn_total'
    }};
    steps=new Map();latest=undefined;
  }
  if(!result)throw new Error('Claude Code did not return a result message.');
  return result;
}

export function responsesUsage(usage) {
  if(!validInput(usage))throw new Error('Claude Code did not report per-step context usage.');
  const input=inputTokens(usage),output=token(usage.output_tokens);
  return{input_tokens:input,output_tokens:output,total_tokens:input+output,
    input_tokens_details:{cached_tokens:token(usage.cache_read_input_tokens)}};
}
