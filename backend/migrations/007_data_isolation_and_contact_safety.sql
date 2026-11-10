-- Explicit development data isolation, contact blocking and retry identifiers.
ALTER TABLE publications ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE merchant_applications ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE verified_merchants ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE service_catalog ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE publications ADD COLUMN client_key varchar(64);
CREATE UNIQUE INDEX publication_request_key ON publications(user_id,client_key) WHERE client_key IS NOT NULL;
ALTER TABLE content_comments ADD COLUMN client_key varchar(64);
CREATE UNIQUE INDEX comment_request_key ON content_comments(user_id,client_key) WHERE client_key IS NOT NULL;
CREATE TABLE user_blocks (
 user_id uuid NOT NULL REFERENCES app_users(id), blocked_user_id uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,blocked_user_id),CHECK(user_id<>blocked_user_id)
);
CREATE FUNCTION inherit_development_marker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='verified_merchants' THEN SELECT is_test INTO NEW.is_test FROM merchant_applications WHERE id=NEW.application_id;
 ELSE IF NEW.merchant_id IS NOT NULL THEN SELECT is_test INTO NEW.is_test FROM verified_merchants WHERE id=NEW.merchant_id; END IF; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER merchant_development_marker BEFORE INSERT ON verified_merchants FOR EACH ROW EXECUTE FUNCTION inherit_development_marker();
CREATE TRIGGER service_development_marker BEFORE INSERT ON service_catalog FOR EACH ROW EXECUTE FUNCTION inherit_development_marker();
-- Precisely identify records created by our earlier acceptance scripts; preserve their data and titles.
UPDATE publications SET is_test=true WHERE title LIKE '本地验收闲置书桌%' AND description='本条为本地开发真实数据库验收记录，非真实商品。';
UPDATE merchant_applications SET is_test=true WHERE name LIKE '本地验收维修铺%' AND evidence_reference LIKE 'development-acceptance-only-%';
UPDATE verified_merchants m SET is_test=true FROM merchant_applications a WHERE m.application_id=a.id AND a.is_test;
UPDATE service_catalog s SET is_test=true FROM verified_merchants m WHERE s.merchant_id=m.id AND m.is_test;
CREATE FUNCTION report_result_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
 INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES(NEW.user_id,'举报处理结果','你的举报已处理：'||left(NEW.reviewer_note,300),'publication',NEW.target_id);
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER report_result_notification AFTER UPDATE OF status ON content_reports FOR EACH ROW EXECUTE FUNCTION report_result_notification();
