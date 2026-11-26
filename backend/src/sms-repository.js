'use strict';
const { timingSafeEqual } = require('node:crypto');
const { transaction } = require('./points-repository');
const { ApiError } = require('./rules');

function attachSmsRepository(repo, pool) {
  const tx = fn => transaction(pool, fn);
  repo.reserveSms = challenge => tx(async client => {
    const limits = [
      ['phone_digest', challenge.phone, 60, 1],
      ['phone_digest', challenge.phone, 86400, 5],
      ['device_digest', challenge.device, 3600, 8],
      ['network_digest', challenge.network, 3600, 24],
    ];
    if (challenge.account) limits.push(['account_digest', challenge.account, 3600, 8]);
    const keys = new Set(limits.map(([column, value]) => `sms:${column}:${value}`));
    for (const key of [...keys].sort()) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
    }
    for (const [column, value, seconds, limit] of limits) {
      const result = await client.query(
        `SELECT 1 FROM sms_challenges WHERE ${column}=$1
         AND created_at>now()-$2::int*interval '1 second' LIMIT 1 OFFSET $3`,
        [value, seconds, limit - 1],
      );
      if (result.rowCount) throw new ApiError(429, 'SMS_RATE_LIMIT', '短信请求过于频繁，请稍后重试');
    }
    await client.query(
      `UPDATE sms_challenges SET state='superseded',code_digest=NULL
       WHERE phone_digest=$1 AND purpose=$2 AND session_digest=$3 AND device_digest=$4
         AND state IN ('sending','sent','unknown')`,
      [challenge.phone, challenge.purpose, challenge.session, challenge.device],
    );
    await client.query(
      `INSERT INTO sms_challenges(id,purpose,phone_digest,device_digest,network_digest,
        account_digest,session_digest,code_digest,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'sending')`,
      [challenge.id, challenge.purpose, challenge.phone, challenge.device, challenge.network,
        challenge.account, challenge.session, challenge.codeDigest],
    );
  });

  repo.finishSms = (id, state) => pool.query(
    `UPDATE sms_challenges SET state=$2,code_digest=CASE WHEN $2='failed' THEN NULL ELSE code_digest END
     WHERE id=$1 AND state='sending'`, [id, state],
  );

  repo.consumeSms = (checks, apply) => tx(async client => {
    const rows = (await client.query(
      `SELECT *,expires_at>clock_timestamp() AS valid_time FROM sms_challenges
       WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [checks.map(check => check.id)],
    )).rows;
    for (const check of checks) {
      const row = rows.find(value => value.id === check.id);
      if (!row || !row.valid_time || !['sending','sent','unknown'].includes(row.state)
          || row.purpose !== check.purpose || row.phone_digest !== check.phone
          || row.device_digest !== check.device || row.session_digest !== check.session
          || row.account_digest !== check.account) return false;
      if (!timingSafeEqual(Buffer.from(row.code_digest,'hex'), Buffer.from(check.codeDigest,'hex'))) {
        await client.query(
          `UPDATE sms_challenges SET attempts=attempts+1,
           state=CASE WHEN attempts=4 THEN 'locked' ELSE state END,
           code_digest=CASE WHEN attempts=4 THEN NULL ELSE code_digest END WHERE id=$1`,
          [check.id],
        );
        return false;
      }
    }
    await client.query(
      `UPDATE sms_challenges SET state='consumed',code_digest=NULL WHERE id=ANY($1::uuid[])`,
      [checks.map(check => check.id)],
    );
    return apply(client);
  });

  repo.purgeSms = async () => tx(async client => {
    await client.query(
      `UPDATE sms_challenges SET state='locked',code_digest=NULL
       WHERE expires_at<=now() AND code_digest IS NOT NULL`,
    );
    const result = await client.query("DELETE FROM sms_challenges WHERE created_at<now()-interval '25 hours'");
    return { removed: result.rowCount };
  });
}

module.exports = { attachSmsRepository };
