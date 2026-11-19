// Single authoritative configuration for the approved BOC research adjustment.
export const firstMethodPolicy = Object.freeze({
  bank_code: '601988.SH',
  bank_name: '中国银行',
  label: '境内可比性调整',
  profit_factor: 0.80,
  equity_factor: 0.83,
  average_assets_factor: 0.80,
  loan_provision_add_pp: 0.15,
  denominator_rules: {
    bond_profit: 'profit_factor', bond_equity: 'equity_factor',
    prov_profit: 'profit_factor', prov_equity: 'equity_factor',
    cet1_profit: 'profit_factor', cet1_equity: 'equity_factor',
    writeoff_assets: 'average_assets_factor',
  },
  additive_metric: 'loan_prov',
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const near = (a, b) => finite(a) && finite(b) && Math.abs(a - b) < 1e-12;
export const hasFirstMethodAdjustment = bank => bank.code === firstMethodPolicy.bank_code;
export const adjustmentMetricIds = () => [...Object.keys(firstMethodPolicy.denominator_rules), firstMethodPolicy.additive_metric];

export function adjustedMetricValue(metricId, rawValue) {
  if(!finite(rawValue)) throw new Error('第一法调整缺少有效的集团原值');
  const factorKey = firstMethodPolicy.denominator_rules[metricId];
  if(factorKey) {
    const factor = firstMethodPolicy[factorKey];
    if(!finite(factor) || factor <= 0 || factor > 1) throw new Error('第一法分母系数必须在0与1之间');
    return rawValue / factor;
  }
  if(metricId === firstMethodPolicy.additive_metric) {
    if(!finite(firstMethodPolicy.loan_provision_add_pp)) throw new Error('拨贷比修正无效');
    return rawValue + firstMethodPolicy.loan_provision_add_pp / 100;
  }
  return rawValue;
}

export function firstMethodRuleText(metricId) {
  const key = firstMethodPolicy.denominator_rules[metricId];
  if(key) return `集团原比率÷${(firstMethodPolicy[key] * 100).toFixed(0)}%（仅调整分母，分子保留集团原额）`;
  if(metricId === firstMethodPolicy.additive_metric)
    return `集团原拨贷比＋${firstMethodPolicy.loan_provision_add_pp.toFixed(2)}个百分点；从原值重算，不重复累加`;
  return '集团原值不变';
}

// Pure builder: applying it twice uses raw_value and cannot compound the uplift.
export function applyFirstMethodAdjustment(input) {
  const data = structuredClone(input);
  const banks = data.banks.filter(hasFirstMethodAdjustment);
  if(banks.length !== 1 || banks[0].name !== firstMethodPolicy.bank_name)
    throw new Error('中国银行主体范围不完整或重复');
  for(const id of adjustmentMetricIds()) {
    const metric = banks[0].metrics[id];
    if(!metric) throw new Error('中国银行第一法指标缺失：' + id);
    const raw = Object.hasOwn(metric, 'raw_value') ? metric.raw_value : metric.value;
    metric.raw_value = raw;
    metric.value = adjustedMetricValue(id, raw);
  }
  return data;
}

export function validateFirstMethodData(data) {
  const metadata = data.first_method_adjustment;
  if(metadata?.policy_file !== 'first-method.mjs' || !/^[a-f0-9]{64}$/.test(metadata.policy_sha256 || ''))
    throw new Error('第一法调整快照缺失，请先按当前政策重建数据');
  const banks = data.banks.filter(hasFirstMethodAdjustment);
  if(banks.length !== 1 || banks[0].name !== firstMethodPolicy.bank_name)
    throw new Error('中国银行主体范围不完整或重复');
  const ids = adjustmentMetricIds();
  for(const id of ids) if(!banks[0].metrics[id])
    throw new Error('中国银行第一法指标缺失：' + id);
  for(const bank of data.banks)for(const [id, metric] of Object.entries(bank.metrics)) {
    const adjusted = hasFirstMethodAdjustment(bank) && ids.includes(id);
    if(adjusted && (!finite(metric.raw_value) || !near(metric.value, adjustedMetricValue(id, metric.raw_value))))
      throw new Error('第一法调整值与政策不一致，请从集团原值重建数据：' + id);
    if(!adjusted && Object.hasOwn(metric, 'raw_value'))
      throw new Error('未经配置的银行或指标出现第一法修正：' + bank.name + '/' + id);
  }
}
