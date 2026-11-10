ALTER TABLE booking_requests
 ADD COLUMN system_cancellation_reason varchar(80) NOT NULL DEFAULT ''
 CHECK (system_cancellation_reason IN ('', 'industry_source_unavailable'));
