-- Memorial halls are independent of the industry and publication catalogs.
CREATE TABLE memorial_halls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES app_users(id),
 client_key varchar(64) NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}',
 subject_hash char(64) NOT NULL,
 portrait_image_id uuid REFERENCES content_images(id),
 status varchar(24) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending_review','published','hidden','rejected','deleted')),
 revision integer NOT NULL DEFAULT 1,
 requested_public boolean NOT NULL DEFAULT false,
 public_allowed boolean NOT NULL DEFAULT false,
 authorization_id uuid,
 response text NOT NULL DEFAULT '',
 submitted_notice jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,client_key)
);
CREATE TABLE memorial_proofs (
 id uuid PRIMARY KEY,
 hall_id uuid NOT NULL REFERENCES memorial_halls(id),
 owner_id uuid NOT NULL REFERENCES app_users(id),
 content_type varchar(32) NOT NULL,
 sha256 char(64) NOT NULL,
 size integer NOT NULL CHECK(size BETWEEN 32 AND 2097152),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memorial_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hall_id uuid NOT NULL REFERENCES memorial_halls(id),
 owner_id uuid NOT NULL REFERENCES app_users(id),
 subject_hash char(64) NOT NULL,
 relationship varchar(80) NOT NULL,
 statement text NOT NULL,
 proof_id uuid NOT NULL REFERENCES memorial_proofs(id),
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected','revoked')),
 revision integer NOT NULL DEFAULT 1,
 response text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE memorial_halls ADD CONSTRAINT memorial_hall_authorization_fk FOREIGN KEY(authorization_id) REFERENCES memorial_authorizations(id);
CREATE TABLE memorial_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hall_id uuid NOT NULL REFERENCES memorial_halls(id),
 user_id uuid NOT NULL REFERENCES app_users(id),
 revision integer NOT NULL,
 payload jsonb NOT NULL,
 authorization_id uuid NOT NULL REFERENCES memorial_authorizations(id),
 notice_version varchar(64) NOT NULL,
 public_requested boolean NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(hall_id,revision)
);
CREATE TABLE memorial_tributes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hall_id uuid NOT NULL REFERENCES memorial_halls(id),
 user_id uuid NOT NULL REFERENCES app_users(id),
 kind varchar(20) NOT NULL CHECK(kind IN ('flower','candle','blessing')),
 blessing_code varchar(32),
 tribute_day date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::date,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(hall_id,user_id,kind,tribute_day)
);
CREATE TABLE memorial_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hall_id uuid NOT NULL REFERENCES memorial_halls(id),
 user_id uuid NOT NULL REFERENCES app_users(id),
 kind varchar(24) NOT NULL CHECK(kind IN ('impersonation','privacy','rights','other')),
 reason text NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','rejected')),
 revision integer NOT NULL DEFAULT 1,
 response text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX memorial_pending_report ON memorial_reports(hall_id,user_id) WHERE status='pending';
CREATE TABLE memorial_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hall_id uuid NOT NULL REFERENCES memorial_halls(id),
 action varchar(64) NOT NULL,
 actor varchar(100) NOT NULL,
 revision integer NOT NULL,
 reason text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX memorial_owner ON memorial_halls(owner_id,updated_at DESC,id);
CREATE INDEX memorial_public ON memorial_halls(updated_at DESC,id) WHERE status='published' AND public_allowed;
CREATE INDEX memorial_audit_hall ON memorial_audit(hall_id,created_at,id);

CREATE VIEW public_memorial_eligibility AS
 SELECT h.id FROM memorial_halls h
 JOIN app_users u ON u.id=h.owner_id AND u.status='active'
 JOIN memorial_authorizations a ON a.id=h.authorization_id AND a.status='verified' AND a.subject_hash=h.subject_hash
 WHERE h.status='published' AND h.public_allowed;

-- Ordinary galleries cannot turn a reserved memorial portrait into public media.
CREATE FUNCTION protect_memorial_portrait() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM memorial_halls h WHERE h.portrait_image_id=ANY(NEW.image_ids)) THEN
  RAISE EXCEPTION 'MEMORIAL_PORTRAIT_RESERVED';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER protect_memorial_portrait BEFORE INSERT OR UPDATE OF image_ids ON publications
 FOR EACH ROW EXECUTE FUNCTION protect_memorial_portrait();
CREATE TRIGGER protect_memorial_service_portrait BEFORE INSERT OR UPDATE OF image_ids ON service_catalog
 FOR EACH ROW EXECUTE FUNCTION protect_memorial_portrait();
