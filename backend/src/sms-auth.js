'use strict';
const { createHmac, randomInt, randomUUID } = require('node:crypto');
const { ApiError, text, uuid } = require('./rules');
const { consent } = require('./legal-documents');

const fail = (status, code, message) => { throw new ApiError(status, code, message); };
const number = value => {
  if (typeof value !== 'string' || !/^1[3-9]\d{9}$/.test(value)) {
    fail(400, 'INVALID_PHONE', '请输入有效的中国大陆手机号');
  }
  return value;
};

function createSmsAuth({ repo, send, pepper, phoneKey, legalDocs, wechatAuthenticate, enabled }) {
  const secret = Buffer.from(pepper || '', 'base64');
  if (!enabled || typeof send !== 'function' || secret.length !== 32 || !repo.reserveSms || !repo.completeSmsSignIn
      || Buffer.from(phoneKey || '', 'base64').length !== 32 || !legalDocs.configured) return null;
  const digest = (tag, ...values) => createHmac('sha256', secret).update(JSON.stringify([tag, ...values])).digest('hex');

  function scope(input, session, address, openid) {
    if (!['signin','bind','change_old'].includes(input.purpose)) fail(400,'SMS_PURPOSE_INVALID','请选择有效的短信验证用途');
    if (typeof input.deviceId !== 'string' || !/^[\w-]{24,96}$/.test(input.deviceId)) {
      fail(400,'SMS_DEVICE_INVALID','验证环境未就绪，请重新打开页面');
    }
    if (input.purpose === 'signin') consent(input, legalDocs);
    else if (input.phoneConsent !== true) fail(400,'SMS_CONSENT_REQUIRED','请先确认手机号验证说明');
    return {
      purpose: input.purpose, phone: digest('phone', number(input.phone)),
      device: digest('device', input.deviceId), network: digest('network', address),
      account: session ? digest('account', session.uid) : digest('wechat', openid),
      session: session ? digest('session', session.hash) : '',
    };
  }

  function check(input, session, address, openid) {
    const context = scope(input, session, address, openid);
    if (!uuid(input.challengeId) || typeof input.code !== 'string' || !/^\d{6}$/.test(input.code)) {
      fail(400,'SMS_INPUT_INVALID','请先获取短信并输入 6 位验证码');
    }
    return { ...context, id: input.challengeId, codeDigest: digest('code', input.challengeId, input.code) };
  }

  async function wechatIdentity(input) {
    if (input.purpose !== 'signin') return '';
    consent(input, legalDocs);
    number(input.phone);
    return wechatAuthenticate(text(input.wechatCode,512,4));
  }

  async function sendCode(input, session, address) {
    const context = scope(input, session, address, await wechatIdentity(input));
    if (input.purpose === 'change_old' && !await repo.smsMatchesPhone(session.uid, input.phone)) {
      fail(400, 'SMS_OLD_PHONE_MISMATCH', '请输入当前账号绑定的手机号');
    }
    const id = randomUUID();
    const code = String(randomInt(1000000)).padStart(6, '0');
    await repo.reserveSms({ ...context, id, codeDigest: digest('code', id, code) });
    let state;
    try { state = await send({ phone: input.phone, code, id }); }
    catch { state = 'unknown'; }
    if (!['sent','failed','unknown'].includes(state)) state = 'unknown';
    await repo.finishSms(id, state);
    if (state === 'failed') fail(502,'SMS_SEND_FAILED','短信暂未发出，请稍后重试');
    return { challengeId: id, expiresIn: 300, retryAfter: 60, delivery: state };
  }

  async function verify(input, session, address) {
    if (input.purpose === 'change_old') fail(400,'SMS_PURPOSE_INVALID','旧号码的验证码需要与新号码一并提交');
    const openid = await wechatIdentity(input);
    const checks = [check(input, session, address, openid)];
    if (input.previous !== undefined) {
      if (input.purpose !== 'bind' || !input.previous || typeof input.previous !== 'object' || input.previous.phone === input.phone) {
        fail(400,'SMS_CHANGE_INVALID','请输入不同的新旧手机号');
      }
      checks.push(check({ ...input.previous, deviceId: input.deviceId, phoneConsent: true, purpose: 'change_old' }, session, address));
    }
    const result = await repo.consumeSms(checks, async client => {
      if (input.purpose === 'signin') {
        return repo.completeSmsSignIn(client, openid, input.phone, consent(input, legalDocs));
      }
      await repo.completeSmsBind(client, session, input.phone, input.previous?.phone);
      return { ok: true };
    });
    if (!result) fail(400,'SMS_CODE_INVALID','验证码错误、失效或已使用，请核对后重试');
    return result;
  }

  return { sendCode, verify };
}

module.exports = { createSmsAuth };
