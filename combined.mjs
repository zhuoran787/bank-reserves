import {compareValuation} from './valuation.mjs?v=20261118-boc';
import {compareAbsolute} from './absolute.mjs?v=20261118-boc';

export const combination = Object.freeze({gapWeight:66, roeWeight:34, edgeCount:5, aTailCount:10});

export function edgeCount(market, tail=false) {
  return market==='a' && tail ? combination.aTailCount : combination.edgeCount;
}

export function compareCombined(data, model, valuation) {
  if(model.error) return [];
  const gaps=compareValuation(model,valuation), absolute=compareAbsolute(data,valuation);
  const rows=gaps.map(b=>{
    const gapRank=1+gaps.filter(x=>x.gap>b.gap).length;
    const roeRank=absolute.find(x=>x.name===b.name).comparison.roe_rank;
    const weightedRank=(gapRank*combination.gapWeight+roeRank*combination.roeWeight)/(combination.gapWeight+combination.roeWeight);
    return {name:b.name,gapRank,roeRank,weightedRank};
  });
  for(const b of rows){
    b.rank=1+rows.filter(x=>x.weightedRank<b.weightedRank-1e-12).length;
    b.tied=rows.filter(x=>Math.abs(x.weightedRank-b.weightedRank)<1e-12).length>1;
  }
  return rows.sort((a,b)=>a.weightedRank-b.weightedRank||a.name.localeCompare(b.name,'zh'));
}

export function edgeRows(rows, tail=false, count=combination.edgeCount) {
  if(!rows.length)return [];
  const ordered=tail?[...rows].reverse():rows;
  const cutoff=ordered[Math.min(count,ordered.length)-1].weightedRank;
  return rows.filter(b=>tail?b.weightedRank>=cutoff-1e-12:b.weightedRank<=cutoff+1e-12);
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
  const sum=combination.gapWeight+combination.roeWeight;
  const header=`<div class="combined-heading"><span class="combined-kicker">综合筛选总览</span><h2>两种方法综合排名</h2><p class="combined-explain">排名偏差法名次 × ${(combination.gapWeight/sum*100).toFixed(0)}% + 调整后ROE vs PB偏离度名次 × ${(combination.roeWeight/sum*100).toFixed(0)}% = 加权名次，越小越靠前。A股、H股分别排名。<span class="combined-scroll-hint">左右滑动查看全部列；净利息收入增速仅供对照。</span></p></div>`;
  if(model.error){target.innerHTML=header+'<p class="error-state">家底权重均为0，暂不计算综合排名；至少保留一个正权重即可恢复。</p>';return;}
  const table=(rows,tail,id,count)=>{
    const selected=edgeRows(rows,tail,count);
    return `<div class="combined-list ${tail?'combined-tail':'combined-front'}"><h4>${tail?'后':'前'}${count}家${selected.length>count?'（含边界并列，共'+selected.length+'家）':''}</h4><div class="combined-scroll"><table id="${id}"><thead><tr><th>综合名次 / 银行</th><th>排名偏差法<br>名次</th><th>ROE—PB偏离度<br>名次</th><th>加权<br>名次</th><th class="nii-growth">净利息收入<br>同比增速<br><span>${esc(niiGrowth?.period_label||'')}</span></th></tr></thead><tbody>${selected.map(b=>`<tr><td><span class="combined-rank">${b.tied?'并列 ':''}${b.rank}</span><b>${esc(b.name)}</b></td><td>${b.gapRank}</td><td>${b.roeRank}</td><td class="combined-mean">${b.weightedRank.toFixed(2)}</td>${growthCell(b.name)}</tr>`).join('')}</tbody></table></div></div>`;
  };
  target.innerHTML=header+`<div class="combined-markets">${markets.map(({label,valuation,id})=>{
    const rows=compareCombined(data,model,valuation);
    return `<article class="combined-market"><h3>${esc(label)}<small>${rows.length}家样本</small></h3>${table(rows,false,id+'-combined-front',edgeCount(id))}${table(rows,true,id+'-combined-tail',edgeCount(id,true))}</article>`;
  }).join('')}</div><p class="combined-foot">排名偏差法：定价名次减家底名次，偏差越大排名越前；ROE—PB偏离度法：先在本市场拟合“调整后ROE＝a×调整后PB＋b”，再按“实际调整后PB－同一ROE对应的趋势线PB”从小到大排名。保留正负号，负值代表位于趋势线左侧。家底权重调整只改变第一法及综合榜；搜索不改变拟合样本或全样本名次。相同加权名次并列、后续跳号；边界并列一并列出。后段榜单仍按综合名次从前到后排列。两法共享部分输入，本榜是综合筛选结果，偏离度不是低估百分比或预期股价涨幅。</p>`+ (niiGrowth?`<p class="combined-growth-source"><b>净利息收入增速仅供对照，不参与排名。</b>${esc(niiGrowth.basis)} A/H为同一银行主体，使用同一增速。来源：<a href="${esc(niiGrowth.source.url)}" target="_blank" rel="noopener">${esc(niiGrowth.source.filename)} ↗</a>，“${esc(niiGrowth.source.sheet)}”${esc(niiGrowth.source.value_range)}。文件名日期${esc(niiGrowth.source.filename_date)}；悬停数值可查看本行单元格。</p>`:'');
}
