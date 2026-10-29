# Transcript Intake, Extraction and UI Review

A review of how transcripts get into the BU Transfer Credit Portal (`2_Code/transfer-app`), uploaded or emailed, how they are read, how the student confirms what was read, and how the pages look. Each item covers how it works today, its limits, the recommended design, the files involved and the risks. The implementation that follows is on branch `feature/flexible-transcript-intake`.

---

## A. Current implementation

### Transcript reading (`backend/src/services/credit/transcript-parser.js`)
1. **Text extraction:** `pdfjs` reads the PDF's text layer and groups text into lines by vertical position, across all pages.
2. **Layout parser:** looks for a term heading ("Fall 2024"), then a table heading line, then course rows assigned to columns by x position.
   - Until this branch, the heading had to read exactly `COURSE TITLE ATTEMPTED EARNED GRADE QUALITY PTS`, and the institution came from a line "Course record from …". That is the layout of the repository's sample transcripts.
   - The previous fix on this branch accepts common heading variants ("Credits Att", "Course Title", "Units"…), the institution as the page title, and labels printed beside their values.
3. **Rows kept:** only rows whose grade is a US letter grade, W, P or I. Any other grade (CR, S, NC, IP, 85, 3.7) **drops the course silently**.
4. **AI fallback:** used only when the layout parser finds nothing **and** the Microsoft Foundry agent is configured. It sends the page text to Azure OpenAI and asks for JSON. It also drops rows with missing credits or other grades, and never returns identity.
5. **Not covered:**
   - **Scanned PDFs:** there is no text layer, so both paths get nothing.
   - **Images (JPG/PNG):** accepted for upload but never read.
   - **No OCR** anywhere.

### Upload flow (`/apply`)
1. Each file is read immediately (`POST /api/student/transcripts/read`); nothing is stored.
2. *Review & confirm* shows detected name, student ID, BU program and start term **read-only**. The course table is read-only.
3. Submit creates a draft and uploads each file; the server **reads the PDF again** and stores what it finds. Then the draft is submitted.
4. **Consequence:** even if the student could correct something, the server would store its own reading. Corrections have nowhere to go.

### Email intake: two paths, both body-driven
- **Gmail poller** (`gmail-poller.service.js`):
  - Extracts name, institution, program, term and GPA **from the email body** (AI or regex). If the body lacks institution and program, it **rejects the email** with a plain "information required" reply, even when a transcript is attached.
  - Creates a *submitted* application, **then** uploads PDF attachments. Evaluation starts in the background at creation, so it can run before any transcript exists (the race the website fixed with draft → upload → submit).
  - Only PDFs are kept; every PDF is treated as a transcript; the body is stored as a "personal statement".
- **Webhook** (`POST /api/intake/email`): parses the body with regex and **ignores attachments entirely**, recording only their filenames.

### Emails
Student status emails use one designed, email-safe template (`notifications/applicant-templates.js`):
- red BU header and Transfer Credit ID panel;
- status badge, action box and button;
- footer.

The email-intake rejection (`email.service.sendInfoRequiredEmail`) is a separate plain HTML block.

### UI
- **Landing and sign-in** have the brand treatment: red gradient hero, serif headings.
- **Public pages** (`/apply`, `/track`, `/apply/submitted`, `/self-check`): a plain white header on grey.
- **Staff pages:** flat grey background with white cards. Nine pages use `PageHeader`; detail pages build their own headers.
- **Images:** none are used anywhere.

---

## B. Problems in real-world use

| # | Situation | What happens today |
|---|---|---|
| 1 | Another university's headings ("Subject / Description / Units / Final Grade") | Fixed on this branch for common variants; an unusual heading set still reads nothing |
| 2 | No table heading at all (rows like `MATH 2110  Calculus II  4  B+`) | Nothing read |
| 3 | Terms written "2023 Fall", "Autumn 2023", "Semester 1 2023/24" | Not recognised as terms, so rows are ignored |
| 4 | Grades CR / NC / S / U / IP, or numeric (85, 3.7) | The course is **silently dropped**; a student loses a course from evaluation without anyone knowing |
| 5 | Multi-page transcript | Works when each page repeats a heading; continuation pages without one depend on the previous heading (works), a term spanning a page break works |
| 6 | Scanned PDF or photo of a transcript | Nothing read. The student is told it goes to manual review; the office is notified |
| 7 | Student spots a misread value | Cannot correct it; the evaluator sees the misread value |
| 8 | Email with a transcript and a short body ("Please find my transcript attached") | **Rejected**: the body lacks institution and program |
| 9 | Email body states different details from the transcript | The body wins |
| 10 | Email with a transcript as a JPG, or with a non-transcript PDF (cover letter) | JPG ignored; cover letter treated as a transcript |
| 11 | Email intake timing | Evaluation can start before the attachments are stored |

---

## C. Recommended design

**Keep the foundation:** text-layer reading, the layout parser, the AI fallback and the quality check are sound. Add one layer, a content-based reader, and route every source through the same pipeline.

### 1. Reading any transcript
Three readers are tried in order on the same text. The first that finds courses wins, and the method is recorded.

1. **Layout reader** (existing, extended): a table heading with recognised column names.
2. **Content reader** (new, deterministic, no AI): finds course rows by what they contain, regardless of headings or positions.
   - a course code (`ENG 101`, `CS-1800`, `MATH2110`, `CSCI-UA 101`);
   - a title;
   - credits (a number between 0.5 and 12);
   - a grade token.

   Terms are recognised in more forms: "Fall 2023", "2023 Fall", "Autumn 2023", "Spring Semester 2024", "Semester 1 2023". The institution comes from the page title; student details come from labels.
3. **AI document reader** (existing, extended): when configured, used for anything the first two can't read.
   - Text layouts go through the existing prompt, now keeping rows with missing credits or other grades.
   - **Images (JPG/PNG) and scanned PDFs** go to the same model as an image (vision).
   - Identity still never comes from the AI.

**All readers:**
- Keep any grade text. A grade the policy doesn't recognise is held for the evaluator (the engine already does this), never dropped.
- Report `method` (layout / content / ai / none) and whether the PDF has a text layer, so a scanned file is identified as such.

**Low confidence, missing or conflicting data:**
- Courses read by the content or AI reader get a note for staff ("read without a recognised table heading; check against the transcript").
- Missing credits and grades are already flagged by the quality check; conflicting header values across transcripts are already asked for.
- Unreadable files still reach the Credit Evaluation Office with the original attached.

### 2. Email intake: attachments only
- One shared service (`services/intake/email-intake.service.js`) is used by both the Gmail poller and the webhook. **The email body is never read.**
- **Steps:**
  1. Take the sender address (needed to reply and to track).
  2. Take the attachments (PDF, JPG, PNG) and read each one with the same pipeline as uploads.
  3. A file that yields courses is a transcript; others are kept as supporting documents.
  4. With no transcript at all, send a designed reply asking for the official transcript, with nothing created.
  5. Otherwise: name, student ID, BU program and start term come **from the transcripts**. Missing values are marked "to be confirmed" and the Credit Evaluation Office is told.
  6. Create a **draft**, upload the attachments, then **submit**. Same order as the website, so evaluation never runs before the transcripts exist.

### 3. Emails
- One refined layout for every student email:
  - a serif wordmark header;
  - a clear heading and the Transfer Credit ID panel;
  - a *What happens next* section;
  - details of the transcripts received (institution and course count);
  - the action box and button;
  - a footer naming the Credit Evaluation Office, with an automated-message note.
- The email-intake replies use the same layout.

### 4. Correcting extracted information
- **Student details:** name, student ID, BU program and start term become **editable fields**.
  - Each shows "✓ From your transcript" until changed, then "Edited · Restore".
  - The original values and the list of changed fields are kept in `applications.academic_history` (`extracted`, `corrected_fields`).
- **Courses:** each row (code, title, term, credits, grade) and each transcript's institution are editable, with the same indicator.
  - At upload the browser sends the reviewed rows. The server reads the PDF again (cached) and stores the student's values.
  - It keeps the **original reading** (`transcript_courses.extracted`) and **which fields changed** (`corrected_fields`).
  - Courses cannot be added or removed: the official transcript stays the source of truth.
- **Staff see every correction:** the evaluator's review page and the Credit Office page show "Corrected by the student: grade C → B+ (transcript: C)". The original PDF is never altered.

### 5. UI
- **Public pages:** a shared `PublicHero` replaces the plain header on Submit, Track, Submitted and Self-check. It uses the campus photo behind a brand-red gradient, so it is legible and consistent with the landing page.
- **Staff dashboards** (admin, evaluator, Credit Office): a welcome band with the same photo at low opacity behind a light gradient.
- **All staff pages:** a subtle warm gradient at the top of the page background, and a red accent on page titles through `PageHeader`.
- **Images:**
  - `about-bu-2022-hero-1200x500-1.jpg` (1200×500, subject on the right) is used for both treatments.
  - `images.jpg` (739×415) is too small for a banner without blurring and is **not used**.

---

## D. Implementation plan

| Area | Files |
|---|---|
| Readers | `credit/transcript-parser.js` (content reader, term forms, keep all grades, method, scanned detection, AI prompt and vision) |
| Pipeline | `credit/credit.service.js` (`readTranscript` / `importTranscript` with reviewed values and images), `document.service.js` (images go through the reader when AI is configured) |
| Data | migration `013_transcript_corrections.sql`: `transcript_courses.extracted JSONB`, `corrected_fields TEXT[]`; `application_documents.extraction JSONB` (method, pages, scanned) |
| Upload API | `controllers/student.controller.js` (`readTranscript` returns method and scanned; upload accepts one `reviewed` form field: JSON `{ institution, courses }`) |
| Email | new `services/intake/email-intake.service.js`; `gmail-poller.service.js` and `routes/intake.js` call it; `notifications/applicant-templates.js` (layout, next steps, transcripts summary, intake replies) |
| Staff visibility | `workflow/review.service.js` (`getReview`), `workflow/lifecycle.service.js` (`courseStates`), `routes/office.js`, `lib/staffFormat.js` (`correctionsOf`), `ReviewDetail.jsx`, `OfficeApplication.jsx` |
| Student review | `pages/applicant/TransferCreditApplication.jsx`, `api/student.js` |
| UI | new `components/layout/PublicHero.jsx`, `assets/campus-hero.jpg`; `PageHeader.jsx` (banner variant and title accent); dashboards; public pages |

---

## E. Risks

| Risk | Mitigation |
|---|---|
| The content reader picks up non-course lines (totals, GPA lines) | A row needs a course-code pattern at the start plus a grade or credits; totals and "Term:" lines have no course code. Checked against all 32 existing transcripts (output must stay byte-identical) and new layouts |
| Keeping all grades changes which courses reach the engine | Only rows previously dropped are added; their grades are held for the evaluator by the existing policy, never auto-credited |
| Students edit grades or credits | Every correction is stored with the original and shown to the evaluator and the office; the PDF is unchanged; courses can't be added or removed |
| Email intake no longer rejects body-only emails | A transcript is now required instead; a body without one gets the "please attach your transcript" reply |
| BU program unknown for an emailed transcript | Stored as "To be confirmed"; routing uses the course's own subject, not the major; the office is notified |
| Vision/AI paths | **Not exercised locally**: the Foundry agent is not configured. Code paths are guarded, so without AI the behaviour is today's (manual review) |
| Visual changes | Shared components and CSS only; no layout or behaviour changes; checked with the full page sweep |
| Migration 013 | Additive and idempotent; code tolerates its absence for reads |

---

## Implementation status

All four items are implemented on `feature/flexible-transcript-intake`.

**Reading any transcript.** Layout reader (heading aliases, wrapped rows, right-aligned columns), content reader for tables without headings, more term and grade forms, scanned-copy detection, and AI and vision reading when Foundry is configured. Every reading records its `method`, `pages` and `text_layer`.

**Email intake.** Only the attachments are read, never the body. The Gmail poller and the webhook share `ingestEmail`. An email without a transcript gets the "official transcript needed" reply and nothing is created. Otherwise a draft is created, the files are stored, then it is submitted. Details the transcripts did not show go to the office as "Details to confirm".

**Emails.** One shared BU layout: header, Transfer Credit ID panel, transcripts received, "What happens next", and a footer.

**UI.** Public pages (`/apply`, `/track`, `/self-check`, `/apply/submitted`) use the campus photo under a BU-red gradient. The admin, office and evaluator dashboards open with the same banner. Every other staff page title gets a red accent. `images.jpg` is not used because its resolution is too low.

**Corrections.**
- What the student can correct: the name, BU program and start term read from the transcript, and each course's code, title, term, credits and grade, plus the college name.
- Each value shows "From your transcript"; once edited it shows "Edited · Transcript shows … · Restore".
- What is stored: the corrected value for evaluation, the original reading in `transcript_courses.extracted`, and the changed fields in `corrected_fields`. Student-detail corrections go to `academic_history.extracted` and `corrected_fields`. The file is never changed.
- Who sees them: evaluators get a note on the course review; the office sees them on the course row and in the header.
- A scanned or unreadable transcript can still be submitted. The student enters only the college name, and the office reads the courses.

**Verified locally.**
- Parser regression: all 32 sample and test-case PDFs give unchanged results; the new layouts are read.
- `credit:eval` 76/76; scenarios 24/24; workflow 25 checks; API 12 checks.
- End-to-end:
  - email with a transcript and a supporting file: created; the body is ignored and the details come from the transcript;
  - email with no transcript: reply sent, nothing created;
  - upload with corrections: originals and corrected fields stored; extraction metadata stored.
- Page sweep, 75 pages: the 8 flagged pages are false positives, because a filter hint on the Credit Evaluations list contains the word "failed".

**Not verified.**
- The AI and vision readers, including scans and photos, were not run: Foundry is not configured here. Without it, scans go to manual review, as before.
- The webhook's 5 MB JSON limit caps the total attachment size per email.
- If a submission fails part-way, corrections made afterwards don't reach files that were already uploaded.

