import {finite,color} from './engine.mjs?v=20261118-boc';
import {calculateRoeValuation} from './roe.mjs?v=20261118-boc';
import {hasFirstMethodAdjustment} from './first-method.mjs?v=20261118-boc';

// Absolute reserve colors use the full bank cohort; valuation colors use each market.
// Linear value spacing retains magnitude differences instead of percentile spacing.
export const absoluteColumns = [
  {key:'roe_deviation',source:'comparison',kind:'multiple',lower:true,rankKey:'roe_rank',focus:'roe-focus',signed:true},
  {key:'adjusted_pb',source:'comparison',kind:'multiple',lower:true,rankKey:'rank',focus:'pb-focus'},
  {key:'equity_ratio',source:'absolute',kind:'percent'},
  {key:'pb',source:'valuation',kind:'multiple',lower:true},
  {key:'pb_reduction',source:'comparison',kind:'multiple'},
  {key:'profit_ratio',source:'absolute',kind:'percent'},
  {key:'dividend_yield',source:'valuation',kind:'percent'},
  {key:'total_amount',source:'absolute',kind:'amount'},
  {key:'discounted_ac_amount',source:'absolute',kind:'amount'},
  {key:'provision_amount',source:'absolute',kind:'amount'},
  {key:'capital_amount',source:'absolute',kind:'amount'},
];
const numberFormat=new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export const formatAbsolute=(value,kind,signed=false)=>(signed&&value>=0?'+':'')+numberFormat.format(kind==='percent'?value*100:value)+(kind==='percent'?'%':kind==='multiple'?'×':'');
export function absoluteColorScore(value,values,lower=false){
  const min=Math.min(...values),max=Math.max(...values);
  if(max===min)return 50;
  const score=100*(value-min)/(max-min);
  return lower?100-score:score;
}

export function compareAbsolute(data, valuation) {
  const names=valuation.banks.map(b=>b.name);
  if(new Set(names).size!==names.length)throw new Error('绝对值估值银行名单重复');
  if(valuation.cohort_mode!=='subset-preserve-strength-order'&&names.length!==data.banks.length)throw new Error('绝对值估值范围不完整');
  const rows=valuation.banks.map(v=>{
    const bank=data.banks.find(b=>b.name===v.name);
    if(!bank||!bank.absolute||!Object.values(bank.absolute).every(finite)||!finite(v.pb)||!finite(v.dividend_yield))throw new Error('绝对值或估值数据不完整');
    const denominator=1+bank.absolute.equity_ratio;
    if(v.pb<=0||denominator<=0)throw new Error('原PB或调整后净资产非正，停止调整PB比较');
    const adjusted_pb=v.pb/denominator;
    return {...bank,valuation:v,comparison:{adjusted_pb,pb_reduction:v.pb-adjusted_pb}};
  });
  const roe=calculateRoeValuation(data,valuation),roeByName=new Map(roe.rows.map(row=>[row.name,row]));
  for(const bank of rows){
    const point=roeByName.get(bank.name);
    Object.assign(bank.comparison,{adjusted_roe_pct:point.adjusted_roe_pct,trend_pb:point.trend_pb,
      roe_deviation:point.deviation,roe_rank:point.rank});
  }
  for(const b of rows)b.comparison.rank=1+rows.filter(x=>x.comparison.adjusted_pb<b.comparison.adjusted_pb-1e-12).length;
  return rows;
}

export function renderAbsolute(data, valuation, esc, prefix='') {
  const $=id=>document.getElementById(prefix+id),rows=compareAbsolute(data,valuation);
  const key=$('absolute-sort').value;
  const sortColumn=absoluteColumns.find(c=>c.key===key)||absoluteColumns.find(c=>c.key==='roe_deviation');
  const value=b=>b[sortColumn.source][sortColumn.key];
  rows.sort((a,b)=>(sortColumn.lower?1:-1)*(value(a)-value(b))||a.name.localeCompare(b.name,'zh'));
  const q=document.getElementById('search').value.trim(),type=document.getElementById('type').value;
  const shown=rows.filter(b=>(!q||b.name.includes(q)||(b.code||'').includes(q))&&(!type||b.type===type));
  const scales=absoluteColumns.map(c=>(c.source==='absolute'?data.banks:rows).map(b=>b[c.source][c.key]));
  $('absolute-body').innerHTML=shown.map(b=>`<tr><td class="sticky-bank"><button class="bank-name absolute-bank" data-bank="${esc(b.name)}">${esc(b.name)}</button><span class="bank-sub">${prefix?'H股':'A股'} · ${esc(b.type)}${hasFirstMethodAdjustment(b)?' · 集团口径':''}</span></td>${absoluteColumns.map((c,i)=>{
    const value=b[c.source][c.key],paint=color(absoluteColorScore(value,scales[i],c.lower));
    const detail=c.key==='roe_deviation'?`；调整后ROE ${b.comparison.adjusted_roe_pct.toPrecision(12)}%；趋势线PB ${b.comparison.trend_pb.toPrecision(12)}倍`:'';
    return `<td${c.focus?` class="${c.focus}"`:''}><span class="metric-value absolute-value${c.rankKey?' adjusted-pb':''}" style="background:${paint.background};color:${paint.color}" title="${value.toPrecision(12)}${detail}">${formatAbsolute(value,c.kind,c.signed)}${c.rankKey?`<span class="metric-rank">第 ${b.comparison[c.rankKey]} 名</span>`:''}</span></td>`;
  }).join('')}</tr>`).join('');
  $('absolute-count').textContent=`显示 ${shown.length} / ${rows.length} 家 · ROE—PB偏离越小、相对估值越低；负值在趋势线左侧，正值在右侧。拟合与排名始终使用本市场全部样本`;
  const fit=calculateRoeValuation(data,valuation).fit;
  $('absolute-source').innerHTML=`家底：${esc(data.as_of)}，利润统一为Q3拨备库归母净利润TTM；金额单位亿元。调整后ROE＝TTM归母净利润÷（Q3归母净资产＋总家底），不把浮盈和拨备加入利润。<br>本市场${fit.count}家等权拟合：ROE（%）＝${fit.slope.toFixed(6)}×调整后PB ${fit.intercept>=0?'+':'−'} ${Math.abs(fit.intercept).toFixed(6)}，R²＝${fit.r_squared.toFixed(6)}。<br>估值：<a href="${valuation.source.url}" target="_blank" rel="noopener">${esc(valuation.source.title)} · ${esc(valuation.source.published)}图片 ↗</a>，${esc(valuation.source.market)}2026E全年预测。<br>${esc(data.absolute_model.valuation_note)} 偏离度为PB倍数差，不是低估百分比或预期股价涨幅。`;
  return shown;
}
