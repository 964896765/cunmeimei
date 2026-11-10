-- Business evidence for a specific publication is valid only for the reviewed revision.
ALTER TABLE qualification_checks ADD COLUMN publication_revision integer CHECK(publication_revision IS NULL OR publication_revision>=1);
