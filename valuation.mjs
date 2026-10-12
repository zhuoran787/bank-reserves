import {finite,color} from './engine.mjs';

// Market pricing: higher PB and lower yield mean a higher pricing score.
// Compare the same best-to-worst directions: financial strength vs market premium.
export function compareValuation(model, valuation) {
  const cohort=model.banks.filter(b=>b.complete).map(b=>({...b,valuation:valuation.banks.find(v=>v.name===b.name)}));
  if(cohort.some(b=>!b.valuation || !finite(b.valuation.pb) || !finite(b.valuation.dividend_yield))) throw new Error('估值与家底范围不完整，停止排名');
  const weightSum=valuation.weights.pb+valuation.weights.dividend_yield;
  if(!(weightSum>0)) throw new Error('估值权重无效');
  for(const b of cohort){
    const percentile=(key,high)=>{
      const values=cohort.map(x=>x.valuation[key]); const v=b.valuation[key];
      const better=values.filter(x=>high?x<v:x>v).length;
      const ties=values.filter(x=>x===v).length;
      return values.length>1?100*(better+(ties-1)/2)/(values.length-1):50;
    };
    b.pbCheapScore=percentile('pb',false);
    b.yieldCheapScore=percentile('dividend_yield',true);
    b.cheapScore=(b.pbCheapScore*valuation.weights.pb+b.yieldCheapScore*valuation.weights.dividend_yield)/weightSum;
    b.pricingScore=100-b.cheapScore;
  }
  for(const b of cohort){
    b.pricingRank=1+cohort.filter(x=>x.pricingScore>b.pricingScore+1e-10).length;
    b.cheapRank=1+cohort.filter(x=>x.cheapScore>b.cheapScore+1e-10).length;
    b.gap=b.pricingRank-b.rank;
  }
  return cohort.sort((a,b)=>b.gap-a.gap||a.rank-b.rank||a.name.localeCompare(b.name,'zh'));
}

export function renderValuation(model, valuation, esc){
  const rows=compareValuation(model,valuation), $=id=>document.getElementById(id);
  const p=(text,pct)=>{const c=color(pct);return `<span class="metric-value" style="background:${c.background};color:${c.color}">${text}</span>`;};
  const max=Math.max(...rows.map(b=>b.gap)),min=Math.min(...rows.map(b=>b.gap));
  $('gap-leaders').innerHTML=[{label:'正向偏差最大',value:max,rows:rows.filter(b=>b.gap===max),sign:'positive'},{label:'负向偏差最大',value:min,rows:rows.filter(b=>b.gap===min),sign:'negative'}].map(x=>`<article class="gap-card ${x.sign}"><small>${x.label}</small><h3>${x.rows.map(b=>esc(b.name)).join('、')} <strong>${x.value>0?'+':''}${x.value} 位</strong></h3><p>${x.rows.map(b=>`${esc(b.name)}：家底第${b.rank}，定价第${b.pricingRank}`).join('；')}</p></article>`).join('');
  const mode=$('valuation-sort').value;
  if(mode==='negative')rows.sort((a,b)=>a.gap-b.gap||a.rank-b.rank);
  if(mode==='cheap')rows.sort((a,b)=>b.cheapScore-a.cheapScore||a.rank-b.rank);
  if(mode==='strength')rows.sort((a,b)=>a.rank-b.rank);
  const q=$('search').value.trim(),type=$('type').value;
  const shown=rows.filter(b=>(!q||b.name.includes(q)||(b.code||'').includes(q))&&(!type||b.type===type));
  $('valuation-body').innerHTML=shown.map(b=>`<tr><td class="sticky-bank"><b>${esc(b.name)}</b><span class="bank-sub">${esc(b.code)} · A股</span></td><td>${p(b.valuation.pb.toFixed(2)+'×',b.pbCheapScore)}</td><td>${p((b.valuation.dividend_yield*100).toFixed(2)+'%',b.yieldCheapScore)}</td><td>${p('第 '+b.cheapRank+' 名',b.cheapScore)}</td><td>第 ${b.pricingRank} 名</td><td>第 ${b.rank} 名</td><td>${p((b.gap>0?'+':'')+b.gap+' 位',50+50*b.gap/(rows.length-1))}</td></tr>`).join('');
  $('valuation-source').innerHTML=`<b>全部估值来源：</b><a href="${valuation.source.url}" target="_blank" rel="noopener">${esc(valuation.source.title)}（${valuation.source.published}图片）↗</a> · ${esc(valuation.source.filename)}<br>${esc(valuation.source.market)}；${esc(valuation.source.basis)}。${esc(valuation.source.price_basis)}。各行对应图片同名银行的“2026E PB / A股”和“2026年预期股息率 / A股”两列。`;
  return rows;
}
