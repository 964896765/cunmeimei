-- V0.3: merchant manual verification, scoped staff, moderated catalog, booking workflow, reports.
-- Do not apply outside an audited migration / backup procedure.
ALTER TABLE merchant_applications ADD COLUMN IF NOT EXISTS registration_code varchar(40);
ALTER TABLE merchant_applications ADD COLUMN IF NOT EXISTS license_holder varchar(120);
ALTER TABLE merchant_applications ADD COLUMN IF NOT EXISTS evidence_reference varchar(200);
ALTER TABLE merchant_applications DROP CONSTRAINT IF EXISTS merchant_applications_status_check;
ALTER TABLE merchant_applications ADD CONSTRAINT merchant_applications_status_check CHECK (status IN ('pending','in_review','needs_documents','rejected','approved'));

CREATE TABLE IF NOT EXISTS verified_merchants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL UNIQUE REFERENCES merchant_applications(id),
 name varchar(100) NOT NULL, category varchar(40) NOT NULL, district varchar(80) NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_id uuid NOT NULL REFERENCES verified_merchants(id),
 user_id uuid NOT NULL REFERENCES app_users(id), role varchar(20) NOT NULL CHECK(role IN ('owner','manager','staff')),
 status varchar(20) NOT NULL DEFAULT 'active' CHECK(status IN ('active','removed')),
 UNIQUE(merchant_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_merchant_members_user ON merchant_members(user_id,status);
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS merchant_id uuid REFERENCES verified_merchants(id);
ALTER TABLE service_catalog DROP CONSTRAINT IF EXISTS service_catalog_status_check;
ALTER TABLE service_catalog ADD CONSTRAINT service_catalog_status_check CHECK(status IN ('draft','pending_review','published','disabled'));
CREATE INDEX IF NOT EXISTS idx_service_catalog_merchant ON service_catalog(merchant_id,status);
ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS booking_requests_status_check;
ALTER TABLE booking_requests ADD CONSTRAINT booking_requests_status_check CHECK(status IN ('pending_confirm','confirmed','declined','cancelled','completed'));
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_booking_service ON booking_requests(service_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS content_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id),
 target_type varchar(24) NOT NULL CHECK(target_type IN ('publication','service')),
 target_id uuid NOT NULL, reason varchar(32) NOT NULL CHECK(reason IN ('false_info','spam','unsafe','other')),
 description varchar(500) NOT NULL DEFAULT '',
 status varchar(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','dismissed','removed')),
 reviewer_note varchar(500) NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_user_open_target ON content_reports(user_id,target_type,target_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_reports_queue ON content_reports(status,created_at);
