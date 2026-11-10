-- Additive: retain all existing users, drafts and publications as unverified.
CREATE TABLE account_trust (
 user_id uuid PRIMARY KEY REFERENCES app_users(id), identity_status text NOT NULL DEFAULT 'unverified' CHECK(identity_status IN ('unverified','pending','verified','revoked')),
 identity_method text NOT NULL DEFAULT '', evidence_reference text NOT NULL DEFAULT '', identity_until timestamptz,
 revision integer NOT NULL DEFAULT 1, risk_level text NOT NULL DEFAULT 'normal' CHECK(risk_level IN ('normal','suspicious','severe')),
 risk_until timestamptz, restrict_publish boolean NOT NULL DEFAULT false, restrict_contact boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE verified_phones (
 user_id uuid PRIMARY KEY REFERENCES app_users(id), encrypted_number text NOT NULL, number_hmac text NOT NULL, masked_number text NOT NULL,
 method text NOT NULL CHECK(method IN ('wechat_phone','manual_usage_check')), evidence_reference text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1, verified_until timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE publication_contact_settings (
 publication_id uuid PRIMARY KEY REFERENCES publications(id), public_phone boolean NOT NULL DEFAULT false, allow_messages boolean NOT NULL DEFAULT true,
 phone_revision integer, consent_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT public_phone OR (phone_revision IS NOT NULL AND consent_at IS NOT NULL))
);
CREATE TABLE qualification_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),scope text NOT NULL,
 reference text NOT NULL,status text NOT NULL CHECK(status IN ('verified','revoked')),valid_until timestamptz NOT NULL,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,scope)
);
CREATE TABLE trust_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),action text NOT NULL,reason text NOT NULL,
 actor_role text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE trust_appeals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),action_id uuid NOT NULL REFERENCES trust_actions(id),
 reason text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),response text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX trust_one_open_appeal ON trust_appeals(user_id,action_id) WHERE status='pending';
CREATE TABLE risk_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),target_type text NOT NULL,target_id uuid,
 signals jsonb NOT NULL DEFAULT '[]',status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved')),resolution text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE contact_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),contact_id uuid NOT NULL REFERENCES contact_requests(id),sender_id uuid NOT NULL REFERENCES app_users(id),
 body varchar(1000) NOT NULL,client_key varchar(64) NOT NULL,status text NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','held','removed')),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(sender_id,client_key)
);
CREATE INDEX contact_messages_order ON contact_messages(contact_id,created_at,id);
ALTER TABLE contact_requests ADD COLUMN ended_at timestamptz;
ALTER TABLE content_images ADD COLUMN content_sha256 text;
ALTER TABLE content_reports DROP CONSTRAINT content_reports_target_type_check;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_target_type_check CHECK(target_type IN ('publication','service','user','message'));

CREATE TABLE phone_binding_history (user_id uuid NOT NULL REFERENCES app_users(id),number_hmac text NOT NULL,bound_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,number_hmac));
CREATE INDEX phone_binding_history_lookup ON phone_binding_history(number_hmac);

ALTER TABLE account_trust ADD COLUMN last_risk_action uuid REFERENCES trust_actions(id);

UPDATE content_images SET content_sha256=encode(sha256(data),'hex') WHERE content_sha256 IS NULL;
CREATE INDEX content_images_hash ON content_images(content_sha256);
