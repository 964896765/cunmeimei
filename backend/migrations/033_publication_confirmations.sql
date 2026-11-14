-- New submissions retain the exact notice and accepted content. Historical consent is never inferred.
CREATE TABLE publication_confirmations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id),
 publication_id uuid NOT NULL,
 target_kind varchar(16) NOT NULL CHECK(target_kind IN ('publication','industry','service')),
 content_revision integer NOT NULL CHECK(content_revision > 0),
 notice_version varchar(64) NOT NULL,
 notice_hash char(64) NOT NULL,
 notice_content text NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 content_snapshot jsonb NOT NULL,
 content_hash char(64) NOT NULL,
 review_rule jsonb NOT NULL,
 UNIQUE(publication_id,target_kind,content_revision)
);
CREATE INDEX publication_confirmations_user ON publication_confirmations(user_id,confirmed_at DESC);

CREATE TABLE publication_status_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 publication_id uuid NOT NULL,
 target_kind varchar(16) NOT NULL,
 content_revision integer,
 previous_status varchar(30),
 status varchar(30) NOT NULL,
 reason text NOT NULL DEFAULT '',
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX publication_status_history_target ON publication_status_history(publication_id,recorded_at,id);

CREATE FUNCTION retain_publication_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status THEN
  INSERT INTO publication_status_history(publication_id,target_kind,content_revision,previous_status,status,reason)
  VALUES(NEW.id,CASE WHEN TG_TABLE_NAME='service_catalog' THEN 'service' ELSE 'publication' END,
   CASE WHEN TG_TABLE_NAME='publications' THEN (to_jsonb(NEW)->>'revision')::integer ELSE NULL END,
   CASE WHEN TG_OP='UPDATE' THEN OLD.status ELSE NULL END,NEW.status,
   coalesce(to_jsonb(NEW)->>'moderation_reason',''));
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER retain_publication_status AFTER INSERT OR UPDATE ON publications
 FOR EACH ROW EXECUTE FUNCTION retain_publication_status();
CREATE TRIGGER retain_service_status AFTER INSERT OR UPDATE ON service_catalog
 FOR EACH ROW EXECUTE FUNCTION retain_publication_status();

CREATE FUNCTION preserve_publication_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Publication confirmation and status records cannot be overwritten';
END;
$$;
CREATE TRIGGER preserve_publication_confirmation BEFORE UPDATE ON publication_confirmations
 FOR EACH ROW EXECUTE FUNCTION preserve_publication_record();
CREATE TRIGGER preserve_publication_status BEFORE UPDATE ON publication_status_history
 FOR EACH ROW EXECUTE FUNCTION preserve_publication_record();
