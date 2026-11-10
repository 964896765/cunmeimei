ALTER TABLE app_users DROP CONSTRAINT app_users_status_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_status_check CHECK(status IN ('active','blocked','closed'));
ALTER TABLE app_users ADD COLUMN closed_at timestamptz;
ALTER TABLE privacy_requests DROP CONSTRAINT privacy_requests_kind_check;
ALTER TABLE privacy_requests ADD CONSTRAINT privacy_requests_kind_check CHECK(kind IN ('access','correction','deletion','closure'));
ALTER TABLE privacy_requests ADD COLUMN consent_version text;
CREATE TABLE closed_identity_fingerprints (
 fingerprint char(64) PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_users(id),closed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE account_closure_executions (
 request_id uuid PRIMARY KEY REFERENCES privacy_requests(id),user_id uuid NOT NULL UNIQUE REFERENCES app_users(id),
 actor text NOT NULL,reason text NOT NULL,retention_version text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER account_closure_immutable BEFORE UPDATE OR DELETE ON account_closure_executions FOR EACH ROW EXECUTE FUNCTION immutable_financial_record();
CREATE TABLE data_export_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),section text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_export_quota ON data_export_events(user_id,created_at);
-- In-flight writes that authenticated before closure must also serialize with
-- the user row. This covers callers that do not use the trust guard.
CREATE FUNCTION require_active_record_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_status text;
BEGIN
 SELECT status INTO current_status FROM app_users WHERE id=NEW.user_id FOR SHARE;
 IF current_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER active_publication_owner BEFORE INSERT OR UPDATE ON publications FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_draft_owner BEFORE INSERT OR UPDATE ON account_drafts FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_image_owner BEFORE INSERT ON content_images FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_merchant_applicant BEFORE INSERT OR UPDATE ON merchant_applications FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_advertiser_owner BEFORE INSERT OR UPDATE ON advertisers FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_campaign_owner BEFORE INSERT ON ad_campaigns FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_saved_owner BEFORE INSERT ON saved_items FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_like_owner BEFORE INSERT ON content_likes FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_preference_owner BEFORE INSERT OR UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_privacy_owner BEFORE INSERT ON privacy_requests FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_phone_owner BEFORE INSERT OR UPDATE ON verified_phones FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE TRIGGER active_booker BEFORE INSERT ON booking_requests FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
CREATE FUNCTION protect_closed_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='closed' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'ACCOUNT_CLOSED' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER closed_account_immutable BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION protect_closed_account();
