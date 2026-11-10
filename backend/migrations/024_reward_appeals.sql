ALTER TABLE points_reward_events ADD COLUMN waived_report_ids uuid[] NOT NULL DEFAULT '{}';
CREATE TABLE points_reward_appeals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reward_id uuid NOT NULL REFERENCES points_reward_events(id),
 user_id uuid NOT NULL REFERENCES app_users(id),client_key varchar(64) NOT NULL,
 reason text NOT NULL,source_reward_revision integer NOT NULL,source_status text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','withdrawn','superseded')),
 revision integer NOT NULL DEFAULT 1,response text NOT NULL DEFAULT '',resolution text NOT NULL DEFAULT '',
 ledger_before uuid REFERENCES points_ledger(id),reversal_before uuid REFERENCES points_ledger(id),
 restored_ledger_id uuid REFERENCES points_ledger(id),resolution_snapshot jsonb,reviewed_by text,
 created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,
 UNIQUE(user_id,client_key)
);
CREATE UNIQUE INDEX reward_one_open_appeal ON points_reward_appeals(reward_id) WHERE status='pending';
CREATE UNIQUE INDEX reward_one_decision_per_version ON points_reward_appeals(reward_id,source_reward_revision) WHERE status IN ('pending','accepted','rejected');
CREATE INDEX reward_appeals_owner ON points_reward_appeals(user_id,created_at DESC,id);
CREATE INDEX reward_appeals_pending ON points_reward_appeals(created_at,id) WHERE status='pending';
CREATE FUNCTION protect_reward_appeal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable reward appeal'; END IF;
 IF OLD.status<>'pending' OR ROW(NEW.reward_id,NEW.user_id,NEW.client_key,NEW.reason,NEW.source_reward_revision,NEW.source_status,NEW.ledger_before,NEW.reversal_before,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.reward_id,OLD.user_id,OLD.client_key,OLD.reason,OLD.source_reward_revision,OLD.source_status,OLD.ledger_before,OLD.reversal_before,OLD.created_at)
 THEN RAISE EXCEPTION 'immutable reward appeal'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reward_appeal_immutable BEFORE UPDATE OR DELETE ON points_reward_appeals FOR EACH ROW EXECUTE FUNCTION protect_reward_appeal();
