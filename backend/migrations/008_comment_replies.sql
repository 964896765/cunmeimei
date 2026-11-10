-- Threaded replies retain moderation and owner deletion semantics.
ALTER TABLE content_comments ADD COLUMN parent_id uuid REFERENCES content_comments(id);
ALTER TABLE content_comments ADD CONSTRAINT comment_parent_not_self CHECK(parent_id IS DISTINCT FROM id);
CREATE INDEX comments_parent ON content_comments(parent_id) WHERE parent_id IS NOT NULL;
