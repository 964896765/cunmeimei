ALTER TABLE points_rules ADD COLUMN settlement_hours integer NOT NULL DEFAULT 48 CHECK(settlement_hours BETWEEN 24 AND 72);
ALTER TABLE points_rules ADD COLUMN publication_daily_limit integer NOT NULL DEFAULT 10 CHECK(publication_daily_limit BETWEEN 0 AND 20);
ALTER TABLE points_rules ADD COLUMN enabled_since timestamptz NOT NULL DEFAULT now();
INSERT INTO points_rules(code,amount,daily_limit,publication_daily_limit) VALUES
 ('publication_valid_7d',2,20,2),('publication_valid_30d',3,20,3),
 ('valid_favorite',1,20,5),('accepted_contact',2,20,4);
CREATE TABLE publication_first_approvals (
 publication_id uuid PRIMARY KEY REFERENCES publications(id),approved_at timestamptz NOT NULL,
 provenance text NOT NULL DEFAULT 'triggered' CHECK(provenance IN ('triggered','legacy_audit','legacy_public_state'))
);
INSERT INTO publication_first_approvals(publication_id,approved_at,provenance)
 SELECT p.id,coalesce((SELECT min(a.created_at) FROM admin_audit_events a WHERE a.target_type='publication' AND a.target_id=p.id AND a.action='published'),p.reviewed_at,p.created_at),
 CASE WHEN EXISTS(SELECT 1 FROM admin_audit_events a WHERE a.target_type='publication' AND a.target_id=p.id AND a.action='published') THEN 'legacy_audit' ELSE 'legacy_public_state' END
 FROM publications p WHERE p.status='published' OR EXISTS(SELECT 1 FROM admin_audit_events a WHERE a.target_type='publication' AND a.target_id=p.id AND a.action='published');
CREATE TRIGGER first_approval_immutable BEFORE UPDATE OR DELETE ON publication_first_approvals FOR EACH ROW EXECUTE FUNCTION immutable_financial_record();
CREATE TABLE points_reward_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),
 actor_id uuid NOT NULL REFERENCES app_users(id),publication_id uuid NOT NULL REFERENCES publications(id),
 publication_revision integer NOT NULL,rule_code text NOT NULL REFERENCES points_rules(code),
 rule_revision integer NOT NULL,rule_snapshot jsonb NOT NULL,source_id uuid,
 amount integer NOT NULL CHECK(amount BETWEEN 1 AND 20),event_day date NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','review','settled','cancelled','rejected','reversed','reversal_pending')),
 settle_after timestamptz NOT NULL,signals jsonb NOT NULL DEFAULT '[]',approved_signals jsonb,
 reason text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,
 ledger_id uuid REFERENCES points_ledger(id),reversal_id uuid REFERENCES points_ledger(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(rule_code,publication_id,actor_id)
);
CREATE INDEX reward_pending_due ON points_reward_events(settle_after,id) WHERE status IN ('pending','review');
CREATE INDEX reward_daily_quota ON points_reward_events(user_id,event_day,rule_code,publication_id);
CREATE INDEX reward_active ON points_reward_events(updated_at,id) WHERE status IN ('settled','reversal_pending');
CREATE INDEX reward_milestones ON publications(reviewed_at,id) WHERE status='published' AND NOT is_test;
CREATE TABLE points_rule_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL,revision integer NOT NULL,
 snapshot jsonb NOT NULL,actor text NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(code,revision)
);
CREATE TRIGGER points_rule_history_immutable BEFORE UPDATE OR DELETE ON points_rule_history FOR EACH ROW EXECUTE FUNCTION immutable_financial_record();
CREATE FUNCTION protect_reward_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable reward source'; END IF;
 IF ROW(NEW.user_id,NEW.actor_id,NEW.publication_id,NEW.publication_revision,NEW.rule_code,NEW.rule_revision,NEW.rule_snapshot,NEW.source_id,NEW.amount,NEW.event_day,NEW.settle_after,NEW.created_at)
  IS DISTINCT FROM ROW(OLD.user_id,OLD.actor_id,OLD.publication_id,OLD.publication_revision,OLD.rule_code,OLD.rule_revision,OLD.rule_snapshot,OLD.source_id,OLD.amount,OLD.event_day,OLD.settle_after,OLD.created_at)
 THEN RAISE EXCEPTION 'immutable reward source'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER points_reward_source_immutable BEFORE UPDATE OR DELETE ON points_reward_events FOR EACH ROW EXECUTE FUNCTION protect_reward_source();
CREATE FUNCTION capture_points_reward(code text,pub_id uuid,actor uuid,source uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE rule points_rules%ROWTYPE;pub publications%ROWTYPE;day date;used integer;event_id uuid;
BEGIN
 SELECT * INTO rule FROM points_rules WHERE points_rules.code=capture_points_reward.code AND enabled AND amount>0 FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO pub FROM publications WHERE id=pub_id AND status='published' AND NOT is_test AND (expires_at IS NULL OR expires_at>now());
 IF NOT FOUND THEN RETURN NULL; END IF;
 PERFORM id FROM app_users WHERE id=pub.user_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF code IN ('valid_favorite','accepted_contact') AND actor=pub.user_id THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('reward-quota:'||pub.user_id));
 SELECT id INTO event_id FROM points_reward_events e WHERE e.rule_code=code AND e.publication_id=pub_id AND e.actor_id=actor;
 IF FOUND THEN RETURN event_id; END IF;
 day:=(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date;
 -- Quota reservations include cancelled/rejected events: toggling interactions
 -- or creating risky events cannot repeatedly reclaim the same day's allowance.
 SELECT coalesce(sum(amount),0) INTO used FROM points_reward_events WHERE user_id=pub.user_id AND event_day=day;
 IF used+rule.amount>20 THEN RETURN NULL; END IF;
 SELECT coalesce(sum(amount),0) INTO used FROM points_reward_events WHERE user_id=pub.user_id AND event_day=day AND rule_code=code;
 IF used+rule.amount>rule.daily_limit THEN RETURN NULL; END IF;
 SELECT coalesce(sum(amount),0) INTO used FROM points_reward_events WHERE user_id=pub.user_id AND event_day=day AND rule_code=code AND publication_id=pub_id;
 IF used+rule.amount>rule.publication_daily_limit THEN RETURN NULL; END IF;
 INSERT INTO points_reward_events(user_id,actor_id,publication_id,publication_revision,rule_code,rule_revision,rule_snapshot,source_id,amount,event_day,settle_after)
 VALUES(pub.user_id,actor,pub.id,pub.revision,code,rule.revision,to_jsonb(rule),source,rule.amount,day,clock_timestamp()+make_interval(hours=>rule.settlement_hours))
 RETURNING id INTO event_id;
 RETURN event_id;
END $$;
CREATE FUNCTION contribution_event_capture() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE first_id uuid;
BEGIN
 IF TG_TABLE_NAME='publications' THEN
  IF NEW.status='published' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
   INSERT INTO publication_first_approvals(publication_id,approved_at) VALUES(NEW.id,clock_timestamp()) ON CONFLICT DO NOTHING RETURNING publication_id INTO first_id;
   IF first_id IS NOT NULL THEN PERFORM capture_points_reward('publication_approved',NEW.id,NEW.user_id,NEW.id); END IF;
  END IF;
 ELSIF TG_TABLE_NAME='saved_items' THEN
  PERFORM capture_points_reward('valid_favorite',NEW.target_id,NEW.user_id,NEW.target_id);
 ELSIF NEW.status='accepted' AND OLD.status IS DISTINCT FROM NEW.status THEN
  PERFORM capture_points_reward('accepted_contact',NEW.publication_id,NEW.requester_id,NEW.id);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER publication_reward_capture AFTER INSERT OR UPDATE OF status ON publications FOR EACH ROW EXECUTE FUNCTION contribution_event_capture();
CREATE TRIGGER favorite_reward_capture AFTER INSERT ON saved_items FOR EACH ROW EXECUTE FUNCTION contribution_event_capture();
CREATE TRIGGER contact_reward_capture AFTER UPDATE OF status ON contact_requests FOR EACH ROW EXECUTE FUNCTION contribution_event_capture();
