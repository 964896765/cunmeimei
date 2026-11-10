'use strict';
// Only these ordinary public terms may be counted. Arbitrary user queries,
// addresses, contact details and sensitive categories never enter the ledger.
const terms=Object.freeze({
 '租房':'housing','房屋出租':'housing','求租':'housing',
 '二手':'used','二手手机':'used','二手家具':'used',
 '家政':'service','保洁':'service','搬家':'service','家电维修':'service',
 '商家':'merchant','社区活动':'community'
});
function termFor(q){const term=typeof q==='string'?q.trim():'';return Object.hasOwn(terms,term)?term:'';}
function pgSearchPopularity(pool){return {
 async recordSearch(cityCode,term){
  if(!termFor(term))return;
  await pool.query(`INSERT INTO search_popularity_daily(city_code,term) VALUES($1,$2)
   ON CONFLICT(city_code,term,day) DO UPDATE SET searches=LEAST(search_popularity_daily.searches+1,1000000)`,[cityCode,term]);
  await pool.query("DELETE FROM search_popularity_daily WHERE day < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date - 30");
 },
 async popularSearches(cityCode){return (await pool.query(`SELECT term,SUM(searches)::int AS searches FROM search_popularity_daily
  WHERE city_code=$1 AND day >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date - 6
  GROUP BY term HAVING SUM(searches)>=3 ORDER BY SUM(searches) DESC,term LIMIT 12`,[cityCode])).rows;}
};}
function memorySearchPopularity(){const counts=new Map();return {
 async recordSearch(cityCode,term){if(!termFor(term))return;const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10),key=cityCode+':'+term+':'+day,cutoff=Date.now()-30*86400000;
  counts.set(key,{cityCode,term,day,searches:(counts.get(key)?.searches||0)+1});for(const [key,row]of counts)if(Date.parse(row.day)<cutoff)counts.delete(key);
 },
 async popularSearches(cityCode){const sums=new Map(),since=new Date(Date.now()+8*3600000-6*86400000).toISOString().slice(0,10);for(const row of counts.values())if(row.cityCode===cityCode&&row.day>=since)sums.set(row.term,(sums.get(row.term)||0)+row.searches);
  return [...sums].map(([term,searches])=>({term,searches})).filter(x=>x.searches>=3).sort((a,b)=>b.searches-a.searches||a.term.localeCompare(b.term)).slice(0,12);
 }
};}
module.exports={terms,termFor,pgSearchPopularity,memorySearchPopularity};
