-- Only explicitly verified business locations; personal publications are excluded.
CREATE TABLE public_map_locations (
 item_id uuid PRIMARY KEY,
 kind varchar(16) NOT NULL CHECK (kind IN ('service','merchant')),
 category_id varchar(20) NOT NULL DEFAULT '',
 city_code varchar(6) NOT NULL CHECK (city_code ~ '^[0-9]{6}$'),
 district_code varchar(9) NOT NULL DEFAULT '' CHECK (district_code = '' OR district_code ~ '^[0-9]{6}([0-9]{3})?$'),
 latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
 precision varchar(24) NOT NULL CHECK (precision IN ('public_business','approximate')),
 approved boolean NOT NULL DEFAULT false,
 verification_note varchar(500) NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_map_city_bounds ON public_map_locations(city_code,latitude,longitude) WHERE approved;
