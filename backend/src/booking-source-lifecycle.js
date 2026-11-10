'use strict';

const {transaction} = require('./points-repository');

const cancellationReason = 'industry_source_unavailable';

function attachBookingSourceLifecycle(repo, pool) {
  repo.endUnavailableIndustryBookings = (bookingIds = null) => transaction(pool, async client => {
    const {rows} = await client.query(`
      WITH candidates AS (
        SELECT booking.id, service.merchant_id
        FROM booking_requests booking
        JOIN service_catalog service ON service.id = booking.service_id
        JOIN industry_service_links link ON link.service_id = service.id
        WHERE booking.status = 'pending_confirm'
          AND NOT public_service_source_ok(service.id)
          AND ($1::uuid[] IS NULL OR booking.id = ANY($1::uuid[]))
        ORDER BY booking.created_at, booking.id
        LIMIT 100
        FOR UPDATE OF booking SKIP LOCKED
      )
      UPDATE booking_requests booking
      SET status = 'cancelled', system_cancellation_reason = $2,
          updated_at = clock_timestamp()
      FROM candidates
      WHERE booking.id = candidates.id AND booking.status = 'pending_confirm'
      RETURNING booking.id, booking.user_id, candidates.merchant_id
    `, [bookingIds, cancellationReason]);

    for (const booking of rows) {
      await client.query(`
        INSERT INTO admin_audit_events(action, target_type, target_id, notes)
        VALUES ('booking_source_unavailable', 'booking', $1, $2)
      `, [booking.id, cancellationReason]);

      await client.query(`
        INSERT INTO user_notifications(user_id, title, body, target_kind, target_id)
        VALUES ($1, '原服务已暂停，预约已取消',
          '本次预约尚未确认，已自动取消。可从服务中心查看原预约和处理原因。',
          'booking', $2)
      `, [booking.user_id, booking.id]);

      await client.query(`
        INSERT INTO user_notifications(user_id, title, body, target_kind, target_id)
        SELECT member.user_id, '原服务已暂停，待确认预约已取消',
          '可在商家预约记录核对原申请和取消原因。',
          'merchant-booking', member.merchant_id
        FROM merchant_members member
        JOIN verified_merchants merchant
          ON merchant.id = member.merchant_id AND merchant.status = 'active'
        WHERE member.merchant_id = $1 AND member.status = 'active'
          AND member.role IN ('owner', 'manager', 'staff')
          AND member.user_id <> $2
      `, [booking.merchant_id, booking.user_id]);
    }

    return {processed: rows.length, bookingIds: rows.map(booking => booking.id)};
  });

  // Lists and original-request recovery use the same terminal state as the worker.
  for (const method of ['myBookings', 'myMerchantBookings', 'readBookingSubmission', 'createBooking']) {
    const original = repo[method];
    repo[method] = async (...args) => {
      const result = await original(...args);
      const bookings = [result].flat().filter(booking => booking?.id);
      const pendingIds = bookings.filter(booking => booking.status === 'pending_confirm')
        .map(booking => booking.id);
      if (!pendingIds.length) return result;

      const ended = await repo.endUnavailableIndustryBookings(pendingIds);
      if (!ended.processed) return result;

      const endedIds = new Set(ended.bookingIds);
      const update = booking => endedIds.has(booking.id)
        ? {...booking, status: 'cancelled', cancellationReason}
        : booking;
      return Array.isArray(result) ? result.map(update) : update(result);
    };
  }

  return repo;
}

module.exports = {attachBookingSourceLifecycle, cancellationReason};
