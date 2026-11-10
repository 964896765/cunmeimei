-- V0.6: site-operated regions and closed-by-default category configuration.
-- IMPORTANT: this migration does not infer a real city from placeholder demo names.
CREATE TABLE IF NOT EXISTS service_regions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name varchar(40) NOT NULL UNIQUE,
 enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_service_regions_enabled ON service_regions(enabled,name);
CREATE TABLE IF NOT EXISTS business_categories (
 id varchar(32) PRIMARY KEY,
 name varchar(40) NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 restricted boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO business_categories(id,name,enabled,restricted) VALUES
 ('merchant','本地商家',true,false),('job','招聘求职',false,true),
 ('housing','租房房产',true,false),('used','二手闲置',true,false),
 ('service','生活服务',true,false),('community','邻里社区',true,false)
ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS configuration_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 action varchar(48) NOT NULL,
 item_key varchar(80) NOT NULL,
 detail text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
