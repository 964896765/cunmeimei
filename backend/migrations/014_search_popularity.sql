-- Anonymous counts of allowlisted public search terms. No raw query, identity or IP.
CREATE TABLE search_popularity_daily (
 city_code varchar(6) NOT NULL CHECK (city_code ~ '^[0-9]{6}$'),
 term varchar(24) NOT NULL,
 day date NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date,
 searches integer NOT NULL DEFAULT 1 CHECK (searches > 0),
 PRIMARY KEY (city_code, term, day)
);
