-- Keep tombstones so an old device cannot recreate a deleted draft at revision zero.
CREATE TABLE account_drafts (
 user_id uuid PRIMARY KEY REFERENCES app_users(id),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 payload jsonb,
 image_ids uuid[] NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_drafts_images ON account_drafts USING gin(image_ids);
