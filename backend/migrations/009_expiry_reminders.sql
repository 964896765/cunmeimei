-- A reminder belongs to one publication expiry cycle, including resubmission.
CREATE TABLE publication_expiry_reminders (
 publication_id uuid NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 stage text NOT NULL CHECK (stage IN ('expiring','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(publication_id,expires_at,stage)
);
CREATE INDEX publications_expiry_scan ON publications(expires_at,id)
 WHERE status='published' AND expires_at IS NOT NULL;
