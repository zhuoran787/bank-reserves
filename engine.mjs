export const finite = x => typeof x === 'number' && Number.isFinite(x);

export function calculate(data, rawWeights = data.groups.map(g => g.weight)) {
  const validWeights = rawWeights.length === data.groups.length && rawWeights.every(x => finite(x) && x >= 0);
  const sum = rawWeights.reduce((a,b) => a+b,0);
  if (!validWeights || sum <= 0) return {error:'至少保留一个正权重。', banks:[], weights:[]};
  const weights = rawWeights.map(x => x / sum);
  const banks = structuredClone(data.banks);
  const complete = banks.filter(b => data.metrics.every(m => finite(b.metrics[m.id]?.value)));
  for (const metric of data.metrics) {
    const values = complete.map(b => b.metrics[metric.id].value);
    for (const b of complete) {
      const m = b.metrics[metric.id], v = m.value;
      const less = values.filter(x => x < v).length, equal = values.filter(x => x === v).length;
      m.percentile = values.length > 1 ? 100*(less+(equal-1)/2)/(values.length-1) : 50;
      m.rank = 1 + values.filter(x => x > v).length;
    }
  }
  for (const b of banks) {
    b.complete = complete.includes(b);
    if (!b.complete) {b.scores=null; b.total=null; b.rank=null; continue;}
    b.scores = Object.fromEntries(data.groups.map(g => {
      const members = data.metrics.filter(m => m.group === g.id);
      return [g.id, members.reduce((sum,m) => sum+b.metrics[m.id].percentile*m.weight,0)/members.reduce((sum,m)=>sum+m.weight,0)];
    }));
    b.total = data.groups.reduce((sum,g,i) => sum+b.scores[g.id]*weights[i],0);
  }
  for (const b of complete) b.rank = 1 + complete.filter(x => x.total > b.total+1e-10).length;
  banks.sort((a,b) => Number(b.complete)-Number(a.complete) || (b.total??0)-(a.total??0) || a.name.localeCompare(b.name,'zh'));
  return {banks, weights, completeCount:complete.length, error:null};
}

export function color(score) {
  if (!finite(score)) return {background:'#f0f2f5',color:'#8a929e'};
  const s = Math.max(0,Math.min(100,score))/100;
  const red=[249,214,215], neutral=[247,246,238], green=[175,223,194];
  const a=s<.5?red:neutral, b=s<.5?neutral:green, t=s<.5?s*2:(s-.5)*2;
  return {background:`rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')})`,color:s<.32?'#8c2634':s>.67?'#15513a':'#454c53'};
}
