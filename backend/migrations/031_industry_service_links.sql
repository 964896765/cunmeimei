CREATE TABLE industry_service_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entry_id uuid NOT NULL REFERENCES industry_entries(id),
 service_id uuid NOT NULL UNIQUE REFERENCES service_catalog(id),
 merchant_id uuid NOT NULL REFERENCES verified_merchants(id),
 owner_id uuid NOT NULL REFERENCES app_users(id),
 source_revision integer NOT NULL CHECK(source_revision>0),
 active boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX industry_service_current ON industry_service_links(entry_id) WHERE active;
CREATE VIEW industry_service_eligibility AS
 SELECT l.* FROM industry_service_links l
 JOIN industry_entries e ON e.id=l.entry_id AND e.user_id=l.owner_id
   AND e.revision=l.source_revision AND e.status='published'
   AND e.policy IN ('MERCHANT_SERVICE','LICENSED_PROVIDER')
 JOIN industry_public_eligibility ok ON ok.id=e.id
 JOIN publications p ON p.id=e.id AND p.status='published' AND (p.expires_at IS NULL OR p.expires_at>now())
 JOIN service_regions r ON r.name=p.district AND r.enabled
 JOIN verified_merchants m ON m.id=l.merchant_id AND m.status='active' AND m.district=p.district
 JOIN merchant_members mm ON mm.merchant_id=m.id AND mm.user_id=l.owner_id
   AND mm.status='active' AND mm.role IN ('owner','manager')
 WHERE l.active;
CREATE FUNCTION public_service_source_ok(sid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM industry_service_links WHERE service_id=sid)
   OR EXISTS(SELECT 1 FROM industry_service_eligibility WHERE service_id=sid);
$$;
CREATE FUNCTION protect_linked_booking_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE link industry_service_links;
BEGIN
 IF NEW.status NOT IN ('pending_confirm','confirmed') THEN RETURN NEW; END IF;
 SELECT * INTO link FROM industry_service_links WHERE service_id=NEW.service_id;
 IF NOT FOUND THEN RETURN NEW; END IF;
 -- Serialize new claims and confirmation with withdrawal, qualification and membership changes.
 PERFORM 1 FROM app_users WHERE id=link.owner_id FOR SHARE;
 PERFORM 1 FROM industry_entries WHERE id=link.entry_id FOR SHARE;
 PERFORM 1 FROM industry_service_links WHERE id=link.id FOR SHARE;
 PERFORM 1 FROM publications WHERE id=link.entry_id FOR SHARE;
 PERFORM 1 FROM industry_credentials c JOIN industry_entries e ON e.id=link.entry_id
   WHERE c.user_id=link.owner_id AND c.project_id=e.project_id FOR SHARE OF c;
 PERFORM 1 FROM verified_merchants WHERE id=link.merchant_id FOR SHARE;
 PERFORM 1 FROM merchant_members WHERE merchant_id=link.merchant_id AND user_id=link.owner_id FOR SHARE;
 PERFORM 1 FROM service_regions r JOIN publications p ON p.id=link.entry_id WHERE r.name=p.district FOR SHARE OF r;
 IF NOT public_service_source_ok(NEW.service_id) THEN
   RAISE EXCEPTION 'LINKED_SERVICE_UNAVAILABLE' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER linked_booking_source BEFORE INSERT OR UPDATE OF status ON booking_requests
 FOR EACH ROW EXECUTE FUNCTION protect_linked_booking_source();
