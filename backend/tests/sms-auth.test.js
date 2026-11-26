'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { makeSender } = require('../src/aliyun-sms');
const { createApp } = require('../src/server');

test('the SMS form preserves resend cooldown when a number is edited and restored', async () => {
  const fs=require('node:fs'),vm=require('node:vm');
  let definition,calls=0;
  vm.runInNewContext(fs.readFileSync(require.resolve('../../miniprogram/components/sms-code-form/index.js'),'utf8'),{
    Component(value){definition=value;},
    require(){return {async sendSmsCode(){calls++;return {challengeId:'fixture',expiresIn:300,retryAfter:60};}};},
    setInterval(){return 1;},
    clearInterval(){}
  });
  const component={
    data:structuredClone(definition.data),
    properties:{purpose:'bind',enabled:true},
    setData(values){
      for(const [key,value] of Object.entries(values)){
        const [root,field,leaf]=key.split('.');
        if(leaf)this.data[root][field][leaf]=value;
        else if(field)this.data[root][field]=value;
        else this.data[root]=value;
      }
    }
  };
  for(const [key,fn] of Object.entries(definition.methods))component[key]=fn.bind(component);
  definition.lifetimes.attached.call(component);
  const input=value=>component.input({detail:{value},currentTarget:{dataset:{field:'current',name:'phone'}}});
  const send=()=>component.send({currentTarget:{dataset:{field:'current'}}});
  input('13800138000');
  await send();
  input('13600136000');
  input('13800138000');
  assert.ok(component.data.fields.current.remaining>0);
  assert.equal(component.data.fields.current.challengeId,'');
  await send();
  assert.equal(calls,1);
  definition.lifetimes.detached.call(component);
});

test('official SendSms adapter passes a string code, disables retries and distinguishes rejected and uncertain delivery', async () => {
  const requests = [];
  let response = {body:{code:'OK'}};
  const client = {async sendSmsWithOptions(request, runtime) {
    requests.push({request,runtime});
    if (response instanceof Error) throw response;
    return response;
  }};
  class SendSmsRequest { constructor(fields) { Object.assign(this,fields); } }
  const send = makeSender(client,SendSmsRequest,{signName:'隔离测试签名',templateCode:'SMS_512583575'});
  const data = {phone:'13800138000',code:'001234',id:randomUUID()};
  assert.equal(await send(data),'sent');
  assert.equal(requests[0].request.templateParam,'{"code":"001234"}');
  assert.equal(requests[0].request.phoneNumbers,data.phone);
  assert.equal(requests[0].request.outId,data.id);
  assert.equal(requests[0].runtime.autoretry,false);
  response={body:{code:'isv.SMS_SIGNATURE_ILLEGAL'}};
  assert.equal(await send(data),'failed');
  response=Object.assign(Error('transport timed out'),{code:'ETIMEDOUT'});
  assert.equal(await send(data),'unknown');
  assert.equal(requests.length,3);
});

test('unconfigured production SMS has no frontend capability and rejects direct requests', async t => {
  const repo=require('../src/memory-repository').createMemoryRepository();
  const app=createApp({repo,areas:['中心街道'],legalConfig:{contactEmail:'privacy@example.test'}});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>app.close(resolve)));
  const origin='http://127.0.0.1:'+app.address().port;
  const legal=await (await fetch(origin+'/api/v1/legal')).json();
  assert.equal(legal.smsAvailable,false);
  const response=await fetch(origin+'/api/auth/sms/send',{method:'POST',body:'{}'});
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'SMS_NOT_CONFIGURED');
});

const dsn=process.env.PG_TEST_DATABASE_URL;
test('PostgreSQL SMS registration, login, rate limits, expiry, binding and change using a fake sender', {skip:!dsn&&'isolated PostgreSQL required'}, async t=>{
  require('../src/test-database-guard').assertIsolatedDatabase(dsn);
  const {Pool}=require('pg');
  const control=new Pool({connectionString:dsn});
  const schema='sms_test_'+randomBytes(6).toString('hex');
  await control.query('CREATE SCHEMA '+schema);
  const options='-c search_path='+schema;
  const pool=new Pool({connectionString:dsn,options});
  const repo=require('../src/pg-repository').createPgRepository(dsn,{options});
  let app;
  t.after(async()=>{
    if(app)await new Promise(resolve=>app.close(resolve));
    await repo.close();
    await pool.end();
    await control.query('DROP SCHEMA '+schema+' CASCADE');
    await control.end();
  });
  await require('../src/schema-migrations').applyMigrations(pool);
  await repo.seedRegions(['中心街道']);
  const sent=new Map(),fetched=new Set();
  let delivery='sent';
  app=createApp({
    repo,areas:['中心街道'],wechatAppId:'wx1234567890abcdef',wechatSecret:'isolated-test-wechat',
    phoneEncryptionKey:randomBytes(32).toString('base64'),
    legalConfig:{contactEmail:'privacy@example.test'},
    fetchWechat:async url=>{
      const code=new URL(url).searchParams.get('js_code');
      const result=fetched.has(code)?{errcode:40163}:{openid:'fixture_'+code.split(':')[0]};
      fetched.add(code);
      return {ok:true,json:async()=>result};
    },
    smsOptions:{pepper:randomBytes(32).toString('base64'),send:async data=>{sent.set(data.id,data.code);return delivery;}},
  });
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+app.address().port;
  const request=async(path,body,token)=>{
    const result=await fetch(origin+path,{
      method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    return {status:result.status,data:await result.json()};
  };
  const docs=(await request('/api/v1/legal')).data;
  assert.equal(docs.smsAvailable,true);
  const consent={consent:true,termsVersion:docs.termsVersion,privacyVersion:docs.privacyVersion,legalHash:docs.hash};
  const deviceId='isolated-fixture-installation-id';
  let sequence=0;
  const wxCode=(name='one')=>name+':code-'+(++sequence);
  const signin=(phone,name='one')=>({...consent,purpose:'signin',phone,deviceId,wechatCode:wxCode(name)});
  const bind=(phone,purpose='bind')=>({purpose,phone,deviceId,phoneConsent:true});
  const send=(data,token)=>request('/api/auth/sms/send',data,token);
  const verify=(data,token)=>request('/api/v1/auth/sms/verify',data,token);
  const codeFor=result=>({challengeId:result.data.challengeId,code:sent.get(result.data.challengeId)});
  const uncapPhone=async id=>pool.query("UPDATE sms_challenges SET created_at=now()-interval '65 seconds' WHERE id=$1",[id]);
  const phone='13800138000';
  let first;

  await t.test('consent and login proof are required, with one sender under concurrent requests', async()=>{
    assert.equal((await send({...signin(phone),consent:false})).data.error,'LEGAL_CONSENT_REQUIRED');
    const parallel=await Promise.all([send(signin(phone)),send(signin(phone))]);
    assert.deepEqual(parallel.map(item=>item.status).sort(),[200,429]);
    first=parallel.find(result=>result.status===200);
    assert.equal(first.data.expiresIn,300);
    assert.equal(first.data.retryAfter,60);
    assert.equal(sent.size,1);
    const row=(await pool.query('SELECT code_digest,phone_digest FROM sms_challenges WHERE id=$1',[first.data.challengeId])).rows[0];
    assert.match(row.code_digest,/^[a-f0-9]{64}$/);
    assert.notEqual(row.phone_digest,phone);
    assert.equal(Object.hasOwn(first.data,'code'),false);
  });

  let account;
  await t.test('SMS registers one account and the regular WeChat login opens the same account', async()=>{
    const proof=codeFor(first);
    assert.equal((await verify({...signin(phone,'other'),...proof})).data.error,'SMS_CODE_INVALID');
    const results=await Promise.all([verify({...signin(phone),...proof}),verify({...signin(phone),...proof})]);
    assert.deepEqual(results.map(item=>item.status).sort(),[200,400]);
    account=results.find(result=>result.status===200).data;
    const viaWechat=await request('/api/v1/auth/wechat',{...consent,code:wxCode()});
    assert.equal(viaWechat.data.userId,account.userId);
    const stored=await pool.query('SELECT method,masked_number AS masked,encrypted_number FROM verified_phones WHERE user_id=$1',[account.userId]);
    assert.equal(stored.rows[0].method,'sms_otp');
    assert.equal(stored.rows[0].masked,'138****8000');
    assert.ok(!stored.rows[0].encrypted_number.includes(phone));
    const loginAudit=await pool.query("SELECT 1 FROM login_consent_events WHERE user_id=$1 AND login_method='sms_otp'",[account.userId]);
    assert.equal(loginAudit.rowCount,1);
    assert.equal((await request('/api/v1/me/trust',null,account.token)).data.phoneVerified,true);
  });

  await t.test('known rejection invalidates a challenge and uncertain delivery can be verified without a retry', async()=>{
    delivery='failed';
    const failed=await send(signin('13900139000'));
    assert.equal(failed.data.error,'SMS_SEND_FAILED');
    const last=[...sent.keys()].at(-1);
    assert.equal((await pool.query('SELECT code_digest FROM sms_challenges WHERE id=$1',[last])).rows[0].code_digest,null);
    delivery='unknown';
    const unknown=await send(signin('13700137000','uncertain'));
    assert.equal(unknown.data.delivery,'unknown');
    assert.equal((await verify({...signin('13700137000','uncertain'),...codeFor(unknown)})).status,200);
    delivery='sent';
  });

  await t.test('changing a phone needs both codes and does not allow rebinding across WeChat accounts', async()=>{
    await uncapPhone(first.data.challengeId);
    const old=await send(bind(phone,'change_old'),account.token);
    assert.equal(old.status,200);
    const nextPhone='13600136000';
    const next=await send(bind(nextPhone),account.token);
    const input={...bind(nextPhone),...codeFor(next),previous:{phone,...codeFor(old)}};
    const different=await request('/api/v1/auth/wechat',{...consent,code:wxCode()});
    assert.equal((await verify(input,different.data.token)).data.error,'SMS_CODE_INVALID');
    assert.equal((await verify(input,account.token)).status,200);
    assert.equal((await request('/api/v1/me/trust',null,account.token)).data.maskedPhone,'136****6000');
    await uncapPhone(next.data.challengeId);
    const claim=await send(signin(nextPhone,'other'));
    const before=(await pool.query('SELECT count(*)::int AS n FROM app_users')).rows[0].n;
    assert.equal((await verify({...signin(nextPhone,'other'),...codeFor(claim)})).data.error,'PHONE_ALREADY_LINKED');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM app_users')).rows[0].n,before);
    assert.equal((await pool.query('SELECT state FROM sms_challenges WHERE id=$1',[claim.data.challengeId])).rows[0].state,'sent');
  });

  await t.test('expired codes and the sixth attempt after five errors remain invalid', async()=>{
    const expired=await send(signin('13500135000'));
    await pool.query("UPDATE sms_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.data.challengeId]);
    assert.equal((await verify({...signin('13500135000'),...codeFor(expired)})).data.error,'SMS_CODE_INVALID');
    const limited=await send(signin('13400134000'));
    const correct=codeFor(limited);
    const incorrect=correct.code==='123456'?'654321':'123456';
    for(let i=0;i<5;i++){
      assert.equal((await verify({...signin('13400134000'),...correct,code:incorrect})).data.error,'SMS_CODE_INVALID');
    }
    assert.equal((await verify({...signin('13400134000'),...correct})).data.error,'SMS_CODE_INVALID');
    const row=(await pool.query('SELECT state,attempts,code_digest FROM sms_challenges WHERE id=$1',[limited.data.challengeId])).rows[0];
    assert.deepEqual(row,{state:'locked',attempts:5,code_digest:null});
  });

  await t.test('a signed-in WeChat user can bind without creating a second identity', async()=>{
    const user=await request('/api/v1/auth/wechat',{...consent,code:wxCode('unbound')});
    const other=await request('/api/v1/auth/wechat',{...consent,code:wxCode('unbound')});
    const payload={...bind('13300133000'),deviceId:'isolated-other-installation-id'};
    assert.equal((await send(payload)).status,401);
    const result=await send(payload,user.data.token);
    assert.equal(result.status,200);
    assert.equal((await verify({...payload,...codeFor(result)},other.data.token)).data.error,'SMS_CODE_INVALID');
    assert.equal((await verify({...payload,...codeFor(result)},user.data.token)).status,200);
    const status=(await request('/api/v1/me/trust',null,user.data.token)).data;
    assert.equal(status.phoneVerified,true);
    assert.equal(status.maskedPhone,'133****3000');
  });
});
