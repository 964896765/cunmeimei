-- Preserve the outcome of one user submission independently of slot occupancy.
-- Legacy bookings have no submission key; this does not invent historical keys.
CREATE UNIQUE INDEX booking_requests_id_owner ON booking_requests(id,user_id);
CREATE TABLE booking_submissions (
 id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 user_id uuid NOT NULL REFERENCES app_users(id),
 client_key varchar(64) NOT NULL CHECK(client_key ~ '^[A-Za-z0-9_-]{16,64}$'),
 payload_hash char(64) NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 booking_id uuid,
 failure_code varchar(40) CHECK(failure_code IN ('SLOT_TAKEN','SLOT_EXPIRED','SERVICE_NOT_AVAILABLE','EXISTING_BOOKING_DIFFERENT')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,client_key),
 FOREIGN KEY(booking_id,user_id) REFERENCES booking_requests(id,user_id),
 CHECK ((booking_id IS NOT NULL AND failure_code IS NULL) OR (booking_id IS NULL AND failure_code IS NOT NULL))
);
CREATE INDEX booking_submissions_booking ON booking_submissions(booking_id);
CREATE TRIGGER active_booking_submission BEFORE INSERT ON booking_submissions FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
