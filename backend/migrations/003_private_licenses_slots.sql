-- V0.4 (requires PostgreSQL 13+): private evidence metadata and single-capacity time slots.
-- Before migration, check historical collisions; review/resolve before enforcing uniqueness:
-- SELECT service_id,requested_at,count(*) FROM booking_requests
-- WHERE status IN ('pending_confirm','confirmed') GROUP BY 1,2 HAVING count(*)>1;
ALTER TABLE merchant_applications ADD COLUMN IF NOT EXISTS license_file_id uuid;
CREATE TABLE IF NOT EXISTS merchant_license_files (
 id uuid PRIMARY KEY,application_id uuid NOT NULL REFERENCES merchant_applications(id),
 sha256 char(64) NOT NULL,size integer NOT NULL CHECK(size>0 AND size<=2097152),
 content_type varchar(24) NOT NULL CHECK(content_type IN ('image/jpeg','image/png')),
 uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE merchant_applications DROP CONSTRAINT IF EXISTS fk_merchant_license_current;
ALTER TABLE merchant_applications ADD CONSTRAINT fk_merchant_license_current FOREIGN KEY(license_file_id) REFERENCES merchant_license_files(id);
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;
ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS booking_requests_status_check;
ALTER TABLE booking_requests ADD CONSTRAINT booking_requests_status_check CHECK(status IN ('pending_confirm','confirmed','declined','cancelled','completed','expired'));
-- An old pending booking becomes expired during migration, since it had no hold deadline.
UPDATE booking_requests SET status='expired',updated_at=now() WHERE status='pending_confirm' AND hold_expires_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_active_slot ON booking_requests(service_id,requested_at) WHERE status IN ('pending_confirm','confirmed');
