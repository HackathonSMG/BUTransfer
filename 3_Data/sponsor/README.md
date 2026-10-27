# Sponsor course data

`BU_Transfer_Program_Course_Match.xlsx` is the sponsor's workbook, unchanged. `BU_Transfer_Program_Course_Match.json` is the same data converted once to JSON so the backend can import it without a spreadsheet library. Each record keeps `source_record_id` as `<sheet>!R<row>`, so any row in the database can be traced back to the workbook.

## What the workbook contains

| Sheet | Rows | Used for |
|---|---|---|
| BU Courses, Northeastern Courses, NYU Courses | 41, 38, 38 | `catalog_courses`: code, title, program, requirement type, credits, verified flag, notes, source URL |
| Course Match | 42 BU courses, giving 73 BU ↔ peer pairs | `sponsor_course_matches`: the recommended BU target and match level for a peer course |
| Programs | 5 | Not imported. Program-level rules for reference |

Match levels: *Likely equivalent*, *Partial - syllabus review*, *No equivalent found* (no pair is stored) and *Must be taken at BU*. The workbook says these are a starting point, not official equivalencies, so the app uses them as the recommendation an evaluator reviews and never to approve credit on its own.

The workbook has no course descriptions or learning outcomes. Those come from the synthetic data in `../BU_Synthetic_Transfer_Data_csv`, and the `description_source` column marks them as synthetic.

## Provenance

Every reference row carries an internal `data_source` that is never shown in the UI:

- `sponsor`: imported from this workbook (`source_file`, `source_record_id`, `imported_at` say exactly where from)
- `synthetic`: written for the hackathon (the 3_Data CSVs, fictional schools, students, evaluators, demo applications)
- `user`: created in the app (real submissions, evaluator decisions, admin-added evaluators)

Precedence: sponsor values win for the fields the sponsor supplies. Re-running the synthetic seed never overwrites a sponsor row's code, title, program or credits.

## Loading it

From `2_Code/transfer-app/backend`, with the `.env` pointing at the database:

```
npm run db:migrate          # applies 001–008; safe to re-run
npm run db:seed:credit      # synthetic catalog descriptions, equivalencies, past decisions, rules
npm run db:import:sponsor   # this workbook → catalog_courses + sponsor_course_matches (data_source = sponsor)
npm run db:seed:workflow    # demo evaluators + scenario applications (synthetic), then assigns every evaluated application
```

`db:import:sponsor` prints any synthetic approved equivalency that disagrees with the sponsor's matches.
