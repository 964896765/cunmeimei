CREATE TABLE benefit_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title varchar(80) NOT NULL,description text NOT NULL,terms text NOT NULL,
 points_cost integer NOT NULL CHECK(points_cost BETWEEN 1 AND 1000000),stock integer NOT NULL CHECK(stock>=0),
 enabled boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE benefit_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES app_users(id),offer_id uuid NOT NULL REFERENCES benefit_offers(id),
 client_key varchar(64) NOT NULL,request_hash text NOT NULL,snapshot jsonb NOT NULL,hold_id uuid NOT NULL UNIQUE REFERENCES points_holds(id),
 spend_id uuid UNIQUE REFERENCES points_ledger(id),status text NOT NULL CHECK(status IN ('pending','fulfilled','cancelled','rejected','expired')),
 fulfilment text NOT NULL DEFAULT '',response text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,client_key)
);
CREATE INDEX benefit_orders_queue ON benefit_orders(status,created_at);
CREATE TRIGGER active_benefit_owner BEFORE INSERT ON benefit_orders FOR EACH ROW EXECUTE FUNCTION require_active_record_owner();
ALTER TABLE advertisers ADD COLUMN client_key varchar(64);
CREATE UNIQUE INDEX advertiser_request_key ON advertisers(user_id,client_key) WHERE client_key IS NOT NULL;
ALTER TABLE ad_campaigns ADD COLUMN client_key varchar(64);
ALTER TABLE ad_campaigns ADD COLUMN request_hash text;
CREATE UNIQUE INDEX campaign_request_key ON ad_campaigns(user_id,client_key) WHERE client_key IS NOT NULL;
ALTER TABLE ad_slots ADD COLUMN city_code varchar(6) NOT NULL DEFAULT '';
ALTER TABLE ad_slots ADD COLUMN points_cost integer NOT NULL DEFAULT 100 CHECK(points_cost BETWEEN 1 AND 1000000);
ALTER TABLE ad_slots ADD COLUMN enabled boolean NOT NULL DEFAULT false;
ALTER TABLE ad_slots ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE ad_reservations ADD COLUMN price_snapshot integer;
