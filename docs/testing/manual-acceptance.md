# LinguaGraph — M0 Manual Acceptance Walkthrough (M0.7)

A human-executable walkthrough of the complete M0 manual alignment
workbench. Follow it top to bottom; every step states what you should see.
It is written to be usable without any chat history.

Duration: ~20–30 minutes. Environment: Windows (PowerShell) or any OS with
Node 24, uv, Docker and PostgreSQL 18 (see the root `README.md`).

## 0. Prerequisites and startup

1. Install/verify the ADR-009 baseline:

   ```text
   node --version     -> v24.x
   uv --version       -> any current uv
   docker --version   -> any current Docker (engine running)
   ```

2. Start the application. Windows (recommended):

   ```powershell
   .\scripts\dev.ps1
   ```

   Or manually:

   ```bash
   docker compose up -d postgres          # PostgreSQL 18 (wait until healthy)
   cd apps/api && cp .env.example .env    # only if apps/api/.env does not exist
   uv sync --frozen
   uv run alembic upgrade head
   uv run uvicorn app.main:app --reload   # API on http://localhost:8000
   # second terminal:
   cd apps/web && npm ci
   npm run dev                            # frontend on http://localhost:5173
   ```

3. Open <http://localhost:5173>. You land on `/projects` with the heading
   **Projects**.

## 1. Create a Project

1. In **Name**, type `Manual Acceptance`.
2. Click **Create project**.
3. Expected: the project appears in the list as a link.

## 2. Create a ParallelDocument

1. Click the `Manual Acceptance` link.
2. In **Title**, type `Chapter 1`.
3. Click **Create document**.
4. Expected: `Chapter 1` appears as a link.

## 3. Add EN / DE / FR / ES TextVersions

1. Click the `Chapter 1` link. You are on
   `/documents/<id>/workspace` with the heading **Workspace — Chapter 1**
   and an **Add text version** form.
2. Add four versions by pasting (Language tag / Label / Text):

   | Tag | Label | Text |
   |---|---|---|
   | `en` | English | `I look forward to seeing you tomorrow.` |
   | `de` | German | `Ich freue mich darauf, dich morgen zu sehen.` |
   | `fr` | French | `J’ai hâte de te voir demain.` |
   | `es` | Spanish | `Tengo ganas de verte mañana.` |

3. After each **Add version** click, a new panel opens showing the exact
   text. Expected: four side-by-side panels, each with a header showing the
   language tag and label, and a **✕** (Hide) control.

## 4. Panels: open / hide / reorder

1. Click **Hide Spanish panel** → the Spanish panel disappears; an **Open
   Spanish** button appears in the **Hidden:** row. Click it → the panel
   returns.
2. Use **Move English left/right** (← / → buttons in the panel controls) to
   reorder panels. Expected: panels visibly reorder.
3. Reload the page (F5). Expected: your open panels and their order are
   restored (per-document preference).

## 5. Native text selection and the pending tray

1. In the **English** panel, select the words `look forward to` with the
   mouse (drag) or Shift+arrows.
2. Expected below the panel: `Selected 2–17: “look forward to”`.
3. Click **Add to Alignment**. Expected: the **Alignment tray** shows one
   pending member `en — English: “look forward to”`; the selection status
   disappears.
4. In the **German** panel select `freue mich darauf` → expected
   `Selected 4–21: “freue mich darauf”` → **Add to Alignment**.
5. Try adding the same selection again. Expected: an alert
   `This selection is already in the tray.`
6. Select `look forward` (overlapping) and add it. Expected: an alert
   `This selection overlaps an existing pending selection in the tray.`
7. Use **Remove** on one tray member and re-add it; then **Clear tray**.
   Expected: `No pending selections.`
8. Press **Escape** after selecting text. Expected: the selection is
   cancelled (the tray is untouched).

## 6. Create a persisted AlignmentGroup

1. Stage three members: English `look forward to` [2,17), German
   `freue mich darauf` [4,21), French `ai hâte de` (select it in the
   French panel; the status shows its exact code-point offsets).
2. Expected: **Create Alignment** becomes enabled only when the tray holds
   ≥2 members from ≥2 different text versions.
3. Click **Create Alignment**. Expected: the tray clears, and **Saved
   alignments** shows one alignment with the three members
   (`en — English: “look forward to”`, `de — German: …`, `fr — French: …`).

## 7. Reload persistence

1. Reload the page (F5). Expected: the tray is empty (pending selections
   are ephemeral) but the saved alignment and all four panels are still
   there. The annotated text spans are marked with a light dotted
   underline (annotation indicator).

## 8. Hover / click persisted members — counterpart highlighting + connectors

1. Hover the English member text (`look forward to`). Expected: the German
   and French counterparts highlight (solid underline + tint) and thin
   connector lines appear between the members. Move the pointer away →
   temporary highlighting and connectors disappear.
2. Click the English member text. Expected: the highlighting and
   connectors stay (active state, outline cue), and the **Alignment
   inspector** opens.

## 9. Alignment Inspector

1. **Note update**: type a note (e.g. `Phrase-level correspondence`) in the
   Note textarea and click **Save note**. Expected: the note appears in
   Saved alignments and survives a reload.
2. **Member removal**: click **Remove member “ai hâte de”** → **Confirm
   remove**. Expected: the member disappears from the Inspector and from
   the French panel (annotation indicator gone); the alignment stays valid
   with EN + DE.
3. **Persistence after reload**: reload. Expected: the note and the member
   removal survive; the Inspector is closed until you activate again.
4. **AlignmentGroup deletion**: activate the alignment (click its member
   text), click **Delete Alignment** → **Confirm delete**. Expected: the
   Inspector closes, connectors disappear, and Saved alignments shows
   `No saved alignments yet.` All annotation indicators are gone.

## 10. Unicode manual scenario — `Café 🙂 mañana für français` (release blocker)

This scenario proves the code-point offset contract (ADR-001) end to end.

1. In **Add text version**, add a version with tag `mix`, label `Unicode`,
   text:

   ```text
   Café 🙂 mañana für français
   ```

2. Expected: the panel renders the exact canonical text (26 Unicode code
   points; the emoji is ONE code point but TWO UTF-16 units).

3. Select text with the mouse and verify the reported offsets:

   | Selection | Expected status text | Why |
   |---|---|---|
   | `Café` | `Selected 0–4` | before the emoji |
   | `Café 🙂` | `Selected 0–6` | ends right AFTER the emoji — a UTF-16 implementation would report 7 |
   | `🙂` | `Selected 5–6` | the emoji alone — UTF-16 would report a 2-unit span |
   | `🙂 mañana` | `Selected 5–13` | starts AT the emoji — UTF-16 would report 9 units |
   | `mañana` | `Selected 7–13` | ñ is one code point |
   | `für` | `Selected 14–17` | ü is one code point |
   | `français` | `Selected 18–26` | ends at the content end |
   | whole text | `Selected 0–26` | the authoritative 26-code-point vector |

4. Persist a Unicode alignment through the real UI: stage `Café 🙂` [0,6)
   and `mañana` [7,13) from the Unicode panel plus one English selection,
   then **Create Alignment**.

5. Verify the server-persisted coordinates at the API (the authoritative
   read model):

   ```bash
   # find your document id in the URL, then:
   curl http://localhost:8000/api/v1/documents/<document_id>/workspace
   ```

   Expected: the Unicode spans carry `start_offset`/`end_offset` **6 and
   13** (code points, not UTF-16 units) with server-derived
   `exact_text` `Café 🙂` and `mañana`.

6. Reload the page. Expected: the saved alignment persists; the Unicode
   runs `Café 🙂` and `mañana` show the annotation indicator.
7. Hover/click `Café 🙂`. Expected: the English counterpart highlights and
   connectors appear; the Inspector lists the members with their persisted
   offsets (`[0, 6)`, `[7, 13)`).

## 11. Optional: destructive TextVersion delete (ADR-005)

1. With an annotated version present, click **Delete <label>** in the
   panel controls. Expected: an alert-style dialog
   **Delete text version permanently?** warning that annotations and
   possibly invalidated alignment groups will be removed. **Cancel** does
   nothing; **Delete permanently** runs the destructive reset (this is the
   only path that removes annotated text).

## 12. Verification commands (green check)

From the repository root (Windows): `.\scripts\verify.ps1` runs the full
local verification (backend pytest with real PostgreSQL, Alembic
current/check, frontend lint/typecheck/test/build, Playwright golden path
+ Unicode release blocker) and exits non-zero on the first failure.
Manual equivalents are in the root `README.md`.
