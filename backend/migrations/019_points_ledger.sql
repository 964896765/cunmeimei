CREATE TABLE points_accounts (
 user_id uuid PRIMARY KEY REFERENCES app_users(id),
 available integer NOT NULL DEFAULT 0 CHECK(available>=0),
 held integer NOT NULL DEFAULT 0 CHECK(held>=0),
 earned integer NOT NULL DEFAULT 0 CHECK(earned>=0),
 spent integer NOT NULL DEFAULT 0 CHECK(spent>=0)
);
CREATE TABLE points_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES points_accounts(user_id),
 kind text NOT NULL CHECK(kind IN ('earn','hold','release','spend','reversal','adjustment')),
 amount integer NOT NULL CHECK(amount>0), available_delta integer NOT NULL, held_delta integer NOT NULL,
 earned_delta integer NOT NULL DEFAULT 0, spent_delta integer NOT NULL DEFAULT 0,
 available_after integer NOT NULL CHECK(available_after>=0), held_after integer NOT NULL CHECK(held_after>=0),
 idempotency_key varchar(160) NOT NULL UNIQUE, request_hash text NOT NULL, source text NOT NULL, reason text NOT NULL, actor text NOT NULL,
 original_id uuid REFERENCES points_ledger(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX points_one_reversal ON points_ledger(original_id) WHERE kind='reversal';
CREATE INDEX points_history ON points_ledger(user_id,created_at DESC,id);
CREATE FUNCTION immutable_financial_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable financial or consent record'; END $$;
CREATE TRIGGER points_immutable BEFORE UPDATE OR DELETE ON points_ledger FOR EACH ROW EXECUTE FUNCTION immutable_financial_record();
CREATE TRIGGER consent_immutable BEFORE UPDATE OR DELETE ON phone_consent_events FOR EACH ROW EXECUTE FUNCTION immutable_financial_record();
CREATE TABLE points_holds (
 id uuid PRIMARY KEY REFERENCES points_ledger(id), user_id uuid NOT NULL REFERENCES points_accounts(user_id),
 amount integer NOT NULL CHECK(amount>0), status text NOT NULL DEFAULT 'held' CHECK(status IN ('held','released','spent')),
 expires_at timestamptz NOT NULL
);
CREATE TABLE points_rules (
 code text PRIMARY KEY, amount integer NOT NULL CHECK(amount BETWEEN 0 AND 20),
 daily_limit integer NOT NULL CHECK(daily_limit BETWEEN 0 AND 20),enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1
);
INSERT INTO points_rules(code,amount,daily_limit) VALUES('publication_approved',5,10);
