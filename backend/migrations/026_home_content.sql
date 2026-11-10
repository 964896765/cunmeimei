-- Manually reviewed home placements; no automatic points spend or paid booking.
CREATE TABLE home_content (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind varchar(16) NOT NULL CHECK(kind IN ('news','banner','ad')),
 city_code varchar(6) NOT NULL DEFAULT '',
 status varchar(16) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','disabled')),
 revision integer NOT NULL DEFAULT 1,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 100),
 payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX home_content_delivery ON home_content(city_code,status,starts_at,ends_at);
CREATE TABLE home_content_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),
 content_id uuid NOT NULL REFERENCES home_content(id),reason varchar(500) NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','rejected')),
 response varchar(800) NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX home_report_pending ON home_content_reports(user_id,content_id) WHERE status='pending';
CREATE INDEX home_report_queue ON home_content_reports(status,created_at,id);
CREATE TRIGGER active_home_reporter BEFORE INSERT ON home_content_reports FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
