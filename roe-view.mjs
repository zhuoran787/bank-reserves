import {calculateRoeValuation} from './roe.mjs?v=20261118-boc';

const signed = (value, digits = 4) => (value >= 0 ? '+' : '') + value.toFixed(digits);
export function renderRoeAnalysis(snapshot, data, valuations, esc) {
  const target = document.getElementById('roe-analysis');
  const assetUrl = filename => filename + '?v=' + snapshot.artifact_sha256[filename].slice(0, 16);
  const cards = Object.entries(snapshot.markets).map(([market, item]) => {
    const live = calculateRoeValuation(data, valuations[market]);
    const current = new Map(live.rows.map(row => [row.name, row]));
    if(item.rows.length !== live.rows.length || item.rows.some(row =>
      !current.has(row.name) || ['adjusted_pb', 'adjusted_roe_pct', 'trend_pb', 'deviation', 'rank'].some(key =>
        Math.abs(row[key] - current.get(row.name)[key]) > 1e-10)))
      throw new Error('ROE—PB静态图表与当前计算不一致，请重新生成');
    const fit = item.fit;
    return `<article class="roe-market" id="roe-${market}"><div class="roe-title"><div><h3>${esc(item.label)} · ${fit.count}家银行</h3><p>调整后ROE（%）＝${fit.slope.toFixed(6)} × 调整后PB ${fit.intercept >= 0 ? '+' : '−'} ${Math.abs(fit.intercept).toFixed(6)} · R²＝${fit.r_squared.toFixed(6)}</p></div><div class="roe-downloads"><a href="${esc(assetUrl(item.files.png))}" download>PNG</a><a href="${esc(assetUrl(item.files.svg))}" download>SVG</a><a href="${esc(assetUrl(item.files.csv))}" download>完整排名 CSV</a></div></div><a class="roe-image-link" href="${esc(assetUrl(item.files.png))}" target="_blank" rel="noopener"><img src="${esc(assetUrl(item.files.svg))}" alt="${esc(item.label)}全部${fit.count}家银行调整后PB与调整后ROE散点图，含银行名称、拟合线和R平方" loading="lazy"></a><details class="roe-rankings"><summary>查看${fit.count}家完整偏离度排名</summary><div class="table-wrap"><table id="roe-${market}-ranking"><thead><tr><th>排名</th><th>银行</th><th>调整后PB<br>倍</th><th>调整后ROE<br>%</th><th>趋势线PB<br>倍</th><th>估值偏离<br>倍</th></tr></thead><tbody>${item.rows.map(row => `<tr><td>${row.rank}</td><td>${esc(row.name)}</td><td title="${row.adjusted_pb}">${row.adjusted_pb.toFixed(4)}</td><td title="${row.adjusted_roe_pct}">${row.adjusted_roe_pct.toFixed(4)}%</td><td title="${row.trend_pb}">${row.trend_pb.toFixed(4)}</td><td class="${row.deviation < 0 ? 'roe-low' : 'roe-high'}" title="${row.deviation}">${signed(row.deviation)}</td></tr>`).join('')}</tbody></table></div></details><p class="coverage">估值日期：${esc(item.valuation_source.published)}，原PB为2026E全年预测。${fit.count}家等权、含截距OLS，不剔除离群点；按本市场完整样本拟合，筛选不改变趋势线或排名。图表与CSV保留全部银行，CSV使用未四舍五入数值。</p></article>`;
  }).join('');
  target.innerHTML = `<div class="roe-section-title"><h2>调整后 PB—调整后 ROE：散点图与相对估值排名</h2><p>横轴：调整后PB（倍）；纵轴：调整后ROE（百分数值）。A股22家、H股11家分别拟合。</p></div>${cards}<p class="roe-basis">利润：截至${esc(snapshot.financial_periods.profit_ttm_end)}的TTM归母净利润；归母净资产：${esc(snapshot.financial_periods.equity)}；超额拨备：${esc(snapshot.financial_periods.provision)}；AC浮盈：${esc(snapshot.financial_periods.ac)}。浮盈与拨备只调整净资产，不加入利润；不使用源表ROE，也不将前三季度利润乘以4/3。${esc(snapshot.basis)}</p>`;
}
