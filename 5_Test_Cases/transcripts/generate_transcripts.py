"""
Generates the synthetic test transcripts for TRANSFER_CREDIT_TEST_SCENARIOS.md.

Each transcript uses the hackathon sample layout that the portal's transcript reader parses
("Course record from <institution>", "Calendar: <Semester|Quarter> system", one table per term with
COURSE / TITLE / ATTEMPTED / EARNED / GRADE / QUALITY PTS). Courses come from the sponsor course data and the
synthetic equivalency data in 3_Data; invented courses are used only where a scenario needs a course the data
does not have (unknown course, no subject specialist). Students and IDs are fictional.

Usage:  python generate_transcripts.py            -> writes html/*.html
        then print each to PDF (print_pdfs.ps1, headless Microsoft Edge)
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'html')
POINTS = {'A+': 4.3, 'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 'C+': 2.3, 'C': 2.0, 'C-': 1.7,
          'D+': 1.3, 'D': 1.0, 'D-': 0.7, 'F': 0.0}

NEU, NYU, RCC, PCSU = 'Northeastern University', 'New York University', 'Riverside Community College', 'Pacific Coast State University'

# (file, student, student id, major, BU start, institution, calendar, [(term, [(code, title, credits|None, grade)])])
TRANSCRIPTS = [
    ('TC01_Established_Equivalencies_Northeastern', 'Elena Park', 'TST-101', 'Computer Science', 'Fall 2027', NEU, 'Semester', [
        ('Fall 2024', [('CS 2000', 'Introduction to Program Design and Implementation', 5, 'A'),
                       ('CS 1800', 'Discrete Structures', 4, 'B+')]),
        ('Spring 2025', [('ECON 1116', 'Principles of Microeconomics', 4, 'A-')])]),
    ('TC02_Elective_Equivalency_Riverside', 'Jonah Castillo', 'TST-102', 'Computer Science', 'Fall 2027', RCC, 'Semester', [
        ('Fall 2024', [('ENG 101', 'English Composition I', 3, 'B+'),
                       ('CSC 110', 'Programming Fundamentals with Python', 4, 'A')])]),
    ('TC03_Elective_and_Different_Course_Northeastern', 'Priya Natarajan', 'TST-103', 'Computer Science', 'Fall 2027', NEU, 'Semester', [
        ('Fall 2024', [('DS 3000', 'Mathematical Foundations of Artificial Intelligence', 4, 'A'),
                       ('PSYC 2320', 'Statistics in Psychological Research', 4, 'B+')]),
        ('Spring 2025', [('CS 3800', 'Theory of Computation', 4, 'A-')])]),
    ('TC04_No_Credit_Rules_NYU', 'Daniel Okoro', 'TST-104', 'Psychology', 'Fall 2027', NYU, 'Semester', [
        ('Fall 2024', [('BIOL-UA 11', 'Principles of Biology I', 4, 'D'),
                       ('MATH-UA 121', 'Calculus I', 4, 'C-')]),
        ('Spring 2025', [('CHEM-UA 125', 'General Chemistry I', 5, 'W'),
                         ('PSYCH-UA 1', 'Intro to Psychology', 4, 'A')])]),
    ('TC05_Information_Required_NYU', 'Sofia Lindqvist', 'TST-105', 'Mathematics', 'Fall 2027', NYU, 'Semester', [
        ('Fall 2024', [('MATH-UA 122', 'Calculus II', 4, 'B+')]),
        ('Spring 2025', [('MATH-UA 235', 'Probability & Statistics', 4, 'A-')])]),
    ('TC07_Conflicting_Precedents_Northeastern', 'Mateus Ribeiro', 'TST-107', 'Biology', 'Fall 2027', NEU, 'Semester', [
        ('Fall 2024', [('CHEM 1161', 'General Chemistry for Science Majors', 5, 'B'),
                       ('MATH 1365', 'Introduction to Mathematical Reasoning', 4, 'A-')]),
        ('Spring 2025', [('ECON 2560', 'Applied Econometrics', 4, 'A-')])]),
    ('TC08_Grade_Rules_Northeastern', 'Hannah Weiss', 'TST-108', 'Mathematics', 'Fall 2027', NEU, 'Semester', [
        ('Fall 2024', [('CS 1800', 'Discrete Structures', 4, 'A+'),
                       ('MATH 1341', 'Calculus 1 for Science and Engineering', 4, 'P')]),
        ('Spring 2025', [('ECON 1116', 'Principles of Microeconomics', 4, 'C-'),
                         ('MATH 2341', 'Differential Equations and Linear Algebra for Engineering', 4, 'B')])]),
    ('TC11_Repeated_Course_Northeastern', 'Theo Grant', 'TST-111', 'Computer Science', 'Fall 2027', NEU, 'Semester', [
        ('Fall 2024', [('CS 2000', 'Introduction to Program Design and Implementation', 5, 'C+'),
                       ('CS 1800', 'Discrete Structures', 4, 'B')]),
        ('Spring 2025', [('CS 2000', 'Introduction to Program Design and Implementation', 5, 'A-')])]),
    ('TC12_Course_Code_Formats_Northeastern', 'Aisha Bello', 'TST-112', 'Computer Science', 'Fall 2027', NEU, 'Semester', [
        ('Fall 2024', [('CS2000', 'Introduction to Program Design and Implementation', 5, 'A'),
                       ('cs-1800', 'Discrete Structures', 4, 'B+')]),
        ('Spring 2025', [('ECON1116', 'Principles of Microeconomics', 4, 'A-'),
                         ('math 1341', 'Calculus 1 for Science and Engineering', 4, 'B')])]),
    ('TC13_Missing_Credits_Northeastern', 'Lucas Moreau', 'TST-113', 'Economics', 'Fall 2027', NEU, 'Semester', [
        ('Fall 2024', [('CS 2000', 'Introduction to Program Design and Implementation', None, 'A'),
                       ('ECON 1116', 'Principles of Microeconomics', 4, 'B')])]),
    ('TC14_Unknown_Course_Northeastern', 'Grace Adeyemi', 'TST-114', 'Computer Science', 'Fall 2027', NEU, 'Semester', [
        ('Fall 2024', [('CS 2000', 'Introduction to Program Design and Implementation', 5, 'A')]),
        ('Spring 2025', [('CS 4973', 'Topics in Quantum Software Engineering', 4, 'A')])]),
    ('TC15_No_Subject_Specialist_Riverside', 'Oliver Bennett', 'TST-115', 'Liberal Arts', 'Fall 2027', RCC, 'Semester', [
        ('Fall 2024', [('PHIL 101', 'Introduction to Philosophy', 3, 'A-'),
                       ('MUS 110', 'Music Appreciation', 3, 'B+')]),
        ('Spring 2025', [('KIN 105', 'Fitness and Wellness', 1, 'A')])]),
    ('TC16_Multiple_Institutions_Riverside', 'Nadia Haddad', 'TST-116', 'Computer Science', 'Fall 2027', RCC, 'Semester', [
        ('Fall 2023', [('CSC 110', 'Programming Fundamentals with Python', 4, 'A'),
                       ('MAT 151', 'Calculus I', 4, 'B+')])]),
    ('TC16_Multiple_Institutions_PacificCoast', 'Nadia Haddad', 'TST-116', 'Computer Science', 'Fall 2027', PCSU, 'Quarter', [
        ('Fall 2024', [('PSYC 1', 'Introduction to Psychology', 5, 'B'),
                       ('MATH 19A', 'Calculus for Science I', 5, 'B+')])]),
    ('TC17_Multiple_Evaluators_Northeastern', 'Ethan Sato', 'TST-117', 'Computer Science', 'Fall 2027', NEU, 'Semester', [
        ('Fall 2024', [('CS 2100', 'Program Design and Implementation 1', 5, 'B+'),
                       ('BIOL 2301', 'Genetics and Molecular Biology', 5, 'A-'),
                       ('MATH 2331', 'Linear Algebra', 4, 'A')]),
        ('Spring 2025', [('CS 2700', 'Data Structures and Analysis', 5, 'B'),
                         ('PSYC 2320', 'Statistics in Psychological Research', 4, 'B')])]),
    ('TC26_Economics_Cap_PacificCoast', 'Ivy Chen-Morales', 'TST-126', 'Economics', 'Fall 2027', PCSU, 'Quarter', [
        ('Fall 2024', [('ECON 100A', 'Intermediate Microeconomics', 5, 'A-'),
                       ('ECON 100B', 'Intermediate Macroeconomics', 5, 'B+')]),
        ('Winter 2025', [('ECON 113', 'Introduction to Econometrics', 5, 'A'),
                         ('ECON 136', 'Behavioral Economics', 5, 'A')])]),
    ('TC26_Economics_Cap_Northeastern', 'Ivy Chen-Morales', 'TST-126', 'Economics', 'Fall 2027', NEU, 'Semester', [
        ('Spring 2025', [('ECON 2560', 'Applied Econometrics', 4, 'A-')])]),
]

CSS = """
@page { size: Letter; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 10.5pt; }
.band { background: #ecebe6; padding: 30px 48px 22px; }
.eyebrow { color: #34507a; font-size: 8.5pt; font-weight: bold; letter-spacing: .5px; }
h1 { font-family: Georgia, 'Times New Roman', serif; font-size: 20pt; margin: 6px 0 4px; color: #111; white-space: nowrap; }
.sub { color: #666; font-size: 9pt; white-space: nowrap; }
.wrap { padding: 22px 48px 40px; }
.info { display: grid; grid-template-columns: 1fr 1fr 1fr; row-gap: 12px; margin-bottom: 18px; }
.lbl { font-size: 7.5pt; font-weight: bold; color: #555; letter-spacing: .4px; }
.val { font-size: 10.5pt; margin-top: 2px; }
.term { border-top: 1px solid #c8c8c8; padding-top: 10px; margin-top: 8px; }
.termname { font-weight: bold; font-size: 11pt; margin: 2px 0 8px; }
table { width: 100%; border-collapse: collapse; }
th { font-size: 7.5pt; color: #555; text-align: left; font-weight: bold; padding: 3px 4px; white-space: nowrap; }
td { padding: 3px 4px; white-space: nowrap; vertical-align: baseline; font-size: 9.5pt; }
.code { font-family: 'Courier New', monospace; width: 15%; }
th.code { font-family: Arial, Helvetica, sans-serif; }  /* one font per header row, so it stays on one text line */
.title { width: 47%; }
.num { text-align: right; width: 10%; }
.grade { font-weight: bold; width: 8%; padding-left: 26px; }
.summary { color: #777; font-size: 8.5pt; padding: 6px 0 4px 15%; }
.total { border-top: 2px solid #333; margin-top: 16px; padding-top: 8px; display: flex; justify-content: space-between; font-weight: bold; }
.foot { position: fixed; bottom: 28px; left: 48px; right: 48px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 7.5pt; color: #666; }
"""


def fmt(n):
    return '' if n is None else f'{n:.2f}'


def render(t):
    _, student, sid, major, start, inst, cal, terms = t
    unit = 'quarter units' if cal == 'Quarter' else 'semester hours'
    out = [f'<!doctype html><html><head><meta charset="utf-8"><title>Transcript {html.escape(student)}</title><style>{CSS}</style></head><body>',
           '<div class="band"><div class="eyebrow">SAMPLE TRANSCRIPT · FOR SOFTWARE TESTING</div>',
           f'<h1>Course record from {html.escape(inst)}</h1>',
           f'<div class="sub">Prepared for: Boston University transfer-credit evaluation · Calendar: {cal} system, credits in {unit}</div></div>',
           '<div class="wrap"><div class="info">']
    for k, v in [('STUDENT', student), ('STUDENT ID', sid), ('INSTITUTION', inst), ('INTENDED BU MAJOR', major), ('BU START', start), ('DATE PREPARED', 'October 28, 2026')]:
        out.append(f'<div><div class="lbl">{k}</div><div class="val">{html.escape(v)}</div></div>')
    out.append('</div>')
    cum_earned = cum_qp = cum_gpa_cr = 0.0
    for term, courses in terms:
        out.append(f'<div class="term"><div class="termname">{html.escape(term)}</div><table>'
                   '<tr><th class="code">COURSE</th><th class="title">TITLE</th><th class="num">ATTEMPTED</th><th class="num">EARNED</th><th class="grade">GRADE</th><th class="num">QUALITY PTS</th></tr>')
        t_earned = t_qp = t_cr = 0.0
        for code, title, cr, grade in courses:
            pts = POINTS.get(grade)
            earned = None if cr is None else (0.0 if grade in ('W', 'F') else cr)
            qp = None if (cr is None or pts is None) else round(pts * cr, 2)
            if cr is not None and earned:
                t_earned += earned
            if qp is not None:
                t_qp += qp; t_cr += cr
            out.append(f'<tr><td class="code">{html.escape(code)}</td><td class="title">{html.escape(title)}</td>'
                       f'<td class="num">{fmt(cr)}</td><td class="num">{fmt(earned)}</td><td class="grade">{html.escape(grade)}</td>'
                       f'<td class="num">{fmt(qp) if qp is not None else "—"}</td></tr>')
        cum_earned += t_earned; cum_qp += t_qp; cum_gpa_cr += t_cr
        gpa = f'{t_qp / t_cr:.2f}' if t_cr else '—'
        cgpa = f'{cum_qp / cum_gpa_cr:.2f}' if cum_gpa_cr else '—'
        out.append(f'</table><div class="summary">Term: earned {t_earned:.2f} · GPA {gpa} &nbsp;&nbsp; Cumulative: earned {cum_earned:.2f} · GPA {cgpa}</div></div>')
    cgpa = f'{cum_qp / cum_gpa_cr:.2f}' if cum_gpa_cr else '—'
    out.append(f'<div class="total"><span>TOTAL EARNED: {cum_earned:.2f} {unit}</span><span>CUMULATIVE GPA: {cgpa}</span></div></div>')
    out.append('<div class="foot">Grading key: A+ 4.3 · A 4.0 · A- 3.7 · B+ 3.3 · B 3.0 · B- 2.7 · C+ 2.3 · C 2.0 · C- 1.7 · D 1.0 · F 0.0 · '
               'P pass (not in GPA) · W withdrawn (no credit, not in GPA)<br>Sample document for testing the transfer-credit portal. '
               'Fictional student. Not an official transcript.<span style="float:right">Page 1 of 1</span></div>')
    out.append('</body></html>')
    return ''.join(out)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    manifest = []
    for t in TRANSCRIPTS:
        with open(os.path.join(OUT, t[0] + '.html'), 'w', encoding='utf-8') as f:
            f.write(render(t))
        manifest.append({'file': t[0] + '.pdf', 'student': t[1], 'student_id': t[2], 'major': t[3], 'start': t[4], 'institution': t[5],
                         'calendar': t[6], 'courses': [{'term': term, 'code': c[0], 'title': c[1], 'credits': c[2], 'grade': c[3]} for term, cs in t[7] for c in cs]})
    with open(os.path.join(HERE, 'transcripts.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1)
    print(f'{len(TRANSCRIPTS)} transcripts written to {OUT}')
