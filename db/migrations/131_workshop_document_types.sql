-- 131: Add doc_type to workshop_documents so the Workshop UI can distinguish
-- general notes from Systems Map content (reinforcing-loop write-ups and
-- cross-turnaround cascade lists) without inventing a new table.
--
-- Convention for doc_type='systems_map_cascade' content: each cascade item is
-- a "### <Turnaround Name>" markdown heading followed by mechanism text: the
-- frontend splits on that heading to render individual cascade cards. Border
-- coloring per cascade item uses the existing (previously unpopulated)
-- workshop_documents.e4a_turnarounds column from migration 065.

ALTER TABLE workshop_documents
  ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'note'
    CHECK (doc_type IN ('note', 'systems_map_loop', 'systems_map_cascade'));

CREATE INDEX IF NOT EXISTS idx_workshop_documents_doc_type ON workshop_documents(workspace_id, doc_type);
