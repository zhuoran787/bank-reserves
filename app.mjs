import {renderValuation} from './valuation.mjs?v=20261121-valuation';
import {calculate,color,finite} from './engine.mjs?v=20261121-valuation';
import {renderAbsolute} from './absolute.mjs?v=20261121-valuation';
import {renderCombined} from './combined.mjs?v=20261121-valuation';
import {validateRoeSnapshot} from './roe.mjs?v=20261121-valuation';
import {renderRoeAnalysis} from './roe-view.mjs?v=20261121-valuation';
import {firstMethodPolicy, hasFirstMethodAdjustment, firstMethodRuleText, validateFirstMethodData} from './first-method.mjs?v=20261121-valuation';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,d=2)=>finite(x)?(x*100).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
const score=x=>finite(x)?x.toFixed(1):'—';
const rawNum=x=>finite(x)?x.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
let data,model,valuation,valuationH,niiGrowth,weights,showScores=false,sortKey='total',sortDirection=-1;
const inputHashes={};
async function loadAsset(name,parse=true){
  const response=await fetch('./'+name+'?v=20261121-valuation');
  if(!response.ok)throw new Error('报告文件暂时不可用：'+name);
  const text=await response.text();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  inputHashes[name]=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  return parse?JSON.parse(text):text;
}
const labels={bond_profit:'AC&OCI浮盈<br>／归母净利润',bond_equity:'AC&OCI浮盈<br>／归母净资产',prov_profit:'超额拨备<br>／归母净利润',prov_equity:'超额拨备<br>／归母净资产',loan_prov:'拨贷比',writeoff_assets:'累计已核销不良<br>／总资产',cet1_profit:'CET1安全垫金额<br>／归母净利润',cet1_equity:'CET1安全垫金额<br>／归母净资产',fcf1:'自由现金流1'};
const groupNote=g=>{const ms=data.metrics.filter(m=>m.group===g.id),sum=ms.reduce((s,m)=>s+m.weight,0);return ms.map(m=>`${m.label} ${(m.weight/sum*100).toFixed(1)}%`).join('；');};
const adjustmentSummary=()=>`中国银行第一法采用境内可比性研究调整：利润、净资产、两期平均总资产分母分别乘${fmt(firstMethodPolicy.profit_factor,0)}%、${fmt(firstMethodPolicy.equity_factor,0)}%、${fmt(firstMethodPolicy.average_assets_factor,0)}%；拨贷比加${firstMethodPolicy.loan_provision_add_pp.toFixed(2)}个百分点。浮盈、超额拨备、CET1安全垫及累计核销金额保留集团原额，自由现金流1不变。第二法和绝对家底表使用集团原值。比例与加点是用户研究假设，非财报披露的境内数据。`;

function weightUI(){
  $('weights').innerHTML=data.groups.map((g,i)=>`<div class="weight"><div class="weight-head"><label for="weight-${g.id}">${esc(g.label)}</label><output id="output-${g.id}" for="weight-${g.id}"></output></div><input id="weight-${g.id}" aria-label="${esc(g.label)}权重" type="range" min="0" max="100" step="1" value="${weights[i]}"><small>${esc(groupNote(g))}</small></div>`).join('');
  data.groups.forEach((g,i)=>$(`weight-${g.id}`).addEventListener('input',e=>{weights[i]=Number(e.target.value);sortKey='total';sortDirection=-1;recalculate();}));
}

function recalculate(){
  model=calculate(data,weights);
  data.groups.forEach((g,i)=>{$(`output-${g.id}`).textContent=model.error?'—':`${(model.weights[i]*100).toFixed(1)}%`;});
  $('weight-status').textContent=model.error||'权重自动折算至100%';
  $('weight-status').classList.toggle('error-state',Boolean(model.error));
  renderCombined(data,model,[{label:'A股',valuation,id:'a'},{label:'H股',valuation:valuationH,id:'h'}],esc,niiGrowth);
  if(model.error){$('h-gap-leaders').innerHTML='';$('h-valuation-body').innerHTML='';$('gap-leaders').innerHTML='';$('valuation-body').innerHTML='';$('tbody').innerHTML='<tr><td colspan="12" class="empty">至少保留一个正权重，即可恢复排名。</td></tr>';$('result-count').textContent='当前权重均为0，未计算排名';return;}
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
  $('thead').innerHTML=`<tr><th rowspan="2" class="sticky-bank">${sortButton('name','排名 / 银行')}</th><th rowspan="2" class="sticky-score">${sortButton('total','综合分<br>0—100')}</th>${data.groups.map(g=>`<th class="group" colspan="${data.metrics.filter(m=>m.group===g.id).length+(showScores?1:0)}">${esc(g.label)}</th>`).join('')}</tr><tr>${data.groups.map(g=>data.metrics.filter(m=>m.group===g.id).map((m,i)=>`<th class="${i===0?'group-start':''}">${sortButton(m.id,labels[m.id])}<br><span>${m.unit} · ${esc(m.basis_short)}${m.kind==='计算值'?' · 计算':''}</span><span class="column-source">${esc(m.period_label)} · ${esc(m.source_label)}</span></th>`).join('')+(showScores?`<th>${sortButton(`group-${g.id}`,'维度分')}<br>0—100</th>`:'')).join('')}</tr>`;
  $('tbody').innerHTML=list.length?list.map(b=>{
    const totalPercentile=b.complete?100*(model.completeCount-b.rank)/(model.completeCount-1):null;
    let html=`<tr class="${b.complete?'':'missing'}"><td class="sticky-bank"><span class="rank ${b.rank<=3&&b.rank?'top-rank':''}">${b.rank??'—'}</span><button class="bank-name" data-bank="${esc(b.name)}">${esc(b.name)}</button><span class="bank-sub">${esc(b.type)} · ${esc(b.code||'源表未覆盖')}</span>${hasFirstMethodAdjustment(b)?`<span class="adjustment-badge">${esc(firstMethodPolicy.label)}</span>`:''}</td><td class="sticky-score">${pill(score(b.total),totalPercentile,'score-value')}</td>`;
    for(const g of data.groups){
      for(const [i,m] of data.metrics.filter(m=>m.group===g.id).entries()){
        const v=b.metrics[m.id];
        const adjustment=finite(v.raw_value)?`；集团原值${fmt(v.raw_value)}%；${firstMethodRuleText(m.id)}`:'';
        html+=`<td class="${i===0?'group-start':''}" title="${esc(m.label)}：${finite(v.value)?fmt(v.value)+(m.unit==='百分点'?'个百分点':'%'):'缺数据'}${esc(adjustment)}${v.missing_periods?.length?'；'+esc(v.assumption):''}">${pill(fmt(v.value)+(v.missing_periods?.length?'*':''),v.percentile,'',v.rank)}</td>`;
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
  let out=`${s.url?`<a href="${s.url}" target="_blank" rel="noopener">${esc(s.filename)}</a>`:esc(s.filename)}<br>${esc(s.sheet)} · ${esc(d.cells.join('、'))}<br>文件名日期：${esc(s.filename_date)}${s.internal_updated?'；源表更新日：'+esc(s.internal_updated):''}；报告期：${esc(s.report)} / ${esc(s.period)}`;
  if(finite(d.cumulative_yi))out+=`<br>累计核销及转出额：${rawNum(d.cumulative_yi)}亿元；两期平均总资产：${rawNum(d.average_assets_yi)}亿元。`;
  if(d.denominator_source){const s2=data.sources[d.denominator_source];out+=`<br>分母：<a href="${s2.url}" target="_blank" rel="noopener">${esc(s2.filename)}</a> · ${esc(s2.sheet)} · ${esc(d.denominator_cells.join('、'))}<br>分母文件名日期：${esc(s2.filename_date)}${s2.internal_updated?'；源表更新日：'+esc(s2.internal_updated):''}；报告期：${esc(s2.report)} / ${esc(s2.period)}`;}
  for(const ref of d.references||[]){const s2=data.sources[ref.source];out+=`<br>${esc(ref.label)}：<a href="${s2.url}" target="_blank" rel="noopener">${esc(s2.filename)}</a> · ${esc(s2.sheet)} · ${esc(ref.cells.join('、'))} · 数据期 ${esc(ref.period)}`;}
  if(d.assumption)out+=`<br><b>测算假设：</b>${esc(d.assumption)}`;
  return out;
}

function detail(name){
  const b=model.banks.find(x=>x.name===name)||data.banks.find(x=>x.name===name);$('detail-name').textContent=b.name;
  $('detail-body').innerHTML=`<p>${esc(b.type)} · ${esc(data.as_of)} · ${model.error?'当前未计算排名；绝对家底不受权重影响':b.complete?`综合第 ${b.rank} 名 / ${score(b.total)} 分`:'缺少指定来源数据，不参与排名'}</p>`+
    (hasFirstMethodAdjustment(b)?`<p class="adjustment-note">${esc(adjustmentSummary())}</p>`:'')+
    data.metrics.map(m=>{const d=b.metrics[m.id];return `<div class="detail-item"><div class="detail-label"><span>${esc(m.label)}</span><span>${fmt(d.value)} ${finite(d.value)?m.unit:''}</span></div>${finite(d.raw_value)?`<p class="adjustment-detail"><b>第一法调整值 ${fmt(d.value,4)}%；集团原值 ${fmt(d.raw_value,4)}%</b><br>${esc(firstMethodRuleText(m.id))}${m.id==='writeoff_assets'?`<br>集团两期平均总资产${rawNum(d.average_assets_yi)}亿元；第一法调整后分母${rawNum(d.average_assets_yi*firstMethodPolicy.average_assets_factor)}亿元。`:''}</p>`:''}<p><b>${esc(m.report)} · ${esc(m.basis)}</b></p><p>${finite(d.raw_value)?'集团原值口径：':''}${m.kind}${d.formula?'：'+esc(d.formula):''}</p><p>${sourceText(d)}</p></div>`;}).join('')+
    (b.complete?`<div class="detail-supplement"><b>核对分子与分母</b>${Object.entries(b.supplement).map(([k,v])=>`<div><span>${esc(k)}<small> · ${esc(v.period||'')}</small></span><strong>${rawNum(v.value)} ${esc(v.unit)}</strong></div>`).join('')}<p>以上为集团原值口径；中行第一法另按已标注规则调整分母。浮盈比率连同H1利润和净资产分母保留；拨备与CET1两项比率使用Q3拨备库归母分母。完整资本安全垫不另扣1个百分点，自由现金流1模型中的1个百分点保留假设不变。</p></div>`:'');
  $('bank-dialog').showModal();
}

function exportCSV(){
  if(model.error)return;
  const headers=['排名','银行','类型','报告期','综合分',...data.groups.map(g=>g.label+'分'),...data.metrics.map(m=>m.label+'('+m.unit+')'),'第一法特殊口径'];
  const rows=shown().map(b=>[b.rank??'',b.name,b.type,data.as_of,b.total??'',...data.groups.map(g=>b.scores?.[g.id]??''),...data.metrics.map(m=>finite(b.metrics[m.id].value)?b.metrics[m.id].value*100:''),hasFirstMethodAdjustment(b)?firstMethodPolicy.label:'集团原值']);
  const foot=[[],['权重',...data.groups.map((g,i)=>g.label+': '+(model.weights[i]*100).toFixed(3)+'%')],['口径',data.source_note],['报告期',data.as_of],...data.metrics.map(m=>[m.label,m.report,m.basis,m.source_label,data.sources[m.source].filename]),['累计核销缺失说明',...data.banks.filter(b=>b.metrics.writeoff_assets.missing_periods.length).map(b=>b.name+'：'+b.metrics.writeoff_assets.assumption)],['浮盈净资产分母来源（H1保留）',data.sources.provision_h1.filename],['资本推算假设',data.capital_note]];
  foot.push(['中国银行第一法调整说明',adjustmentSummary()],['银行','指标','集团原值(%)','第一法调整值(%)','调整规则']);
  const adjustedBank=data.banks.find(hasFirstMethodAdjustment);
  for(const m of data.metrics){const v=adjustedBank.metrics[m.id];foot.push([adjustedBank.name,m.label,(v.raw_value??v.value)*100,v.value*100,firstMethodRuleText(m.id)]);}
  const csv='\ufeff'+[headers,...rows,...foot].map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download='银行家底-20261121-含中行调整.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function init(){
  try{
    [data,valuation,valuationH,niiGrowth]=await Promise.all(['data.json','valuation.json','valuation-h.json','nii-growth.json'].map(name=>loadAsset(name)));
    await loadAsset('first-method.mjs',false);
    if(data.first_method_adjustment?.policy_sha256!==inputHashes['first-method.mjs'])throw new Error('第一法政策已改变，请重建数据后发布');
    validateFirstMethodData(data);
    const [roeSnapshot]=await Promise.all([loadAsset('roe-valuation.json'),loadAsset('roe.mjs',false)]);
    validateRoeSnapshot(roeSnapshot,inputHashes);
    renderRoeAnalysis(roeSnapshot,data,{a:valuation,h:valuationH},esc);
    const growthNames=niiGrowth.banks.map(b=>b.name).sort(),bankNames=data.banks.map(b=>b.name).sort();
    if(JSON.stringify(growthNames)!==JSON.stringify(bankNames)||niiGrowth.banks.some(b=>!finite(b.value))||niiGrowth.display_only!==true)throw new Error('净利息收入增速范围或口径不完整');
    $('valuation-sort').addEventListener('change',render);
    $('h-valuation-sort').addEventListener('change',render);
    $('absolute-sort').addEventListener('change',render);
    $('h-absolute-sort').addEventListener('change',render);
    document.querySelectorAll('.ac-discount-factor').forEach(el=>el.textContent=(data.absolute_model.ac_discount_factor*100).toFixed(0)+'%');
    $('absolute-formula').textContent='总家底（用于PB调整）＝'+data.absolute_model.formula;
    $('adjusted-pb-formula').textContent=data.absolute_model.adjusted_pb_formula;
    $('metric-count').textContent=data.metrics.length;
    $('first-method-note').textContent=adjustmentSummary();
    weights=data.groups.map(g=>g.weight);
    weightUI();recalculate();
    $('sources').innerHTML='<b>本页采用的数据来源</b>'+Object.entries(data.sources).map(([key,s])=>`<div class="source-row"><span>${esc(({bond:'H1浮盈',provision:'Q3拨备',capital:'H1资本模型及历史RWA',provision_h1:'H1浮盈分母',performance:'Q3业绩与资本',writeoffs:'累计核销转出'})[key])}</span>${s.url?`<a href="${s.url}" target="_blank" rel="noopener">${esc(s.filename)} ↗</a>`:`<span>${esc(s.filename)}（用户提供）</span>`}<span>${esc(s.report)} · 文件名日期 ${esc(s.filename_date)}${s.internal_updated?' · 源表更新日 '+esc(s.internal_updated):''}</span></div>`).join('')+'<p>新文件由用户提供，链接指向银行先爽文件目录；源文件需登录后下载。点击银行名称可查看精确单元格和资本推算的历史输入。</p>';
    $('reset').addEventListener('click',()=>{weights=[33,33,33];sortKey='total';sortDirection=-1;weightUI();recalculate();});
    $('search').addEventListener('input',render);$('type').addEventListener('change',render);
    $('toggle-scores').addEventListener('click',()=>{showScores=!showScores;$('toggle-scores').setAttribute('aria-pressed',String(showScores));$('toggle-scores').textContent=showScores?'隐藏维度分':'显示维度分';render();});
    $('close-dialog').addEventListener('click',()=>$('bank-dialog').close());
    $('bank-dialog').addEventListener('click',e=>{if(e.target===$('bank-dialog')){const r=$('bank-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('bank-dialog').close();}});
    $('export').addEventListener('click',exportCSV);
  }catch(e){$('leaders').innerHTML=`<p class="error">无法加载数据：${esc(e.message)}。请刷新重试。</p>`;}
}
init();
