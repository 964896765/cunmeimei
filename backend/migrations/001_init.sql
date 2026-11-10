-- City Life V0.2 first executable PostgreSQL migration; no demo merchant/content inserted.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS app_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 display_name varchar(80), status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_identities (
 provider varchar(24) NOT NULL CHECK(provider IN ('wechat_miniapp','dev_local')),
 provider_id varchar(255) NOT NULL,
 user_id uuid NOT NULL REFERENCES app_users(id),
 PRIMARY KEY(provider,provider_id)
);
CREATE TABLE IF NOT EXISTS app_sessions (
 token_sha256 char(64) PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES app_users(id),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires ON app_sessions(expires_at);
CREATE TABLE IF NOT EXISTS publications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id),
 type varchar(24) NOT NULL CHECK(type IN ('housing','used','community','service')),
 title varchar(100) NOT NULL, description text NOT NULL,
 district varchar(80) NOT NULL, price varchar(80) NOT NULL DEFAULT '',
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','closed')),
 moderation_reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_publications_feed ON publications(status,type,district,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_publications_user ON publications(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS merchant_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id),
 name varchar(100) NOT NULL, category varchar(40) NOT NULL, district varchar(80) NOT NULL,
 status varchar(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_review','needs_documents','rejected')),
 reviewer_note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merchant_applications_user ON merchant_applications(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS service_catalog (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title varchar(100) NOT NULL, description text NOT NULL DEFAULT '',
 district varchar(80) NOT NULL, price varchar(80) NOT NULL DEFAULT '',
 status varchar(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','disabled')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS booking_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id),
 service_id uuid NOT NULL REFERENCES service_catalog(id),
 requested_at timestamptz NOT NULL,
 remark varchar(300) NOT NULL DEFAULT '',
 status varchar(24) NOT NULL DEFAULT 'pending_confirm' CHECK(status IN ('pending_confirm','confirmed','cancelled','completed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_booking_requests_user ON booking_requests(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS admin_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action varchar(80) NOT NULL,
 target_type varchar(40) NOT NULL,target_id uuid NOT NULL,
 notes text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
