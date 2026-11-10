CREATE TABLE advertisers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),name text NOT NULL,
 evidence_reference text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','revoked')),
 valid_until timestamptz,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ad_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),placement text NOT NULL,region text NOT NULL REFERENCES service_regions(name),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 20),
 CHECK(ends_at>starts_at),UNIQUE(placement,region,starts_at,ends_at)
);
CREATE TABLE ad_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),advertiser_id uuid NOT NULL REFERENCES advertisers(id),
 title text NOT NULL,image_id uuid NOT NULL REFERENCES content_images(id),publication_id uuid NOT NULL REFERENCES publications(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','scheduled','paused','rejected','ended')),
 revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ad_reservations (
 campaign_id uuid PRIMARY KEY REFERENCES ad_campaigns(id),slot_id uuid NOT NULL REFERENCES ad_slots(id),
 points_entry_id uuid UNIQUE REFERENCES points_ledger(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ad_archive (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES ad_campaigns(id),
 action text NOT NULL,actor text NOT NULL,reason text NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER ad_archive_immutable BEFORE UPDATE OR DELETE ON ad_archive FOR EACH ROW EXECUTE FUNCTION immutable_financial_record();
CREATE INDEX ad_delivery_slot ON ad_slots(region,starts_at,ends_at);
