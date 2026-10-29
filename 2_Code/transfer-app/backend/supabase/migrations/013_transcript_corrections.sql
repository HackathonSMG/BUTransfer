-- Transcripts from any institution, and the student's corrections to what was read from them.
-- transcript_courses keeps the values used for evaluation (the student's confirmed values); the original reading
-- of the transcript is kept beside them, with the fields the student changed, so staff always see both. The
-- transcript file itself is never altered. application_documents records how each transcript was read.
-- Additive and idempotent.

ALTER TABLE transcript_courses ADD COLUMN IF NOT EXISTS extracted        JSONB;                       -- the original reading: code, title, term, credits, grade, institution
ALTER TABLE transcript_courses ADD COLUMN IF NOT EXISTS corrected_fields TEXT[] NOT NULL DEFAULT '{}'; -- fields the student changed, e.g. {grade}

ALTER TABLE application_documents ADD COLUMN IF NOT EXISTS extraction JSONB;   -- {method: layout|content|ai|none, pages, text_layer, courses}
