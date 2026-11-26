ALTER TABLE verified_phones DROP CONSTRAINT verified_phones_method_check;
ALTER TABLE verified_phones ADD CONSTRAINT verified_phones_method_check
 CHECK (method IN ('wechat_phone','manual_usage_check','sms_otp'));
CREATE INDEX IF NOT EXISTS verified_phones_number_hmac_idx ON verified_phones(number_hmac);
ALTER TABLE login_consent_events ADD COLUMN login_method text NOT NULL DEFAULT 'wechat_miniapp'
 CHECK (login_method IN ('wechat_miniapp','sms_otp'));

CREATE TABLE sms_challenges (
 id uuid PRIMARY KEY,
 purpose text NOT NULL CHECK (purpose IN ('signin','bind','change_old')),
 phone_digest text NOT NULL,
 device_digest text NOT NULL,
 network_digest text NOT NULL,
 account_digest text NOT NULL,
 session_digest text NOT NULL,
 code_digest text,
 state text NOT NULL CHECK (state IN ('sending','sent','unknown','failed','superseded','consumed','locked')),
 attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '300 seconds'),
 CHECK ((state IN ('sending','sent','unknown')) = (code_digest IS NOT NULL))
);
CREATE INDEX sms_challenges_phone_time ON sms_challenges(phone_digest,created_at);
CREATE INDEX sms_challenges_network_time ON sms_challenges(network_digest,created_at);
CREATE INDEX sms_challenges_device_time ON sms_challenges(device_digest,created_at);
CREATE INDEX sms_challenges_account_time ON sms_challenges(account_digest,created_at) WHERE account_digest <> '';
CREATE INDEX sms_challenges_created_at ON sms_challenges(created_at);
