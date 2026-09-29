import type { NoteDocument } from "@/lib/documents/schema";

export interface NotionExportRequest {
  document: NoteDocument;
  parentPageId: string;
}

export interface NotionExportResult {
  pageUrl: string;
}

/**
 * NoteDocument -> Notion blocks. Not implemented.
 * Export work waits until the Phase 6 quality checkpoint passes.
 */
export function exportNoteDocument(
  request: NotionExportRequest,
): Promise<NotionExportResult> {
  void request.document;
  return Promise.reject(
    new Error("Notion export is not implemented until Phase 7."),
  );
}
