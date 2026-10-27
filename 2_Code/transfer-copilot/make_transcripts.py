"""Generate a clearly labelled SAMPLE transcript PDF for every student and institution.

Run:  python make_transcripts.py out_dir
These are synthetic test documents, not official records: they carry no seal, no registrar
signature and a visible "Synthetic test data" watermark.
"""
import sys, math
from pathlib import Path
from collections import defaultdict
import pandas as pd
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, Color

D = Path(__file__).parent / "data"
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "transcripts"); OUT.mkdir(parents=True, exist_ok=True)
WS = {"Northeastern University", "New York University"}
GP = {'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 'C+': 2.3, 'C': 2.0, 'C-': 1.7, 'D+': 1.3, 'D': 1.0, 'F': 0.0}
TERM_ORDER = {"Winter": 0, "Spring": 1, "Summer": 2, "Fall": 3}
INK, MUTED, RULE, ACC = HexColor('#1d2027'), HexColor('#5f636d'), HexColor('#c9c8c0'), HexColor('#8a2433')
GREEN, SYN = HexColor('#1f7a4d'), HexColor('#8a2433')

students = pd.read_csv(D / "students.csv").fillna("")
tr = pd.read_csv(D / "transcripts.csv").fillna("")
term_key = lambda t: (int(t.split()[-1]), TERM_ORDER.get(t.split()[0], 9))


def tag(c, x, y, text, color):
    w = c.stringWidth(text, "Helvetica-Bold", 6.5) + 8
    c.setStrokeColor(color); c.setFillColor(color); c.roundRect(x, y - 2, w, 10, 2, stroke=1, fill=0)
    c.setFont("Helvetica-Bold", 6.5); c.drawString(x + 4, y + 0.5, text)
    return w


made = []
for st in students.to_dict("records"):
    rows = tr[tr.student_id == st["student_id"]]
    for inst, g in rows.groupby("institution", sort=False):
        quarter = (g.credit_system == "Quarter").any()
        unit = "quarter units" if quarter else "semester hours"
        name = st["name"].replace(" (synthetic)", "")
        fn = f"Transcript_{st['student_id']}_{name.replace(' ', '_')}_{inst.replace(' ', '_')}.pdf"
        c = canvas.Canvas(str(OUT / fn), pagesize=letter); W, H = letter
        c.setTitle(f"SAMPLE transcript (synthetic) - {name} - {inst}")
        c.saveState(); c.setFillColor(Color(0.54, 0.14, 0.2, alpha=0.07)); c.setFont("Helvetica-Bold", 50)
        c.translate(W / 2, H / 2); c.rotate(35); c.drawCentredString(0, 20, "SYNTHETIC TEST DATA"); c.drawCentredString(0, -45, "NOT AN OFFICIAL RECORD"); c.restoreState()
        # header (neutral, no institutional branding)
        c.setFillColor(HexColor('#eeeee9')); c.rect(0, H - 84, W, 84, fill=1, stroke=0)
        c.setFillColor(ACC); c.setFont("Helvetica-Bold", 8); c.drawString(40, H - 28, "SAMPLE TRANSCRIPT · SYNTHETIC TEST DATA · FDE AI HACKATHON 5.0")
        c.setFillColor(INK); c.setFont("Times-Bold", 18); c.drawString(40, H - 50, f"Course record from {inst}")
        c.setFont("Helvetica", 8.5); c.setFillColor(MUTED)
        c.drawString(40, H - 66, f"Prepared for: Boston University transfer-credit evaluation (test case)   ·   Calendar: {'Quarter' if quarter else 'Semester'} system, credits in {unit}")
        c.drawString(40, H - 78, "Not issued by the institution named above. No seal, no signature; for testing the Transfer Credit Co-pilot prototype only.")
        # student block
        y = H - 110
        fields = [("STUDENT", name, "Synthetic"), ("STUDENT ID (TEST)", st["student_id"], "Synthetic"),
                  ("INSTITUTION", inst, "Worksheet" if inst in WS else "Synthetic"),
                  ("INTENDED BU MAJOR", st["intended_major"], "Worksheet"), ("BU START", st["bu_start_term"], "Synthetic")]
        for i, (k, v, src) in enumerate(fields):
            x = 40 + (i % 3) * 180; yy = y - (i // 3) * 30
            c.setFont("Helvetica-Bold", 7); c.setFillColor(MUTED); c.drawString(x, yy, k)
            c.setFont("Helvetica", 9.5); c.setFillColor(INK); c.drawString(x, yy - 12, v)
            tag(c, x + c.stringWidth(v, "Helvetica", 9.5) + 5, yy - 12, src.upper(), GREEN if src == "Worksheet" else SYN)
        y -= 72
        cols = dict(code=40, title=108, att=375, earn=430, grade=455, qp=530)
        cum_e = cum_qp = cum_g = 0
        terms = defaultdict(list)
        for r in g.to_dict("records"): terms[r["term"]].append(r)
        for term in sorted(terms, key=term_key):
            c.setStrokeColor(RULE); c.line(40, y + 4, W - 40, y + 4)
            c.setFont("Helvetica-Bold", 10); c.setFillColor(INK); c.drawString(40, y - 10, term); y -= 25
            c.setFont("Helvetica-Bold", 7); c.setFillColor(MUTED)
            c.drawString(cols["code"], y, "COURSE"); c.drawString(cols["title"], y, "TITLE")
            c.drawRightString(cols["att"], y, "ATTEMPTED"); c.drawRightString(cols["earn"] + 10, y, "EARNED")
            c.drawString(cols["grade"] + 10, y, "GRADE"); c.drawRightString(cols["qp"] + 40, y, "QUALITY PTS"); y -= 14
            te = tq = tg = 0
            for r in terms[term]:
                cr = float(r["source_credits"]); grade = r["grade"]
                earned = 0 if grade in ("W", "F") or grade not in GP and grade != "P" else cr
                if grade in GP and GP[grade] < 1.0: earned = 0
                qp = GP[grade] * cr if grade in GP else 0
                c.setFont("Courier", 9); c.setFillColor(INK); c.drawString(cols["code"], y, r["course"])
                c.setFont("Helvetica", 9); c.drawString(cols["title"], y, r["title"][:46])
                c.drawRightString(cols["att"], y, f"{cr:.2f}"); c.drawRightString(cols["earn"] + 10, y, f"{earned:.2f}")
                c.setFont("Helvetica-Bold", 9); c.drawString(cols["grade"] + 10, y, grade)
                c.setFont("Helvetica", 9); c.drawRightString(cols["qp"] + 40, y, f"{qp:.2f}" if grade in GP else "—")
                y -= 15
                te += earned; tq += qp; tg += cr if grade in GP else 0
            cum_e += te; cum_qp += tq; cum_g += tg
            c.setFont("Helvetica", 8); c.setFillColor(MUTED)
            c.drawString(cols["title"], y - 2, f"Term: earned {te:.2f} · GPA {tq / tg if tg else 0:.2f}      Cumulative: earned {cum_e:.2f} · GPA {cum_qp / cum_g if cum_g else 0:.2f}")
            y -= 24
        c.setStrokeColor(INK); c.setLineWidth(1.2); c.line(40, y + 6, W - 40, y + 6); c.setLineWidth(1)
        c.setFont("Helvetica-Bold", 10); c.setFillColor(INK)
        c.drawString(40, y - 10, f"TOTAL EARNED: {cum_e:.2f} {unit}"); c.drawRightString(W - 40, y - 10, f"CUMULATIVE GPA: {cum_qp / cum_g if cum_g else 0:.2f}")
        # data sources box
        y -= 40
        c.setFont("Helvetica-Bold", 7.5); c.setFillColor(MUTED); c.drawString(40, y, "WHERE THIS DATA COMES FROM"); y -= 13
        c.setFont("Helvetica", 8); c.setFillColor(INK)
        src_line = ("Course codes, titles and credits: sponsor worksheet (BU_Transfer_Program_Course_Match.xlsx)." if inst in WS
                    else "Institution, course codes, titles and credits: Synthetic Data (fictional school).")
        for line in [src_line, "Student, student ID, terms and grades: Synthetic Data written for the hackathon test cases.",
                     f"Matches the Transcripts sheet of BU_Synthetic_Transfer_Data.xlsx (rows {g.row_id.iloc[0]}–{g.row_id.iloc[-1]})."]:
            c.drawString(40, y, line); y -= 11
        c.setStrokeColor(RULE); c.line(40, 70, W - 40, 70)
        c.setFont("Helvetica", 7.5); c.setFillColor(MUTED)
        c.drawString(40, 58, "Grading key: A 4.0 · A- 3.7 · B+ 3.3 · B 3.0 · B- 2.7 · C+ 2.3 · C 2.0 · C- 1.7 · D 1.0 · F 0.0 · W withdrawn (no credit, not in GPA)")
        c.setFillColor(ACC); c.setFont("Helvetica-Bold", 7.5)
        c.drawString(40, 42, "SYNTHETIC TEST DOCUMENT · not issued by any institution · not a real academic record"); c.drawRightString(W - 40, 42, "Page 1 of 1")
        c.save(); made.append(fn)
print(len(made), "transcripts"); print("\n".join(made))
