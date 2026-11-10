CREATE TABLE user_preferences (
 user_id uuid PRIMARY KEY REFERENCES app_users(id),
 theme varchar(16) NOT NULL DEFAULT 'prism' CHECK(theme IN ('prism','dark','clear','quiet','warm','gentle')),
 large_text boolean NOT NULL DEFAULT false,
 reduce_motion boolean NOT NULL DEFAULT false,
 notification_preview boolean NOT NULL DEFAULT true,
 allow_contacts boolean NOT NULL DEFAULT true,
 revision integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE privacy_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id),
 kind varchar(16) NOT NULL CHECK(kind IN ('access','correction','deletion')),
 reason varchar(500) NOT NULL,
 status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','responded','rejected','cancelled')),
 response varchar(800) NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX privacy_request_open ON privacy_requests(user_id,kind) WHERE status IN ('pending','reviewing');
CREATE INDEX privacy_request_queue ON privacy_requests(status,created_at);
