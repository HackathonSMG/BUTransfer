# Transfer Credit Portal: hackathon package (Problem 1, Boston University)

Everything the team needs to demo, rebuild and explain the solution.

| Folder | What's inside | How to use it |
|---|---|---|
| `1_Prototype/Transfer_Credit_Copilot.html` | The full clickable portal: Student, Evaluator and Admin workspaces, AI pre-evaluation with explainable recommendations, routing to Credit Evaluation and department evaluators, notifications, guided demo and self-validating test cases | Double-click to open in any browser. No install or internet needed (fonts fall back if offline) |
| `2_Code/transfer-copilot/backend` + `frontend` | **Production implementation (Transfer Credit Intelligence)**: Node.js/Express API on Supabase (Postgres + Auth + Storage). Unified role-first sign-in, transcript upload with a live AI processing timeline, AI extraction with per-field confidence, the versioned **equivalency knowledge base** that reuses earlier evaluator decisions, evaluator workflow, admin knowledge-base management. The guided demo's first scenario shows "every transcript makes the next one faster" | See `backend/README.md`: `npm install`, fill `.env`, `npm run db:migrate`, `npm run db:seed`, `npm run dev` → http://localhost:4000 |
| `2_Code/transfer-copilot/` | Python engine (rules, matcher, recommendations), Streamlit app, evaluation script, prototype export, transcript generator | See its `README.md`: `pip install -r requirements.txt`, `python evaluate.py`, `streamlit run app.py` |
| `3_Data/` | `BU_Synthetic_Transfer_Data.xlsx` plus the same tables as CSV/JSON: course catalog, equivalency database, past decisions, 11 students, 76 transcript rows with expected outcomes, syllabi, rules | Load into code or review in Excel |
| `4_Sample_Transcripts/` | 15 sample transcript PDFs, one per student per school | Clearly marked synthetic test documents, not official records |
| `5_Test_Cases/TEST_CASES.md` | Six end-to-end scenarios (TC-01 to TC-06) with data traceability, full Student → System → Evaluator → Decision → Student transcripts, and PASS results | Use to validate the demo or paste into the Team Response Template |

## Data sources

- **Worksheet:** the sponsor's `BU_Transfer_Program_Course_Match.xlsx` (BU, Northeastern and NYU courses, credits, programs and course-match levels).
- **Synthetic Data:** students, grades, terms, course descriptions, syllabi, past decisions, intake channels, and the two fictional schools (Riverside Community College, Pacific Coast State University).
- **System-generated:** match %, confidence and recommendations from the engine.

In the prototype, open the profile menu (top right) and click **Show data sources** to see the source of every field.

## How work is assigned (today's BU process)

1. The agent reads the transcript and evaluates every course.
2. The **Credit Evaluation Department** owns the request: it confirms approved equivalencies and rule-based rejections, and posts the final credit.
3. Courses with no approved equivalency go to the **department that owns the subject**, then to the evaluator whose **specialization** fits the target course; ties go to the **lightest workload** (e.g. CS 2700 → Dr. Smith, Data Structures; CS 3800 → Dr. Park, Systems/Theory).
4. Each evaluator only decides what is assigned to them; the student sees plain status and reasons, never the automation.

## Five-minute demo

1. Open the prototype. You start as **Dr. Michael Smith** (Computer Science) on the evaluator dashboard: metrics, charts and *My evaluation queue*.
2. Click **Guided demo** (top right) and run the scenarios in order. Each step switches role and evaluator for you:
   - high-confidence transfer;
   - low confidence → department review;
   - rejected course;
   - missing information;
   - override;
   - live paper-transcript intake.
3. Use the profile menu to switch between **Student / Evaluator / Admin**, or to view as another evaluator.
4. **Admin → Scenarios & validation** replays TC-01..TC-06; all show PASS.

## Engine results on this data

- Routing accuracy 76/76 (100%).
- Matcher on 40 ambiguous cases: right BU course first 68% of the time, in the top three 100%.
- 87% of courses need no review from scratch.

## Known limits

- Data is synthetic apart from the worksheet; descriptions are paraphrased.
- The confidence score is a heuristic and not calibrated.
- Transcript reading (OCR, extraction) is simulated in the prototype.
- The partial-credit rule (e.g. CHEM 1161 → CH 101 + 1 elective credit) is a demo assumption to confirm with BU.
- The Streamlit app has the earlier evaluator queue; the full workflow is in the HTML prototype.
- Evaluators, specializations, workloads and review-time figures are Synthetic Data.
