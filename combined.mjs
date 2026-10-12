import {compareValuation} from './valuation.mjs?v=20261011-nii';
import {compareAbsolute} from './absolute.mjs?v=20261011-nii';

export const combination = Object.freeze({gapWeight:1, adjustedWeight:1, edgeCount:5});

export function compareCombined(data, model, valuation) {
  if(model.error) return [];
  const gaps=compareValuation(model,valuation), absolute=compareAbsolute(data,valuation);
  const rows=gaps.map(b=>{
    const gapRank=1+gaps.filter(x=>x.gap>b.gap).length;
    const adjustedRank=absolute.find(x=>x.name===b.name).comparison.rank;
    const meanRank=(gapRank*combination.gapWeight+adjustedRank*combination.adjustedWeight)/(combination.gapWeight+combination.adjustedWeight);
    return {name:b.name,gapRank,adjustedRank,meanRank};
  });
  for(const b of rows){
    b.rank=1+rows.filter(x=>x.meanRank<b.meanRank-1e-12).length;
    b.tied=rows.filter(x=>Math.abs(x.meanRank-b.meanRank)<1e-12).length>1;
  }
  return rows.sort((a,b)=>a.meanRank-b.meanRank||a.name.localeCompare(b.name,'zh'));
}

export function edgeRows(rows, tail=false) {
  if(!rows.length)return [];
  const ordered=tail?[...rows].reverse():rows;
  const cutoff=ordered[Math.min(combination.edgeCount,ordered.length)-1].meanRank;
  return rows.filter(b=>tail?b.meanRank>=cutoff-1e-12:b.meanRank<=cutoff+1e-12);
}

export function renderCombined(data, model, markets, esc, niiGrowth) {
  const target=document.getElementById('leaders');
  const growthByName=new Map((niiGrowth?.banks||[]).map(b=>[b.name,b]));
  const growthCell=name=>{
    const item=growthByName.get(name),value=item?.value;
    if(!Number.isFinite(value))return '<td class="nii-growth">—</td>';
    const sign=value>0?'+':'',tone=value>0?'positive':value<0?'negative':'neutral';
    const source=`${niiGrowth.source.filename} · ${niiGrowth.source.sheet}!${item.cell} · ${niiGrowth.period_label}同比；仅展示，不参与排名`;
    return `<td class="nii-growth"><span class="nii-value ${tone}" title="${esc(source)}">${sign}${(value*100).toFixed(2)}%</span></td>`;
  };
  const sum=combination.gapWeight+combination.adjustedWeight;
  const header=`<div class="combined-heading"><span class="combined-kicker">综合筛选总览</span><h2>两种方法综合排名</h2><p class="combined-explain">排名偏差法名次 × ${(combination.gapWeight/sum*100).toFixed(0)}% + 调整PB法名次 × ${(combination.adjustedWeight/sum*100).toFixed(0)}% = 平均名次，越小越靠前。A股、H股分别排名。<span class="combined-scroll-hint">左右滑动查看全部列；净利息收入增速仅供对照。</span></p></div>`;
  if(model.error){target.innerHTML=header+'<p class="error-state">家底权重均为0，暂不计算综合排名；至少保留一个正权重即可恢复。</p>';return;}
  const table=(rows,tail,id)=>{
    const selected=edgeRows(rows,tail);
    return `<div class="combined-list ${tail?'combined-tail':'combined-front'}"><h4>${tail?'后':'前'}${combination.edgeCount}家${selected.length>combination.edgeCount?'（含边界并列，共'+selected.length+'家）':''}</h4><div class="combined-scroll"><table id="${id}"><thead><tr><th>综合名次 / 银行</th><th>排名偏差法<br>名次</th><th>调整PB法<br>名次</th><th>平均<br>名次</th><th class="nii-growth">净利息收入<br>同比增速<br><span>${esc(niiGrowth?.period_label||'')}</span></th></tr></thead><tbody>${selected.map(b=>`<tr><td><span class="combined-rank">${b.tied?'并列 ':''}${b.rank}</span><b>${esc(b.name)}</b></td><td>${b.gapRank}</td><td>${b.adjustedRank}</td><td class="combined-mean">${b.meanRank.toFixed(2)}</td>${growthCell(b.name)}</tr>`).join('')}</tbody></table></div></div>`;
  };
  target.innerHTML=header+`<div class="combined-markets">${markets.map(({label,valuation,id})=>{
    const rows=compareCombined(data,model,valuation);
    return `<article class="combined-market"><h3>${esc(label)}<small>${rows.length}家样本</small></h3>${table(rows,false,id+'-combined-front')}${table(rows,true,id+'-combined-tail')}</article>`;
  }).join('')}</div><p class="combined-foot">排名偏差法：定价名次减家底名次，偏差越大排名越前；调整PB法：家底调整后PB越低排名越前（混合期近似）。家底权重调整会同步改变本榜，搜索筛选不改变全样本名次。相同平均名次并列、后续跳号；边界并列一并列出。后五家仍按综合名次从前到后排列。两种方法共享部分输入，本榜是综合筛选结果，不代表已确认的低估或高估程度。</p>`+ (niiGrowth?`<p class="combined-growth-source"><b>净利息收入增速仅供对照，不参与排名。</b>${esc(niiGrowth.basis)} A/H为同一银行主体，使用同一增速。来源：<a href="${esc(niiGrowth.source.url)}" target="_blank" rel="noopener">${esc(niiGrowth.source.filename)} ↗</a>，“${esc(niiGrowth.source.sheet)}”${esc(niiGrowth.source.value_range)}。文件名日期${esc(niiGrowth.source.filename_date)}；悬停数值可查看本行单元格。</p>`:'');
}
