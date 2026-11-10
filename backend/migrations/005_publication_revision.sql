-- V0.11: user-editable publications with revision checks and re-moderation.
-- Preserve the immutable 001-004 migration history and all existing data.
ALTER TABLE publications
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE publications
  ADD CONSTRAINT publications_revision_positive CHECK (revision >= 1);
