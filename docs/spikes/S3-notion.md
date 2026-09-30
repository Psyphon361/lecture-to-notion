# Spike S3 — Notion export

**Date:** Sep 30, 2026
**Connection:** internal API token already in `.env.local`. The token was not printed.
**Parent page:** `NOTION_PARENT_PAGE_ID` is unset. Search returned no pages, so the integration cannot see a parent yet. A throwaway page (heading, paragraph, list, attached image) and the live 101-child / 2,001-character rejection checks are waiting on a page shared with the connection.

| Check | Result |
|---|---|
| `GET /v1/users/me` with `Notion-Version: 2026-03-11` | 200, `object: user`, `type: bot` |
| `POST /v1/search` for pages | 200, 0 pages |
| `POST /v1/file_uploads` (`single_part`, `image/png`) | 200, `status: pending`, response field `in_trash: false` |
| `POST /v1/file_uploads/{id}/send` with a 1×1 PNG | 200, `status: uploaded`, `content_type: image/png` |
| Create page + attach image | not run; no shared parent |
| Reject 101 children in one append | not run; no shared parent |
| Reject one rich-text `content` of 2,001 characters | not run; no shared parent |

The version header `2026-03-11` was accepted on the user and file-upload calls. The exporter uses that header.

Chunk sizes in code follow the current request-limits page, not a live rejection: rich text `text.content` is 2,000 characters, and a block-children array is 100. Append uses `PATCH /v1/blocks/{id}/children` with `children` only. The `after` parameter is not sent; `2026-03-11` replaced it with `position`, and the default placement is the end of the parent.

Image bytes go to `POST /v1/file_uploads` then `POST /v1/file_uploads/{id}/send` as multipart field `file`. The page block uses `{ type: "file_upload", file_upload: { id } }`. An upload that is not attached expires after one hour. This spike uploaded a 1×1 PNG and did not attach it.

Do not send a full lecture until a shared parent exists and one throwaway page with a heading, a paragraph, a list, and one stored image succeeds.
