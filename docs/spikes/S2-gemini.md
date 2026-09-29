# Spike S2 — Gemini image analysis

**Date:** Sep 29, 2026
**Image:** `fixtures/s2-planted-token.png` only. The private lecture deck was not sent.
**Prompt:** `image-analysis-v1`

| Check | Result |
|---|---|
| Model id | `gemini-3.5-flash-lite` |
| Schema parsed | yes |
| Planted token `BBALLB-203` unchanged in extractedText | yes |
| Planted spelling `recieve` unchanged in extractedText | yes |
| Input tokens | 1171 |
| Output tokens | 79 |
| Latency | 2119 ms |
| containsUsefulInformation | true |
| kind | text |

Extracted text from the synthetic image:

```
Course code BBALLB-203

Odd spelling: recieve
```

Default model in code is `gemini-3.5-flash-lite` unless `GEMINI_MODEL` is set. On Sep 29, 2026 the models page (updated 2026-09-24) recommends 3.5 Flash-Lite or 3.8 Flash for new projects. `gemini-3.8-flash` returned 503 high demand for this image. `gemini-3.7-flash` and `gemini-3.6-flash` did not return a valid analysis in the same session. `gemini-3.5-flash-lite` is listed with a free tier on the pricing page (content may be used to improve Google products) and accepted the image with structured output.

This script is manual. `npm test` does not call Google.
