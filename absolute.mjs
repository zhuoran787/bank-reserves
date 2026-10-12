import {finite,color} from './engine.mjs?v=20261011-all';

// Absolute reserve colors use the full bank cohort; valuation colors use each market.
// Linear value spacing retains magnitude differences instead of percentile spacing.
export const absoluteColumns = [
  {key:'equity_ratio',source:'absolute',kind:'percent'},
  {key:'profit_ratio',source:'absolute',kind:'percent'},
  {key:'pb',source:'valuation',kind:'multiple',lower:true},
  {key:'dividend_yield',source:'valuation',kind:'percent'},
  {key:'total_amount',source:'absolute',kind:'amount'},
  {key:'bond_amount',source:'absolute',kind:'amount'},
  {key:'provision_amount',source:'absolute',kind:'amount'},
  {key:'capital_amount',source:'absolute',kind:'amount'},
  {key:'oci_deduction',source:'absolute',kind:'amount',lower:true},
];
const numberFormat=new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export const formatAbsolute=(value,kind)=>numberFormat.format(kind==='percent'?value*100:value)+(kind==='percent'?'%':kind==='multiple'?'×':'');
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
  return valuation.banks.map(v=>{
    const bank=data.banks.find(b=>b.name===v.name);
    if(!bank||!bank.absolute||!Object.values(bank.absolute).every(finite)||!finite(v.pb)||!finite(v.dividend_yield))throw new Error('绝对值或估值数据不完整');
    return {...bank,valuation:v};
  });
}

export function renderAbsolute(data, valuation, esc, prefix='') {
  const $=id=>document.getElementById(prefix+id),rows=compareAbsolute(data,valuation);
  const key=$('absolute-sort').value;
  const value=b=>key==='pb'||key==='dividend_yield'?b.valuation[key]:b.absolute[key];
  rows.sort((a,b)=>(key==='pb'?1:-1)*(value(a)-value(b))||a.name.localeCompare(b.name,'zh'));
  const q=document.getElementById('search').value.trim(),type=document.getElementById('type').value;
  const shown=rows.filter(b=>(!q||b.name.includes(q)||(b.code||'').includes(q))&&(!type||b.type===type));
  const scales=absoluteColumns.map(c=>(c.source==='absolute'?data.banks:rows).map(b=>b[c.source][c.key]));
  $('absolute-body').innerHTML=shown.map(b=>`<tr><td class="sticky-bank"><button class="bank-name absolute-bank" data-bank="${esc(b.name)}">${esc(b.name)}</button><span class="bank-sub">${prefix?'H股':'A股'} · ${esc(b.type)}</span></td>${absoluteColumns.map((c,i)=>{
    const value=b[c.source][c.key],paint=color(absoluteColorScore(value,scales[i],c.lower));
    return `<td><span class="metric-value absolute-value" style="background:${paint.background};color:${paint.color}">${formatAbsolute(value,c.kind)}</span></td>`;
  }).join('')}</tr>`).join('');
  $('absolute-count').textContent=`显示 ${shown.length} / ${rows.length} 家 · 总家底按指定金额公式计算，不随排名权重变化`;
  $('absolute-source').innerHTML=`家底：2026H1，利润分母统一为10号拨备库归母净利润TTM；金额单位亿元。<br>估值：<a href="${valuation.source.url}" target="_blank" rel="noopener">${esc(valuation.source.title)} · ${esc(valuation.source.published)}图片 ↗</a>，${esc(valuation.source.market)}2026E全年预测。<br>${esc(data.absolute_model.valuation_note)}`;
  return shown;
}
