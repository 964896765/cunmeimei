-- Additive product capabilities. Existing rows and migration history remain unchanged.
ALTER TABLE publications ADD COLUMN attributes jsonb NOT NULL DEFAULT '{}';
ALTER TABLE publications ADD COLUMN image_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE publications ADD COLUMN expires_at timestamptz;
CREATE TABLE content_images (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id),
 data bytea NOT NULL, thumbnail bytea NOT NULL, width integer NOT NULL, height integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(octet_length(data)<=2097152)
);
CREATE INDEX content_images_owner ON content_images(user_id,created_at);
CREATE TABLE saved_items (
 user_id uuid NOT NULL REFERENCES app_users(id), target_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,target_id)
);
CREATE TABLE user_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES app_users(id),
 title varchar(100) NOT NULL, body varchar(600) NOT NULL, target_kind varchar(30) NOT NULL,
 target_id uuid, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_inbox ON user_notifications(user_id,created_at DESC,id DESC);
CREATE TABLE contact_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_id uuid NOT NULL REFERENCES publications(id),
 requester_id uuid NOT NULL REFERENCES app_users(id), owner_id uuid NOT NULL REFERENCES app_users(id),
 message varchar(300) NOT NULL, response varchar(300) NOT NULL DEFAULT '',
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(requester_id<>owner_id)
);
CREATE UNIQUE INDEX contact_one_pending ON contact_requests(publication_id,requester_id) WHERE status='pending';
CREATE TABLE content_likes (
 user_id uuid NOT NULL REFERENCES app_users(id), publication_id uuid NOT NULL REFERENCES publications(id),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,publication_id)
);
CREATE TABLE content_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_id uuid NOT NULL REFERENCES publications(id),
 user_id uuid NOT NULL REFERENCES app_users(id), body varchar(500) NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected','deleted')),
 moderation_reason varchar(300) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX comments_publication ON content_comments(publication_id,status,created_at);
-- Actual business events create inbox messages atomically with state transitions.
CREATE FUNCTION product_state_notification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE label text; merchant uuid;
BEGIN
 IF TG_OP='UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 label:=CASE NEW.status WHEN 'published' THEN '审核通过，已公开展示' WHEN 'rejected' THEN '审核未通过，请查看原因'
 WHEN 'approved' THEN '入驻审核通过' WHEN 'in_review' THEN '已收到资料，等待核验' WHEN 'needs_documents' THEN '请补充核验资料'
 WHEN 'pending_confirm' THEN '预约已提交，等待确认' WHEN 'confirmed' THEN '预约已确认' WHEN 'completed' THEN '服务已完成'
 WHEN 'cancelled' THEN '预约已取消' WHEN 'declined' THEN '商家未接受本次预约' WHEN 'expired' THEN '预约等待超时'
 WHEN 'closed' THEN '信息已结束展示' ELSE '信息已更新，请查看详情' END;
 IF TG_TABLE_NAME='publications' THEN
  IF TG_OP='UPDATE' THEN INSERT INTO user_notifications(user_id,title,body,target_kind,target_id)
  VALUES(NEW.user_id,'发布状态更新',label || CASE WHEN NEW.moderation_reason<>'' THEN '：'||left(NEW.moderation_reason,200) ELSE '' END,'publication',NEW.id); END IF;
 ELSIF TG_TABLE_NAME='merchant_applications' THEN
  INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES(NEW.user_id,'商家申请动态',label,'merchant',NEW.id);
 ELSE
  INSERT INTO user_notifications(user_id,title,body,target_kind,target_id) VALUES(NEW.user_id,'预约动态',label,'booking',NEW.id);
  SELECT merchant_id INTO merchant FROM service_catalog WHERE id=NEW.service_id;
  INSERT INTO user_notifications(user_id,title,body,target_kind,target_id)
   SELECT DISTINCT user_id,'门店预约动态',label,'merchant-booking',merchant FROM merchant_members
    WHERE merchant_id=merchant AND status='active' AND user_id<>NEW.user_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER publication_notification AFTER UPDATE OF status ON publications FOR EACH ROW EXECUTE FUNCTION product_state_notification();
CREATE TRIGGER application_notification AFTER INSERT OR UPDATE OF status ON merchant_applications FOR EACH ROW EXECUTE FUNCTION product_state_notification();
CREATE TRIGGER booking_notification AFTER INSERT OR UPDATE OF status ON booking_requests FOR EACH ROW EXECUTE FUNCTION product_state_notification();
