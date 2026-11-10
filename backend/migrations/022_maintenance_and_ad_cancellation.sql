ALTER TABLE ad_reservations ADD COLUMN cancelled_at timestamptz;
ALTER TABLE ad_reservations ADD COLUMN refund_entry_id uuid REFERENCES points_ledger(id);
CREATE TABLE maintenance_jobs (
 name text PRIMARY KEY,started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,
 last_success_at timestamptz,failures integer NOT NULL DEFAULT 0,last_error_code text NOT NULL DEFAULT ''
);
CREATE TABLE operational_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),job_name text NOT NULL UNIQUE,
 code text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expired_points_holds ON points_holds(expires_at,id) WHERE status='held';
