# Transfer Credit Co-pilot (BU hackathon, Problem 1)

The tool routes every transfer course down the right path, drafts the evaluator's decision
for the "maybe" courses, and shows students live progress instead of zero units.
**Departments make the final decision**: the engine only suggests.

```
transcript ─► rules ─► equivalency lookup ─► precedent ─► AI match ─► evaluator queue ─► write-back
```

## Production implementation (Node.js + Supabase)

The deployable version lives in `backend/` (Express API, Supabase Postgres + Auth, migrations, seed, tests) and `frontend/` (the portal UI, now driven entirely by the API). Start with **`backend/README.md`**:

```bash
cd backend && npm install
cp .env.example .env            # add SUPABASE_SERVICE_ROLE_KEY and DATABASE_URL
npm run db:migrate && npm run db:seed
npm run dev                     # http://localhost:4000
```

The Python engine in `engine/` remains the reference implementation (`npm run engine:check` compares the two). `prototype/` remains the offline, no-install demo.

## Run it (Python reference engine)

```bash
pip install -r requirements.txt
python evaluate.py        # scores the engine against the answer key
streamlit run app.py      # opens the Student / Evaluator / Admin screens
```

Optional upgrades:

```bash
export ANTHROPIC_API_KEY=...   # the LLM drafts a rationale for each "maybe" course
export USE_EMBEDDINGS=1        # semantic embeddings in place of TF-IDF (pip install sentence-transformers)
```

## Build it step by step

| Step | File | What you build | Done when |
|---|---|---|---|
| 1. Load data | `engine/data.py` | Load the CSVs in `data/` into a `Store` with lookups for course, equivalency, precedent and syllabus | `Store().course("Northeastern University","CS 2000")` returns a row |
| 2. Rules | `engine/rules.py` | Grade ≥ C, quarter credits × 2/3, BU-only Group C courses, Economics 200+ cap, substitutions | `bu_credits(4,"Quarter") == 2.66` |
| 3. Matcher | `engine/matcher.py` | TF-IDF over title + description + outcomes (+ syllabus). Returns the top-3 BU courses with a score and the topics they share and miss | The right course is in the top-3 for every "maybe" case |
| 4. LLM reviewer | `engine/llm.py` | A prompt with the candidates and similar past decisions, returning JSON: recommendation, confidence, rationale | Returns valid JSON for CSC 220 |
| 5. Pipeline | `engine/pipeline.py` | Order: grade rule → equivalency DB → BU-only rule → precedent → AI match, then the Economics cap across the transcript | Every course gets a path and a status |
| 6. Prove it | `evaluate.py` | Routing accuracy, top-1/top-3 matching accuracy, % resolved without a from-scratch review | The numbers print |
| 7. Feedback loop | `Store.add_equivalency` | Each evaluator approval becomes a new equivalency row | The same course auto-applies for the next student |
| 8. UI | `app.py` | Student progress, evaluator queue (approve / change / no credit), admin metrics | The demo script below runs end to end |
| 9. Explainable recommendations | `engine/recommend.py` | Match % from weighted criteria (content 50%, credit hours 20%, level 15%, worksheet match level 15%), confidence, recommendation (Accept / Elective / Partial credit / Reject / Needs info), exceptions, and the data source of every field | Every course shows *why* |
| 10. Prototype data | `export_prototype.py` | Exports students, results, recommendations and provenance as JSON; `prototype/template.html` replaces `__DATA__` with it | `python export_prototype.py data.json` |

## Current results on the synthetic data

- Routing accuracy: **76/76 (100%)**
- Matcher on 40 "maybe" cases: **top-1 68%, top-3 100%**. This is why the evaluator picks from a short list rather than the engine auto-deciding.
- Courses resolved without a from-scratch review: **87%**

## Demo script (about 5 minutes)

Open `prototype/Transfer_Credit_Copilot.html` in a browser. Use the profile menu (top right) to switch between Student, Evaluator and Admin, and to sign in as a different evaluator. Click **Guided demo** to run the six scenarios step by step:

1. **High-confidence transfer** (Ethan Brooks): every course matches an approved equivalency; Credit Evaluation confirms all and completes.
2. **Low confidence → department review** (Daniel Kim): ambiguous CS courses are routed to Dr. Smith (Algorithms / Data Structures) and Dr. Park (Systems / Theory); each confirms, then Credit Evaluation completes.
3. **Rejected course** (Priya Shah): BIOL-UA 11 rejected (grade D) with the reason shown to the student.
4. **Missing information** (Omar Haddad): Dr. Menon requests the syllabus, Omar uploads it, the course is re-scored and confirmed.
5. **Override** (Grace Liu): Dr. Morgan overrides EC 204 to an economics elective with a recorded reason.
6. **Live intake** (Noah Patel): a scanned paper transcript is read by the agent and assigned automatically.

*Admin → Scenarios & validation* replays TC-01..TC-06 with transcripts and PASS checks.

## How evaluations are assigned (mirrors today's process at BU)

1. **Credit Evaluation Department (CED)** owns every request (balanced across two specialists). It applies courses already in the equivalency database, confirms rule-based rejections and posts the final credit.
2. **Agent pre-evaluation** reads the transcript (portal, e-transcript or scanned paper), scores each course and explains the recommendation.
3. Courses with no approved equivalency go to the **academic department that owns the subject**, then to the evaluator whose **specialization** fits the target course; ties go to the **lightest workload**.
4. Only the assigned evaluator can decide a course; only the CED owner can complete the request. The student is notified at each step, without seeing any automation or rules.

Evaluators, specializations and workloads are Synthetic Data.

## Evaluator workspace

- **Dashboard** (for the signed-in evaluator only):
  - total evaluations, this season, evaluated today (vs the previous working day) and pending;
  - a 14-day activity chart, average review time and season completion;
  - a "My queue" breakdown by priority, missing information and confidence band.
  - Historical counts are Synthetic Data, marked "Demo data". Decisions made in the session are added live.
- **My evaluations:** every row opens the case, focused on that course. Click anywhere on the row, or press Enter.
- **Case page:**
  - a summary with counts, credits and overall confidence/risk;
  - "What needs your attention?";
  - a side-by-side course comparison with a comparison table;
  - the recommended decision with "Why?";
  - an evidence panel and similar past evaluations (Synthetic Data);
  - evaluation history.
- **Decisions:**
  - Rejecting a course the AI recommended asks for a reason, which is logged for audit.
  - After you finish your part of a case, the next case opens automatically.
- **Confidence bands are guidance only:** High is 90–100%, Medium is 70–89% and Low is below 70%.
- **Keyboard shortcuts:**
  - J / K move between courses that need attention.
  - A confirms, R rejects, I requests information and O overrides.
  - ] / [ go to the next or previous case.
  - ? lists the shortcuts.

## Honest limits (put these in your write-up)

- The data is synthetic, and the course descriptions are paraphrased.
- The confidence score is a heuristic and is not calibrated.
- Real transcripts are PDFs. Parsing them is a stretch goal (use an LLM with structured output).
- Evaluator time and turnaround figures need to be confirmed with the sponsor.

## Data sources

| Source | What it covers |
|---|---|
| **Worksheet** (`BU_Transfer_Program_Course_Match.xlsx`, extracted to `data/worksheet_*.csv`) | BU, Northeastern and NYU course codes, titles, credits; programs; Course Match levels. "Likely equivalent" rows seed the equivalency database |
| **Synthetic Data** | Students, grades, terms, course descriptions, syllabi, past decisions, and the two fictional schools (Riverside CC, Pacific Coast State) |
| **System-generated** | Match %, confidence, recommendations |

## Test cases (validated in the prototype's Test cases tab)

| ID | Scenario | Student | Expected |
|---|---|---|---|
| TC-01 | Fully successful transfer | Ethan Brooks (NYU → Economics) | Completed, 24 cr accepted |
| TC-02 | Evaluator confirmation required | Daniel Kim (Northeastern → CS) | Completed, 31 cr accepted, 4 cr rejected |
| TC-03 | Rejected course | Priya Shah (NYU → Psychology) | Completed, BIOL-UA 11 rejected (grade D) |
| TC-04 | Partial credit | Sofia Martinez (Northeastern → Biology) | CHEM 1161 → CAS CH 101 + 1 cr elective |
| TC-05 | Missing information | Omar Haddad (NYU → Mathematics) | Syllabus requested, uploaded, re-scored, confirmed as Math elective |
| TC-06 | Evaluator override | Grace Liu (Northeastern → Economics) | System says EC 204; evaluator overrides to Econ elective with a reason |

Note: the Streamlit app (`app.py`) still has the earlier course-queue evaluator; the portal (roles, routing, notifications, guided demo) lives in the HTML prototype. The full workflow (agent intake, evaluation workspace, student portal, test cases) lives in the HTML prototype. Regenerate it with `python export_prototype.py data.json` and replace `__DATA__` in `prototype/template.html`.
