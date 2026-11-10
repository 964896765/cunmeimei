CREATE TABLE business_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_kind text NOT NULL CHECK(source_kind IN ('contact','booking')),
 source_id uuid NOT NULL,
 publication_id uuid REFERENCES publications(id),
 booking_id uuid REFERENCES booking_requests(id),
 project_id varchar(16),kind text NOT NULL CHECK(kind IN ('job','event','service','housing','exchange','merchant')),
 owner_id uuid NOT NULL REFERENCES app_users(id),applicant_id uuid NOT NULL REFERENCES app_users(id),
 snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','scheduled','completion_pending','completed','cancel_pending','cancelled','disputed','resolved')),
 scheduled_at timestamptz,proposed_at timestamptz,proposed_by uuid REFERENCES app_users(id),
 requested_by uuid REFERENCES app_users(id),previous_status text,
 resolution_outcome text CHECK(resolution_outcome IN ('completed','cancelled')),
 resolution text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_kind,source_id),CHECK(owner_id<>applicant_id),
 CHECK((source_kind='contact' AND publication_id IS NOT NULL AND booking_id IS NULL) OR (source_kind='booking' AND booking_id IS NOT NULL))
);
CREATE INDEX business_cases_owner ON business_cases(owner_id,updated_at DESC,id);
CREATE INDEX business_cases_applicant ON business_cases(applicant_id,updated_at DESC,id);
CREATE INDEX business_cases_disputes ON business_cases(status,updated_at) WHERE status='disputed';
CREATE TABLE business_case_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),case_id uuid NOT NULL REFERENCES business_cases(id),
 actor_id uuid REFERENCES app_users(id),actor_scope text NOT NULL,action text NOT NULL,
 client_key varchar(64) NOT NULL,request_hash text NOT NULL,
 body text NOT NULL DEFAULT '',detail jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(actor_scope,client_key)
);
CREATE INDEX business_case_events_history ON business_case_events(case_id,created_at,id);
CREATE UNIQUE INDEX business_case_one_feedback ON business_case_events(case_id,actor_id) WHERE action='feedback';
CREATE FUNCTION keep_business_case_events() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'business case events are append-only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER business_case_events_immutable BEFORE UPDATE OR DELETE ON business_case_events FOR EACH ROW EXECUTE FUNCTION keep_business_case_events();
