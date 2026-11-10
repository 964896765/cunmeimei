CREATE TABLE login_consent_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),
 terms_version text NOT NULL,privacy_version text NOT NULL,document_hash char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER login_consent_immutable BEFORE UPDATE OR DELETE ON login_consent_events FOR EACH ROW EXECUTE FUNCTION immutable_financial_record();
CREATE TABLE phone_authorization_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),
 action text NOT NULL CHECK(action IN ('authorized','rebound','withdrawn')),
 phone_revision integer,privacy_version text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER phone_authorization_immutable BEFORE UPDATE OR DELETE ON phone_authorization_events FOR EACH ROW EXECUTE FUNCTION immutable_financial_record();
