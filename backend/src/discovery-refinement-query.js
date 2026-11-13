'use strict';

const definitions = require('../../miniprogram/utils/discovery-refinements');
const catalog = require('../../miniprogram/utils/classification-contract');

function sql(values, args, columns) {
  const conditions = [];
  const parameter = (value) => {
    args.push(value);
    return '$' + args.length;
  };
  const field = (key) =>
    `coalesce(nullif((${columns.attributes})->>'${key}',''),(${columns.attributes})->'industryFields'->>'${key}')`;
  const numeric = (value) => `(CASE WHEN ${value} ~ '^[0-9]+([.][0-9]{1,2})?$' THEN (${value})::numeric END)`;
  const within = (expression, band) => {
    conditions.push(expression + '>=' + parameter(band.min));
    if (band.max !== undefined) conditions.push(expression + '<' + parameter(band.max));
  };

  for (const [key, value] of Object.entries(values || {})) {
    if (['employment', 'intent', 'condition'].includes(key)) {
      conditions.push(field(key) + '=' + parameter(value));
    }
    if (key === 'price') within(columns.amount, definitions.band(key, value));
    if (key === 'area') within(numeric(field(key)), definitions.band(key, value));
    if (key === 'salary') {
      const band = definitions.band(key, value);
      const lower = numeric(field('salaryMin'));
      const upper = numeric(field('salaryMax'));
      conditions.push(lower + '<=' + upper, upper + '>=' + parameter(band.min));
      if (band.max !== undefined) conditions.push(lower + '<' + parameter(band.max));
    }
    if (key === 'supply') {
      conditions.push(
        value === 'bookable'
          ? columns.origin + "='catalog'"
          : '(' +
              columns.origin +
              "='publication' AND " +
              columns.type +
              "='service' AND " +
              field('industryProjectId') +
              ' IS NULL)',
      );
    }
    if (key === 'eventState') {
      conditions.push(
        columns.startsAt + (value === 'upcoming' ? '>' : '<=') + 'now()',
        columns.endsAt + '>now()',
      );
    }
    if (key === 'infoSource') {
      const policy = { practical: 'COMMUNITY', curated: 'CURATED_INFO', directory: 'OFFICIAL_DIRECTORY' }[
        value
      ];
      conditions.push(columns.policy + '=' + parameter(policy));
    }
  }
  return conditions.length
    ? ' AND ' + conditions.map((condition) => '(' + condition + ')').join(' AND ')
    : '';
}

function matches(item, values = {}) {
  const attributes = item.attributes || {};
  const fields = { ...attributes.industryFields };
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== '' && value != null) fields[key] = value;
  }
  const number = (value) => (/^[0-9]+([.][0-9]{1,2})?$/.test(String(value ?? '')) ? Number(value) : null);
  const within = (value, band) =>
    value !== null && value >= band.min && (band.max === undefined || value < band.max);

  for (const [key, value] of Object.entries(values)) {
    if (['employment', 'intent', 'condition'].includes(key) && fields[key] !== value) return false;
    if (
      key === 'price' &&
      !within(number(String(item.price ?? '').replace(/[¥￥ ,]/g, '')), definitions.band(key, value))
    )
      return false;
    if (key === 'area' && !within(number(fields.area), definitions.band(key, value))) return false;
    if (key === 'salary') {
      const lower = number(fields.salaryMin);
      const upper = number(fields.salaryMax);
      const band = definitions.band(key, value);
      if (
        lower === null ||
        upper === null ||
        lower > upper ||
        upper < band.min ||
        (band.max !== undefined && lower >= band.max)
      )
        return false;
    }
    if (key === 'supply') {
      const bookable = item.kind === 'service';
      const request = item.type === 'service' && item.kind === 'listing' && !fields.industryProjectId;
      if (!(value === 'bookable' ? bookable : request)) return false;
    }
    if (key === 'eventState') {
      const start = Date.parse(fields.startsAt);
      const end = Date.parse(fields.endsAt);
      const now = Date.now();
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= now ||
        (value === 'upcoming' ? start <= now : start > now)
      )
        return false;
    }
    if (key === 'infoSource') {
      const policy =
        catalog.find(attributes.categoryId)?.publication?.policy ||
        (item.type === 'community' ? 'COMMUNITY' : '');
      if (
        policy !== { practical: 'COMMUNITY', curated: 'CURATED_INFO', directory: 'OFFICIAL_DIRECTORY' }[value]
      )
        return false;
    }
  }
  return true;
}

module.exports = { sql, matches };
