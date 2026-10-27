-- ============================================================
-- Migration 004: Storage Bucket for Application Documents
-- ============================================================
-- Private bucket used by src/utils/storage.js (STORAGE_BUCKET). The backend
-- accesses it with the service role key, so no storage policies are needed.

INSERT INTO storage.buckets (id, name, public)
VALUES ('transfer-documents', 'transfer-documents', false)
ON CONFLICT (id) DO NOTHING;
