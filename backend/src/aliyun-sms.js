'use strict';
const endpoint = 'dysmsapi.aliyuncs.com';
const signature = '东莞市石排青方睐软件中心';
const template = 'SMS_512583575';
const runtime = { autoretry: false, maxAttempts: 1, connectTimeout: 2500, readTimeout: 5500 };

function fromEnvironment(env = process.env) {
  if (env.SMS_AUTH_ENABLED !== 'true') return {};
  const accessKeyId = env.ALIBABA_CLOUD_ACCESS_KEY_ID?.trim();
  const accessKeySecret = env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.trim();
  const pepper = env.SMS_CODE_PEPPER || '';
  const signName = env.ALIBABA_CLOUD_SMS_SIGN_NAME || signature;
  const templateCode = env.ALIBABA_CLOUD_SMS_TEMPLATE_CODE || template;
  const host = env.ALIBABA_CLOUD_SMS_ENDPOINT || endpoint;
  if (!accessKeyId || !accessKeySecret || Buffer.from(pepper,'base64').length !== 32
    || host !== endpoint || !/^SMS_\d+$/.test(templateCode)) {
    throw Error('SMS_AUTH_ENABLED needs valid server-side Alibaba Cloud SMS configuration');
  }
  const sdk = require('@alicloud/dysmsapi20170525');
  const client = new sdk.default({
    accessKeyId, accessKeySecret, endpoint: host, protocol: 'HTTPS', retryOptions: { retryable: false },
  });
  return { pepper, send: makeSender(client, sdk.SendSmsRequest, { signName, templateCode }) };
}

function makeSender(client, SendSmsRequest, { signName, templateCode }) {
  return async ({ phone, code, id }) => {
    try {
      const result = await client.sendSmsWithOptions(new SendSmsRequest({
        phoneNumbers: phone, signName, templateCode, templateParam: JSON.stringify({ code }), outId: id,
      }), runtime);
      if (result?.body?.code === 'OK') return 'sent';
      return result?.body?.code ? 'failed' : 'unknown';
    } catch (error) {
      // A network failure or 5xx may follow acceptance. Never repeat the paid API call here.
      const status = Number(error?.statusCode);
      return status >= 400 && status < 500 ? 'failed' : 'unknown';
    }
  };
}

module.exports = { fromEnvironment, makeSender };
