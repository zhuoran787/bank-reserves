// Shared by the live tables and the static PNG/SVG/CSV artifact builder.
export const roeModel = Object.freeze({
  version: 1,
  fit: 'roe_percent_on_adjusted_pb',
  intercept: true,
  weighting: 'equal',
  market_fit: 'separate',
  profit_field: '归母净利润(TTM)',
  equity_field: '归母净资产',
  amount_unit: '亿元',
  slope_tolerance: 1e-12,
  rank_tolerance: 1e-12,
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const close = (a, b) => Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));

export function fitRoeOnPb(points) {
  if(points.length < 3 || points.some(p => !finite(p.adjusted_pb) || !finite(p.adjusted_roe_pct)))
    throw new Error('ROE—PB拟合需要至少3家坐标完整的银行');
  const n = points.length;
  const xMean = points.reduce((sum, p) => sum + p.adjusted_pb, 0) / n;
  const yMean = points.reduce((sum, p) => sum + p.adjusted_roe_pct, 0) / n;
  const sxx = points.reduce((sum, p) => sum + (p.adjusted_pb - xMean) ** 2, 0);
  const syy = points.reduce((sum, p) => sum + (p.adjusted_roe_pct - yMean) ** 2, 0);
  const sxy = points.reduce((sum, p) => sum + (p.adjusted_pb - xMean) * (p.adjusted_roe_pct - yMean), 0);
  if(sxx === 0 || syy === 0) throw new Error('PB或ROE没有样本差异，不能计算ROE—PB偏离排名');
  const slope = sxy / sxx, intercept = yMean - slope * xMean;
  if(!finite(slope) || Math.abs(slope) <= roeModel.slope_tolerance)
    throw new Error('ROE—PB拟合斜率为零或过小，不能反算趋势线PB');
  const residualSum = points.reduce((sum, p) => sum + (p.adjusted_roe_pct - slope * p.adjusted_pb - intercept) ** 2, 0);
  const r_squared = 1 - residualSum / syy;
  return {slope, intercept, r_squared, count: n};
}

export function calculateRoeValuation(data, valuation) {
  const model = data.absolute_model;
  if(!model || !finite(model.ac_discount_factor) ||
      JSON.stringify(model.total_components) !== JSON.stringify(['discounted_ac_amount', 'provision_amount']))
    throw new Error('ROE—PB家底口径必须仅含折扣后AC浮盈与超额拨备');
  const names = valuation.banks.map(bank => bank.name);
  if(new Set(names).size !== names.length) throw new Error('ROE—PB估值银行名单重复');
  if(valuation.cohort_mode !== 'subset-preserve-strength-order' && names.length !== data.banks.length)
    throw new Error('ROE—PB估值范围不完整');
  const rows = valuation.banks.map(v => {
    const bank = data.banks.find(b => b.name === v.name);
    if(!bank || !bank.supplement) throw new Error('ROE—PB银行或财务输入缺失');
    const fields = [roeModel.equity_field, roeModel.profit_field, 'AC浮盈余额', '超额拨备额'];
    for(const key of fields) {
      const item = bank.supplement[key];
      if(!item || !finite(item.value) || item.unit !== roeModel.amount_unit)
        throw new Error(`${bank.name}的${key}缺数或金额单位不一致`);
    }
    const source = bank.supplement;
    const book_equity = source[roeModel.equity_field].value;
    const ttm_profit = source[roeModel.profit_field].value;
    const total_reserves = model.ac_discount_factor * source['AC浮盈余额'].value + source['超额拨备额'].value;
    const adjusted_equity = book_equity + total_reserves;
    if(!finite(v.pb) || v.pb <= 0 || book_equity <= 0 || adjusted_equity <= 0)
      throw new Error(`${bank.name}的原PB或调整后净资产非正，停止ROE—PB比较`);
    if(!bank.absolute || !close(total_reserves, bank.absolute.total_amount) ||
        !close(total_reserves / book_equity, bank.absolute.equity_ratio))
      throw new Error(`${bank.name}的家底金额与当前配置不一致，请先重建家底数据`);
    const adjusted_pb = v.pb / (1 + total_reserves / book_equity);
    const adjusted_roe_pct = ttm_profit / adjusted_equity * 100;
    return {name: bank.name, code: bank.code, adjusted_pb, adjusted_roe_pct,
      book_equity, total_reserves, adjusted_equity, ttm_profit};
  });
  const fit = fitRoeOnPb(rows);
  for(const row of rows) {
    row.trend_pb = (row.adjusted_roe_pct - fit.intercept) / fit.slope;
    row.deviation = row.adjusted_pb - row.trend_pb;
    if(!finite(row.trend_pb) || !finite(row.deviation)) throw new Error('趋势线PB或估值偏离无法计算');
  }
  for(const row of rows)
    row.rank = 1 + rows.filter(other => other.deviation < row.deviation - roeModel.rank_tolerance).length;
  return {fit, rows};
}

export function validateRoeSnapshot(snapshot, inputHashes) {
  if(!snapshot || JSON.stringify(snapshot.model) !== JSON.stringify(roeModel))
    throw new Error('ROE—PB图表口径已变，请重新生成图表');
  for(const key of ['data.json', 'valuation.json', 'valuation-h.json', 'roe.mjs'])
    if(snapshot.input_sha256?.[key] !== inputHashes[key])
      throw new Error('ROE—PB图表与当前输入不一致，请重新生成图表后发布');
  for(const market of ['a', 'h'])
    for(const key of ['png', 'svg', 'csv'])
      if(!/^[a-f0-9]{64}$/.test(snapshot.artifact_sha256?.[snapshot.markets?.[market]?.files?.[key]] || ''))
        throw new Error('ROE—PB图表或下载文件尚未完整生成');
}
