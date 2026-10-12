import {renderValuation} from './valuation.mjs?v=20261011-all';
import {calculate,color,finite} from './engine.mjs?v=20261011-all';
import {renderAbsolute} from './absolute.mjs?v=20261011-all';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,d=2)=>finite(x)?(x*100).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const score=x=>finite(x)?x.toFixed(1):'—';
const rawNum=x=>finite(x)?x.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
let data,model,valuation,valuationH,weights=[33,33,33],showScores=false,sortKey='total',sortDirection=-1;
const labels={bond_profit:'AC&OCI浮盈<br>／归母净利润',bond_equity:'AC&OCI浮盈<br>／归母净资产',prov_profit:'超额拨备<br>／归母净利润',prov_equity:'超额拨备<br>／归母净资产',loan_prov:'拨贷比',cet1_profit:'CET1安全垫金额<br>／归母净利润',cet1_equity:'CET1安全垫金额<br>／归母净资产',fcf1:'自由现金流1'};
const groupNote=g=>{const ms=data.metrics.filter(m=>m.group===g.id),sum=ms.reduce((s,m)=>s+m.weight,0);return ms.map(m=>`${m.label} ${(m.weight/sum*100).toFixed(1)}%`).join('；');};

function weightUI(){
  $('weights').innerHTML=data.groups.map((g,i)=>`<div class="weight"><div class="weight-head"><label for="weight-${g.id}">${esc(g.label)}</label><output id="output-${g.id}" for="weight-${g.id}"></output></div><input id="weight-${g.id}" aria-label="${esc(g.label)}权重" type="range" min="0" max="100" step="1" value="${weights[i]}"><small>${esc(groupNote(g))}</small></div>`).join('');
  data.groups.forEach((g,i)=>$(`weight-${g.id}`).addEventListener('input',e=>{weights[i]=Number(e.target.value);sortKey='total';sortDirection=-1;recalculate();}));
}

function recalculate(){
  model=calculate(data,weights);
  data.groups.forEach((g,i)=>{$(`output-${g.id}`).textContent=model.error?'—':`${(model.weights[i]*100).toFixed(1)}%`;});
  $('weight-status').textContent=model.error||'权重自动折算至100%';
  $('weight-status').classList.toggle('error-state',Boolean(model.error));
  if(model.error){$('h-gap-leaders').innerHTML='';$('h-valuation-body').innerHTML='';$('gap-leaders').innerHTML='';$('valuation-body').innerHTML='';$('leaders').innerHTML='';$('tbody').innerHTML='<tr><td colspan="12" class="empty">至少保留一个正权重，即可恢复排名。</td></tr>';$('result-count').textContent='当前权重均为0，未计算排名';return;}
  const tops=model.banks.filter(b=>b.complete).slice(0,3);
  $('leaders').innerHTML=tops.map(b=>`<article class="leader"><div><small>综合第 ${b.rank} 名</small><h3>${esc(b.name)}</h3><p>浮盈 ${score(b.scores.bond)} · 拨备 ${score(b.scores.provision)} · 资本 ${score(b.scores.capital)}</p></div><div class="leader-number">${score(b.total)}<small>综合分 / 100</small></div></article>`).join('');
  render();
}

function shown(){
  const q=$('search').value.trim(),type=$('type').value;
  const list=model.banks.filter(b=>(!q||b.name.includes(q)||(b.code||'').includes(q))&&(!type||b.type===type));
  const get=b=>sortKey==='name'?b.name:sortKey==='total'?b.total:sortKey.startsWith('group-')?b.scores?.[sortKey.slice(6)]:b.metrics[sortKey]?.value;
  return list.sort((a,b)=>{
    const av=get(a),bv=get(b);
    if(av==null&&bv!=null)return 1;if(bv==null&&av!=null)return -1;
    const cmp=typeof av==='string'?av.localeCompare(bv,'zh'):(av??0)-(bv??0);
    return cmp*sortDirection||(a.rank??999)-(b.rank??999)||a.name.localeCompare(b.name,'zh');
  });
}

function sortButton(key,label){return `<button data-sort="${key}" aria-label="按${esc(label.replace(/<br>/g,'').replace(/<[^>]*>/g,''))}排序">${label}${sortKey===key?(sortDirection===-1?' ↓':' ↑'):' ↕'}</button>`;}

function render(){
  renderAbsolute(data,valuation,esc);
  renderAbsolute(data,valuationH,esc,'h-');
  document.querySelectorAll('.absolute-bank').forEach(btn=>btn.addEventListener('click',()=>detail(btn.dataset.bank)));
  if(model.error)return;
  const list=shown();
  if(valuation)renderValuation(model,valuation,esc);
  if(valuationH)renderValuation(model,valuationH,esc,'h-');
  $('result-count').textContent=`显示 ${list.length} / ${data.banks.length} 家 · 排名基准 ${model.completeCount} 家 · TTM = 过去12个月`;
  $('thead').innerHTML=`<tr><th rowspan="2" class="sticky-bank">${sortButton('name','排名 / 银行')}</th><th rowspan="2" class="sticky-score">${sortButton('total','综合分<br>0—100')}</th>${data.groups.map(g=>`<th class="group" colspan="${data.metrics.filter(m=>m.group===g.id).length+(showScores?1:0)}">${esc(g.label)}</th>`).join('')}</tr><tr>${data.groups.map(g=>data.metrics.filter(m=>m.group===g.id).map((m,i)=>`<th class="${i===0?'group-start':''}">${sortButton(m.id,labels[m.id])}<br><span>${m.unit} · ${esc(m.basis_short)}${m.kind==='计算值'?' · 计算':''}</span><span class="column-source">2026H1 · ${esc(m.source_label)}</span></th>`).join('')+(showScores?`<th>${sortButton(`group-${g.id}`,'维度分')}<br>0—100</th>`:'')).join('')}</tr>`;
  $('tbody').innerHTML=list.length?list.map(b=>{
    const totalPercentile=b.complete?100*(model.completeCount-b.rank)/(model.completeCount-1):null;
    let html=`<tr class="${b.complete?'':'missing'}"><td class="sticky-bank"><span class="rank ${b.rank<=3&&b.rank?'top-rank':''}">${b.rank??'—'}</span><button class="bank-name" data-bank="${esc(b.name)}">${esc(b.name)}</button><span class="bank-sub">${esc(b.type)} · ${esc(b.code||'源表未覆盖')}</span></td><td class="sticky-score">${pill(score(b.total),totalPercentile,'score-value')}</td>`;
    for(const g of data.groups){
      for(const [i,m] of data.metrics.filter(m=>m.group===g.id).entries()){
        const v=b.metrics[m.id];
        html+=`<td class="${i===0?'group-start':''}" title="${esc(m.label)}：${finite(v.value)?fmt(v.value)+(m.unit==='百分点'?'个百分点':'%'):'缺数据'}">${pill(fmt(v.value),v.percentile,'',v.rank)}</td>`;
      }
      if(showScores)html+=`<td>${pill(score(b.scores?.[g.id]),b.scores?.[g.id])}</td>`;
    }
    return html+'</tr>';
  }).join(''):`<tr><td colspan="12" class="empty">没有找到匹配的银行。</td></tr>`;
  $('thead').querySelectorAll('[data-sort]').forEach(btn=>btn.addEventListener('click',()=>{const k=btn.dataset.sort;sortDirection=k===sortKey?-sortDirection:k==='name'?1:-1;sortKey=k;render();}));
  $('tbody').querySelectorAll('[data-bank]').forEach(btn=>btn.addEventListener('click',()=>detail(btn.dataset.bank)));
}

function pill(text,pct,cls='',rank){const c=color(pct);return `<span class="metric-value ${cls}" style="background:${c.background};color:${c.color}">${esc(text)}${rank?`<span class="metric-rank">第 ${rank} 名</span>`:''}</span>`;}

function sourceText(d){
  if(!d.source)return esc(d.reason||'无数据');
  const s=data.sources[d.source];
  let out=`<a href="${s.url}" target="_blank" rel="noopener">${esc(s.filename)}</a><br>${esc(s.sheet)} · ${esc(d.cells.join('、'))}<br>文件名日期：${esc(s.filename_date)}${s.internal_updated?'；源表更新日：'+esc(s.internal_updated):''}；报告期：${esc(s.report)} / ${esc(s.period)}`;
  if(d.denominator_source){const s2=data.sources[d.denominator_source];out+=`<br>分母：<a href="${s2.url}" target="_blank" rel="noopener">${esc(s2.filename)}</a> · ${esc(s2.sheet)} · ${esc(d.denominator_cells.join('、'))}<br>分母文件名日期：${esc(s2.filename_date)}${s2.internal_updated?'；源表更新日：'+esc(s2.internal_updated):''}；报告期：${esc(s2.report)} / ${esc(s2.period)}`;}
  return out;
}

function detail(name){
  const b=model.banks.find(x=>x.name===name)||data.banks.find(x=>x.name===name);$('detail-name').textContent=b.name;
  $('detail-body').innerHTML=`<p>${esc(b.type)} · 2026H1 · ${model.error?'当前未计算排名；绝对家底不受权重影响':b.complete?`综合第 ${b.rank} 名 / ${score(b.total)} 分`:'缺少指定来源数据，不参与排名'}</p>`+
    data.metrics.map(m=>{const d=b.metrics[m.id];return `<div class="detail-item"><div class="detail-label"><span>${esc(m.label)}</span><span>${fmt(d.value)} ${finite(d.value)?m.unit:''}</span></div><p><b>${esc(m.report)} · ${esc(m.basis)}</b></p><p>${m.kind}${d.formula?'：'+esc(d.formula):''}</p><p>${sourceText(d)}</p></div>`;}).join('')+
    (b.complete?`<div class="detail-supplement"><b>核对分子与分母</b>${Object.entries(b.supplement).map(([k,v])=>`<div><span>${esc(k)}</span><strong>${rawNum(v.value)} ${esc(v.unit)}</strong></div>`).join('')}<p>两个源表的利润TTM数值并不完全一致，原有比率沿用各自源表；CET1两项比率均使用拨备库的归母分母。完整资本安全垫不另扣1个百分点，自由现金流1模型中的1个百分点保留假设不变。</p></div>`:'');
  $('bank-dialog').showModal();
}

function exportCSV(){
  if(model.error)return;
  const headers=['排名','银行','类型','报告期','综合分',...data.groups.map(g=>g.label+'分'),...data.metrics.map(m=>m.label+'('+m.unit+')')];
  const rows=shown().map(b=>[b.rank??'',b.name,b.type,data.as_of,b.total??'',...data.groups.map(g=>b.scores?.[g.id]??''),...data.metrics.map(m=>finite(b.metrics[m.id].value)?b.metrics[m.id].value*100:'')]);
  const foot=[[],['权重',...data.groups.map((g,i)=>g.label+': '+(model.weights[i]*100).toFixed(3)+'%')],['口径',data.source_note],['报告期',data.as_of],...data.metrics.map(m=>[m.label,m.report,m.basis,m.source_label,data.sources[m.group].filename]),['浮盈净资产分母来源',data.sources.provision.filename]];
  const csv='\ufeff'+[headers,...rows,...foot].map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='银行家底-2026H1.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function init(){
  try{
    const response=await fetch('./data.json?v=20261011-all');if(!response.ok)throw new Error('数据文件暂时不可用');data=await response.json();
    const vr=await fetch('./valuation.json?v=20261011-all');if(!vr.ok)throw new Error('估值文件暂时不可用');valuation=await vr.json();
    const hr=await fetch('./valuation-h.json?v=20261011-all');if(!hr.ok)throw new Error('H股估值文件暂时不可用');valuationH=await hr.json();
    $('valuation-sort').addEventListener('change',render);
    $('h-valuation-sort').addEventListener('change',render);
    $('absolute-sort').addEventListener('change',render);
    $('h-absolute-sort').addEventListener('change',render);
    weightUI();recalculate();
    $('sources').innerHTML='<b>本页采用的原始数据库</b>'+data.groups.map(g=>{const s=data.sources[g.id];return `<div class="source-row"><span>${esc(g.label)}</span><a href="${s.url}" target="_blank" rel="noopener">${esc(s.filename)} ↗</a><span>${esc(s.report)} · 文件名日期 ${esc(s.filename_date)}${s.internal_updated?' · 源表更新日 '+esc(s.internal_updated):''}</span></div>`;}).join('')+'<p>源文件需在银行先爽网站登录后下载。点击银行名称可查看精确单元格。</p>';
    $('reset').addEventListener('click',()=>{weights=[33,33,33];sortKey='total';sortDirection=-1;weightUI();recalculate();});
    $('search').addEventListener('input',render);$('type').addEventListener('change',render);
    $('toggle-scores').addEventListener('click',()=>{showScores=!showScores;$('toggle-scores').setAttribute('aria-pressed',String(showScores));$('toggle-scores').textContent=showScores?'隐藏维度分':'显示维度分';render();});
    $('close-dialog').addEventListener('click',()=>$('bank-dialog').close());
    $('bank-dialog').addEventListener('click',e=>{if(e.target===$('bank-dialog')){const r=$('bank-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('bank-dialog').close();}});
    $('export').addEventListener('click',exportCSV);
  }catch(e){$('leaders').innerHTML=`<p class="error">无法加载数据：${esc(e.message)}。请刷新重试。</p>`;}
}
init();
