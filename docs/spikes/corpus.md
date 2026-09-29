# Private deck corpus

**Date:** Sep 29, 2026
**Read:** from `fixtures/private/`, locally, in process. Not sent to Gemini. Not uploaded through the parse route.
**Contents:** counts only. Slide text is not recorded here.

Pictures are `p:pic` shapes on slides. Notes are notes parts, and each of those parts has body text. Native text means a non-blank text run on a slide.

| File | Bytes | Slides | Pictures | Tables | Notes | Native text |
|---|---:|---:|---:|---:|---:|---|
| 4.6 Transnational Organised Crime.pptx | 21142187 | 21 | 21 | 0 | 0 | no |
| 5.1 Victimology Meaning and Scope.pptx | 24066452 | 21 | 21 | 0 | 0 | no |
| 5.11 Judicial Trends in Victim Compensation.pptx | 13192046 | 14 | 14 | 0 | 0 | no |
| 5.8 Victimisation Meaning and Types.pptx | 19243104 | 21 | 21 | 0 | 0 | no |
| Juvenile_Justice_and_Child_Rights.pptx | 21622030 | 21 | 21 | 0 | 0 | no |
| child-conflict-need-meaning.pptx | 138840 | 35 | 0 | 2 | 35 | yes |
| sample.pptx | 946979 | 18 | 5 | 0 | 1 | yes |

The five picture decks are one PNG per slide and have no tables, notes, or native text. `child-conflict-need-meaning.pptx` has native text on all 35 slides, two tables, and no merged cells. `sample.pptx` has five picture shapes; other media in that package is not a picture shape (see `docs/spikes/S1-parser.md`).

`Juvenile_Justice_and_ChildRights.pptx` is the same file as `Juvenile_Justice_and_Child_Rights.pptx` (sha256 `441d26c65c95d1effca080baa6d240c4092be887d6b03726daebdcedf72c93ef`). The table lists one of them.

`Juvenile_Justice_and_Child_Rights.pptx.pdf` is 3137138 bytes and is a PDF. PDF support stays out of scope.

Not in this corpus: groups, connectors, charts, SmartArt, equations, EMF/WMF, or hidden slides.
