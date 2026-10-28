# QA: BU Transfer Credit Portal

Playwright tests for `2_Code/transfer-app`, tagged with the hackathon requirements R1–R10. After every deploy,
GitHub Actions runs them and the Foundry agent **bu-transfer-qa-analyst** writes the report.

## One-time setup
1. Move `foundry/qa-tests.yml` to `.github/workflows/qa-tests.yml`.
2. GitHub repo → Settings → Secrets and variables → Actions:
   - Secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (optional: `QA_ADMIN_EMAIL`/`QA_ADMIN_PASSWORD`, `QA_OFFICE_*`, `QA_EVALUATOR_*` test accounts)
   - Variables: `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_QA_AGENT_NAME` = `bu-transfer-qa-analyst`
3. Commit and push to `main`.

## Where to see the report
GitHub → **Actions → QA tests and report** → open a run → **Summary**. The full HTML report with screenshots is the
**playwright-report** artifact at the bottom (download, unzip, open `index.html`).
To run it without deploying: Actions → QA tests and report → **Run workflow**.

## Run locally (optional)
```
cd 2_Code\transfer-app\qa
npm install
npx playwright install chromium
copy .env.example .env
npx playwright test --ui
```

## Notes
- The Azure site is **Production**: CI runs read-only tests only. `ALLOW_SUBMIT=true` is refused on azurewebsites.net.
- `[BUG #n]` tests are known bugs. They fail until fixed and don't fail the build; new regressions do.
