-- Append-only consent evidence survives withdrawal and phone rebinding.
CREATE TABLE phone_consent_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 publication_id uuid NOT NULL REFERENCES publications(id),
 user_id uuid NOT NULL REFERENCES app_users(id),
 granted boolean NOT NULL, phone_revision integer,
 policy_version text NOT NULL DEFAULT 'phone-disclosure-v1',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION capture_phone_consent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' OR ROW(NEW.public_phone,NEW.phone_revision,NEW.consent_at) IS DISTINCT FROM ROW(OLD.public_phone,OLD.phone_revision,OLD.consent_at) THEN
  INSERT INTO phone_consent_events(publication_id,user_id,granted,phone_revision)
  SELECT NEW.publication_id,user_id,NEW.public_phone,NEW.phone_revision FROM publications WHERE id=NEW.publication_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER phone_consent_history AFTER INSERT OR UPDATE ON publication_contact_settings FOR EACH ROW EXECUTE FUNCTION capture_phone_consent();
CREATE TABLE phone_access_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), viewer_id uuid NOT NULL REFERENCES app_users(id),
 publication_id uuid NOT NULL REFERENCES publications(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phone_access_quota ON phone_access_events(viewer_id,created_at);
CREATE INDEX risk_pending_order ON risk_cases(created_at,id) WHERE status='pending';
CREATE INDEX publication_pending_order ON publications(created_at,id) WHERE status='pending';
CREATE INDEX contact_pending_order ON contact_requests(created_at,id) WHERE status='pending';
