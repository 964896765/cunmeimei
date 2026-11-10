CREATE TABLE industry_credentials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),project_id varchar(16) NOT NULL,
 subject text NOT NULL,evidence_reference text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected','revoked')),
 valid_until timestamptz,response text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,project_id)
);
CREATE TABLE industry_entries (
 id uuid PRIMARY KEY REFERENCES publications(id),user_id uuid NOT NULL REFERENCES app_users(id),project_id varchar(16) NOT NULL,policy text NOT NULL,
 channel text NOT NULL CHECK(channel IN ('merchant','service','job','event','public','housing')),payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','published','rejected','closed')),revision integer NOT NULL DEFAULT 1,
 client_key varchar(64) NOT NULL,request_hash text NOT NULL,response text NOT NULL DEFAULT '',source_verified boolean NOT NULL DEFAULT false,
 starts_at timestamptz,ends_at timestamptz,capacity integer CHECK(capacity BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,client_key)
);
CREATE INDEX industry_entries_review ON industry_entries(status,created_at);
CREATE TABLE industry_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entry_id uuid NOT NULL REFERENCES industry_entries(id),user_id uuid NOT NULL REFERENCES app_users(id),
 kind text NOT NULL CHECK(kind IN ('job','event','service')),body text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','withdrawn','ended')),
 response text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,client_key varchar(64) NOT NULL,request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,client_key)
);
CREATE UNIQUE INDEX industry_one_live_response ON industry_responses(entry_id,user_id) WHERE status IN ('pending','accepted');
CREATE TABLE industry_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entry_id uuid NOT NULL REFERENCES industry_entries(id),user_id uuid NOT NULL REFERENCES app_users(id),
 reason text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','rejected')),response text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX industry_one_pending_report ON industry_reports(entry_id,user_id) WHERE status='pending';
CREATE TRIGGER active_industry_credential BEFORE INSERT OR UPDATE ON industry_credentials FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_industry_entry BEFORE INSERT OR UPDATE ON industry_entries FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_industry_response BEFORE INSERT ON industry_responses FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE VIEW industry_public_eligibility AS
 SELECT e.id FROM industry_entries e JOIN app_users u ON u.id=e.user_id AND u.status='active'
 WHERE e.status='published' AND (e.ends_at IS NULL OR e.ends_at>now())
 AND (e.policy NOT IN ('MERCHANT','MERCHANT_SERVICE','PROPERTY','PROPERTY_BIZ','JOB','JOB_FILTER','EVENT_BIZ','LICENSED_PROVIDER','LICENSED_DIRECTORY') OR EXISTS(
  SELECT 1 FROM industry_credentials c WHERE c.user_id=e.user_id AND c.project_id=e.project_id AND c.status='verified' AND c.valid_until>now()))
 AND (e.policy NOT IN ('CURATED_INFO','OFFICIAL_DIRECTORY','LICENSED_DIRECTORY') OR e.source_verified);
