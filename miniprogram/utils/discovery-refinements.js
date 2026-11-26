'use strict';

const workflows = require('./industry-workflows');
const days = require('./search-filters').dateOptions;
const choice = (value, label) => ({ value, label });
const range = (value, label, min, max) => ({ value, label, min, max });
const priceBands = [
  range('lt100', '100元以下', 0, 100),
  range('100_500', '100–500元', 100, 500),
  range('500_1000', '500–1000元', 500, 1000),
  range('lt1000', '1000元以下', 0, 1000),
  range('1000_2000', '1000–2000元', 1000, 2000),
  range('2000_3000', '2000–3000元', 2000, 3000),
  range('1000_3000', '1000–3000元', 1000, 3000),
  range('3000_5000', '3000–5000元', 3000, 5000),
  range('5000_10000', '5000–10000元', 5000, 10000),
  range('gte5000', '5000元以上', 5000),
  range('gte10000', '1万元以上', 10000),
  range('lt300k', '30万元以下', 0, 300000),
  range('300k_500k', '30–50万元', 300000, 500000),
  range('500k_1m', '50–100万元', 500000, 1000000),
  range('1m_2m', '100–200万元', 1000000, 2000000),
  range('gte2m', '200万元以上', 2000000),
];
const salaries = [
  range('lt3000', '3000元以下', 0, 3000),
  range('3000_5000', '3000–5000元', 3000, 5000),
  range('5000_8000', '5000–8000元', 5000, 8000),
  range('8000_12000', '8000–12000元', 8000, 12000),
  range('gte12000', '12000元以上', 12000),
];
const areas = [
  range('lt50', '50㎡以下', 0, 50),
  range('50_80', '50–80㎡', 50, 80),
  range('80_120', '80–120㎡', 80, 120),
  range('gte120', '120㎡以上', 120),
];
const configurations = {
  all: { category: '全部分类', fields: ['days', 'radiusKm'] },
  job: { category: '全部职位', fields: ['employment', 'salary', 'days'] },
  housing: { category: '全部房源', fields: ['intent', 'price', 'area'] },
  used: { category: '全部闲置', fields: ['price', 'condition', 'days'] },
  merchant: { category: '全部商家', fields: ['radiusKm', 'days'] },
  service: { category: '全部服务', fields: ['supply', 'price', 'radiusKm'] },
  event: { category: '全部活动', fields: ['eventState', 'days'] },
  public: { category: '全部便民', fields: ['infoSource', 'days'] },
};
const persistentKeys = [
  'employment',
  'salary',
  'intent',
  'price',
  'area',
  'condition',
  'supply',
  'eventState',
  'infoSource',
];

function field(key, channel = 'all', values = {}) {
  let label = '',
    options = [],
    hint = '';
  if (key === 'images') return {key,label:'图片条件',hint:'',options:[choice('','不限图片'),choice('with','仅有图片')]};
  if (key === 'employment') {
    label = '用工形式';
    options = workflows.definitions.JOB.fields
      .find((item) => item.key === 'employment')
      .options.map((value) => choice(value, value));
  }
  if (key === 'salary') {
    label = '月薪';
    options = salaries;
    hint = '按已填写的岗位月薪上下限与所选区间匹配。';
  }
  if (key === 'intent') {
    label = '发布目的';
    options = ['出租', '求租', '出售', '求购'].map((value) => choice(value, value));
  }
  if (key === 'price') {
    label = channel === 'housing' && ['出租', '求租'].includes(values.intent) ? '租金' : '价格';
    const ids =
      channel === 'housing'
        ? ['出售', '求购'].includes(values.intent)
          ? ['lt300k', '300k_500k', '500k_1m', '1m_2m', 'gte2m']
          : ['lt1000', '1000_2000', '2000_3000', '3000_5000', '5000_10000', 'gte10000']
        : ['lt100', '100_500', '500_1000', '1000_3000', '3000_5000', 'gte5000'];
    options = ids.map((id) => priceBands.find((item) => item.value === id));
    hint = '按公开的数字报价筛选，面议和未填写报价可选择不限查看。';
  }
  if (key === 'area') {
    label = '面积';
    options = areas;
  }
  if (key === 'condition') {
    label = '成色';
    options = require('./publication-schemas')
      .get('used')
      .fields.find((item) => item.key === 'condition')
      .options.map((value) => choice(value, value));
  }
  if (key === 'supply') {
    label = '服务来源';
    options = [choice('bookable', '可预约服务'), choice('requests', '居民服务需求')];
    hint = '根据服务目录和居民需求的实际来源筛选。';
  }
  if (key === 'eventState') {
    label = '活动时间';
    options = [choice('upcoming', '即将开始'), choice('ongoing', '正在进行')];
    hint = '按已填写的活动开始与结束时间筛选。';
  }
  if (key === 'infoSource') {
    label = '信息类型';
    options = [
      choice('practical', '实用信息'),
      choice('curated', '审核资讯'),
      choice('directory', '官方来源指引'),
    ];
  }
  if (key === 'days') {
    label = '时间范围';
    options = days.map((item) => choice(String(item.value), item.label));
  }
  if (key === 'radiusKm') {
    label = '距离';
    options = require('./search-filters').radiusOptions.map((item) => choice(String(item.value), item.label));
    hint = '使用已核验公开位置，距离按公开精度计算。';
  }
  return { key, label, hint, options: [choice('', '不限'), ...options.filter((item) => item.value !== '0')] };
}

function normalize(raw = {}, channel = 'all', strict = false) {
  let values = raw;
  if (typeof values === 'string') {
    try {
      if (values.length > 1200) throw Error('too long');
      values = JSON.parse(values);
    } catch {
      if (strict) throw Error('筛选参数格式无效');
      return {};
    }
  }
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    if (strict) throw Error('筛选参数格式无效');
    return {};
  }
  const allowed = configurations[channel]?.fields || configurations.all.fields,
    result = {};
  for (const key of Object.keys(values)) {
    const value = values[key];
    if (value === '') continue;
    const valid =
      persistentKeys.includes(key) &&
      allowed.includes(key) &&
      typeof value === 'string' &&
      field(key, channel, values).options.some((item) => item.value === value);
    if (!valid) {
      if (strict) throw Error('当前频道的筛选条件无效');
      continue;
    }
    result[key] = value;
  }
  return Object.fromEntries(persistentKeys.filter((key) => key in result).map((key) => [key, result[key]]));
}

function chips(channel, values = {}, state = {}) {
  const config = configurations[channel] || configurations.all;
  const rows = [
    { key: 'category', label: state.categoryName || config.category, selected: !!state.categoryId },
  ];
  for (const key of config.fields) {
    const definition = field(key, channel, values),
      value = persistentKeys.includes(key) ? values[key] || '' : String(state[key] || '');
    const selected = !!value && value !== '0';
    rows.push({
      key,
      label: selected
        ? definition.options.find((item) => item.value === value)?.label || definition.label
        : definition.label,
      selected,
    });
  }
  rows.push({ key: 'sort', label: state.sortLabel || '最新发布', selected: !!state.sortCode && state.sortCode !== 'latest' });
  return rows;
}

function extras(values = {}, channel = 'all') {
  return Object.entries(values || {})
    .filter(([key]) => persistentKeys.includes(key))
    .map(([key, value]) => {
      const option =
        field(key, channel, values).options.find((item) => item.value === value) ||
        priceBands.find((item) => item.value === value);
      return { key: 'refinement:' + key, label: field(key, channel, values).label + '：' + (option?.label || value) };
    });
}

function panel(channel, values = {}, state = {}) {
  const keys = [...(configurations[channel] || configurations.all).fields];
  if (!keys.includes('days')) keys.push('days');
  keys.push('images');
  return keys.map((key) => {
    const definition = field(key, channel, values);
    const needsIntent = channel === 'housing' && key === 'price' && !values.intent;
    const value = persistentKeys.includes(key) ? values[key] || '' : String(state[key] || '');
    return {
      ...definition,
      hint: needsIntent ? '先选择出租、求租、出售或求购，再按对应租金或总价筛选。' : definition.hint,
      options: definition.options.map((option) => ({
        ...option,
        disabled: needsIntent && !!option.value,
        selected: option.value === (value === '0' || (key === 'images' && value === 'all') ? '' : value),
      })),
    };
  });
}

function businessPanel(channel, values = {}) {
  return panel(channel, values).filter((item) => persistentKeys.includes(item.key));
}

function selectBusiness(channel, values, key, value) {
  const group = businessPanel(channel, values).find((item) => item.key === key);
  if (!group?.options.some((item) => item.value === value && !item.disabled)) return null;
  const next = { ...values };
  if (value) next[key] = value;
  else delete next[key];
  if (key === 'intent' && value !== values.intent) delete next.price;
  return normalize(next, channel);
}

function band(key, value) {
  return (key === 'salary' ? salaries : key === 'area' ? areas : priceBands).find(
    (item) => item.value === value,
  );
}

module.exports = { configurations, persistentKeys, field, normalize, chips, extras, panel, businessPanel, selectBusiness, band };
