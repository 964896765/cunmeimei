'use strict';
const {completedSectorChecks}=require('./helpers/publication-confirmation');
const {acceptedConsent}=require('./helpers/publication-confirmation');

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {cancellationReason} = require('../src/booking-source-lifecycle');
const ticket = () => crypto.randomBytes(16).toString('hex');

test('unavailable industry supply closes pending bookings through worker, lists and original requests', {
  skip: !process.env.PG_TEST_DATABASE_URL && 'PG_TEST_DATABASE_URL not configured',
  timeout: 60000
}, async context => {
  const dsn = process.env.PG_TEST_DATABASE_URL;
  require('../src/test-database-guard').assertIsolatedDatabase(dsn);
  const {Pool} = require('pg');
  const schema = 'booking_source_' + ticket().slice(0, 12);
  const control = new Pool({connectionString: dsn});
  let pool, repo;

  try {
    await control.query('CREATE SCHEMA "' + schema + '"');
    const options = '-c search_path=' + schema;
    pool = new Pool({connectionString: dsn, options});
    await require('../src/schema-migrations').applyMigrations(pool);
    repo = require('../src/pg-repository').createPgRepository(dsn, {options});
    await repo.seedRegions(['中心街道']);
    const owner = await repo.upsertIdentity('dev_local', 'source-booking-owner');
    const customer = await repo.upsertIdentity('dev_local', 'source-booking-customer');
    const project = require('../../miniprogram/utils/classification-contract').projects
      .find(item => item.publication.policy === 'MERCHANT_SERVICE');
    const workflow = require('../../miniprogram/utils/industry-workflows').workflow(project.id);
    const credential = await repo.applyIndustryCredential(owner, {
      projectId: project.id, subject: '隔离预约主体', evidenceReference: 'fixture:SOURCE-BOOKING'
    });
    await repo.reviewIndustryCredential(credential.id,{...completedSectorChecks(),
      revision: 1, status: 'verified', manuallyVerified: true,
      validUntil: new Date(Date.now() + 86400000).toISOString(),
      response: '隔离预约范围与资质夹具核验记录'
    }, 'verifier');
    const application = await repo.createMerchant(owner, {
      name: '隔离预约商家', category: '测试服务', district: '中心街道'
    });
    await repo.submitMerchantEvidence(owner, application.id, {
      registrationCode: 'TESTONLY000000000001', licenseHolder: '隔离主体',
      evidenceReference: 'fixture:MERCHANT-BOOKING'
    });
    const merchant = await repo.approveMerchantApplication(
      application.id, '隔离商家资格核验夹具记录', true
    );

    async function supply() {
      const entry = await repo.saveIndustryEntry(owner, null, {
        projectId: project.id, title: '隔离可预约供给', detail: '核对待确认预约与原服务的关联处理',
        cityCode: '441900', districtCode: '441900003', district: '中心街道', price: '80',
        fields: Object.fromEntries(workflow.fields.map(field => [field.key, '隔离服务范围与条款'])),
        imageIds: [], clientKey: 'entry_' + ticket(), action: 'submit'
      });
      await repo.reviewIndustryEntry(entry.id,{...completedSectorChecks(),
        revision: 1, status: 'published', textReviewed: true, scopeReviewed: true,
        response: '隔离原业务内容与范围核查记录'
      }, 'operator');
      const link = await repo.connectIndustryService(owner, entry.id, {
        revision: 2, merchantId: merchant.id, confirmed: true
      });
      await repo.reviewIndustryService(link.service_id, {
        revision: 1, status: 'published', textReviewed: true, imagesReviewed: true,
        scopeReviewed: true, response: '隔离服务独立内容与范围复核记录'
      }, 'operator');
      return {entry, serviceId: link.service_id};
    }

    const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const input = (serviceId, hour = '02') => ({
      serviceId, requestedAt: date + 'T' + hour + ':00:00.000Z',
      remark: '隔离预约记录', clientKey: 'booking_' + ticket()
    });
    const close = source => repo.closeIndustryEntry(owner, source.entry.id, {
      revision: 2, response: '原业务已结束，核对未确认预约的处理状态'
    });

    await context.test('concurrent workers cancel and notify once while preserving confirmed bookings', async () => {
      const source = await supply();
      const pending = await repo.createBooking(customer, input(source.serviceId));
      const confirmed = await repo.createBooking(customer, input(source.serviceId, '03'));
      await repo.actOnMerchantBooking(owner, merchant.id, confirmed.id, 'confirm');
      await close(source);
      const results = await Promise.all([
        repo.endUnavailableIndustryBookings(), repo.endUnavailableIndustryBookings()
      ]);
      assert.equal(results.reduce((sum, result) => sum + result.processed, 0), 1);
      const rows = (await repo.myBookings(customer));
      assert.equal(rows.find(row => row.id === pending.id).status, 'cancelled');
      assert.equal(rows.find(row => row.id === pending.id).cancellationReason, cancellationReason);
      assert.equal(rows.find(row => row.id === confirmed.id).status, 'confirmed');
      const audit = await pool.query(
        "SELECT count(*)::int count FROM admin_audit_events WHERE action='booking_source_unavailable' AND target_id=$1",
        [pending.id]
      );
      assert.equal(audit.rows[0].count, 1);
      const notices = await pool.query(
        "SELECT user_id,target_kind,target_id FROM user_notifications WHERE title LIKE '原服务已暂停%'"
      );
      assert.equal(notices.rows.filter(row => row.user_id === customer && row.target_id === pending.id).length, 1);
      assert.equal(notices.rows.filter(row => row.user_id === owner && row.target_id === merchant.id).length, 1);
    });

    await context.test('customer read and original submission replay retain the same cancelled request', async () => {
      const source = await supply();
      const request = input(source.serviceId);
      const booking = await repo.createBooking(customer, request);
      await close(source);
      const receipt = await repo.readBookingSubmission(customer, request.clientKey);
      assert.equal(receipt.id, booking.id);
      assert.equal(receipt.status, 'cancelled');
      assert.equal(receipt.cancellationReason, cancellationReason);
      const replay = await repo.createBooking(customer, request);
      assert.equal(replay.id, booking.id);
      assert.equal(replay.status, 'cancelled');
      assert.equal(replay.cancellationReason, cancellationReason);
      assert.equal(replay.replayed, true);
    });

    await context.test('notification failure rolls back the cancellation and a later retry completes once', async () => {
      const source = await supply();
      const booking = await repo.createBooking(customer, input(source.serviceId));
      await close(source);
      await pool.query(`
        CREATE FUNCTION reject_source_notice() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.title = '原服务已暂停，预约已取消' THEN
            RAISE EXCEPTION 'fixture notice failure';
          END IF;
          RETURN NEW;
        END;
        $$;
        CREATE TRIGGER reject_source_notice BEFORE INSERT ON user_notifications
          FOR EACH ROW EXECUTE FUNCTION reject_source_notice();
      `);
      try {
        await assert.rejects(repo.endUnavailableIndustryBookings(), /fixture notice failure/);
        const original = (await pool.query(
          'SELECT status,system_cancellation_reason FROM booking_requests WHERE id=$1', [booking.id]
        )).rows[0];
        assert.equal(original.status, 'pending_confirm');
        assert.equal(original.system_cancellation_reason, '');
        assert.equal((await pool.query(
          "SELECT 1 FROM admin_audit_events WHERE action='booking_source_unavailable' AND target_id=$1", [booking.id]
        )).rows.length, 0);
      } finally {
        await pool.query('DROP TRIGGER reject_source_notice ON user_notifications');
        await pool.query('DROP FUNCTION reject_source_notice()');
      }
      assert.equal((await repo.endUnavailableIndustryBookings()).processed, 1);
      assert.equal((await repo.endUnavailableIndustryBookings()).processed, 0);
    });

    await context.test('confirmation racing cancellation never confirms an unavailable source', async () => {
      const source = await supply();
      const booking = await repo.createBooking(customer, input(source.serviceId));
      await close(source);
      const [confirmation] = await Promise.allSettled([
        repo.actOnMerchantBooking(owner, merchant.id, booking.id, 'confirm'),
        repo.endUnavailableIndustryBookings()
      ]);
      if (confirmation.status === 'fulfilled') {
        assert.equal(confirmation.value, false);
      } else {
        assert.equal(confirmation.reason.code, 'SERVICE_NOT_AVAILABLE');
      }
      await repo.endUnavailableIndustryBookings();
      const result = (await repo.myBookings(customer)).find(item => item.id === booking.id);
      assert.equal(result.status, 'cancelled');
      assert.equal(result.cancellationReason, cancellationReason);
    });

    await context.test('merchant read returns the same reason and disables a new confirmation', async () => {
      const source = await supply();
      const booking = await repo.createBooking(customer, input(source.serviceId));
      await close(source);
      const rows = await repo.myMerchantBookings(owner, merchant.id);
      const item = rows.find(row => row.id === booking.id);
      assert.equal(item.status, 'cancelled');
      assert.equal(item.cancellationReason, cancellationReason);
      assert.equal(await repo.actOnMerchantBooking(owner, merchant.id, booking.id, 'confirm'), false);
    });

    await context.test('credential expiry is reconciled by maintenance and restoration preserves the cancellation', async () => {
      const source = await supply();
      const request = input(source.serviceId);
      const booking = await repo.createBooking(customer, request);
      await pool.query("UPDATE industry_credentials SET valid_until=now()-interval '1 second' WHERE id=$1", [credential.id]);
      const maintenance = await repo.runMaintenance();
      assert.equal(maintenance.unavailable_industry_bookings.ok, true);
      assert.equal(maintenance.unavailable_industry_bookings.processed, 1);
      await pool.query("UPDATE industry_credentials SET valid_until=now()+interval '1 day' WHERE id=$1", [credential.id]);
      const replay = await repo.createBooking(customer, request);
      assert.equal(replay.id, booking.id);
      assert.equal(replay.status, 'cancelled');
      const fresh = await repo.createBooking(customer, {...request, clientKey: 'fresh_' + ticket()});
      assert.notEqual(fresh.id, booking.id);
      assert.equal(fresh.status, 'pending_confirm');
      await repo.cancelBooking(customer, fresh.id);
    });

    await context.test('ordinary paused services preserve their existing pending bookings', async () => {
      const service = await repo.createMerchantService(owner, merchant.id,{publicationConsent:acceptedConsent(),
        title: '普通商家服务', description: '已存在服务暂停后的原预约仍可处理', price: '80', imageIds: []
      });
      await repo.reviewService(service.id, 'published');
      const booking = await repo.createBooking(customer, input(service.id));
      await repo.changeMerchantServiceStatus(owner, merchant.id, service.id, 'pause');
      assert.equal((await repo.endUnavailableIndustryBookings()).processed, 0);
      assert.equal((await repo.myBookings(customer)).find(row => row.id === booking.id).status, 'pending_confirm');
      assert.ok(await repo.actOnMerchantBooking(owner, merchant.id, booking.id, 'confirm'));
    });
  } finally {
    if (repo) await repo.close();
    if (pool) await pool.end();
    try {
      await control.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    } finally {
      await control.end();
    }
  }
});
