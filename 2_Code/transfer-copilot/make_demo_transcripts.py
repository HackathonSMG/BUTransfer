"""Generate the knowledge-base demo transcripts (Synthetic Data, fictional school).

Run:  python make_demo_transcripts.py
Writes backend/samples/transcripts/*.pdf (text-layer PDFs) and matching .txt exports.
No dependencies: the PDF is written by hand so the script runs anywhere.

Scenario 1  Ava Thompson   CS 101 has no equivalency yet -> AI recommends CAS CS 111, evaluator approves
Scenario 2  Liam Carter    same CS 101 and MATH 151 -> reused from the knowledge base
Scenario 3  Zoe Nguyen     CSC 101 (older code format) -> reused; CS 450 Advanced AI Systems -> low confidence,
                           evaluator decides; MATH 151 line has quality points that contradict the grade -> verify
Scenario 4  Mason Reed     CS 450 again -> reuses the decision made for Zoe
"""
from pathlib import Path

OUT = Path(__file__).parent / 'backend' / 'samples' / 'transcripts'
INST = 'Lakeshore State University'
GP = {'A': 4.0, 'A-': 3.7, 'B+': 3.3, 'B': 3.0, 'B-': 2.7, 'C+': 2.3, 'C': 2.0}
DESC = {
    'CS 101': 'Foundations of computing and programming in Python. Students design algorithms, write and test programs using loops, functions and recursion, and explore how computers represent data.',
    'CSC 101': 'Foundations of computing and programming in Python. Students design algorithms, write and test programs using loops, functions and recursion, and explore how computers represent data.',
    'MATH 151': 'Limits, continuity, derivatives of algebraic and transcendental functions, applications of the derivative, and an introduction to definite integrals.',
    'PSY 101': 'Scientific study of behavior and mental processes: research methods, the brain, perception, learning, memory, development, personality, social behavior and psychological disorders.',
    'ECON 101': 'Supply and demand, consumer choice, production and costs, market structures from competition to monopoly, and market failures.',
    'CS 450': 'Design of intelligent agents: heuristic search, planning, reasoning under uncertainty, reinforcement learning and neural networks, with analysis of algorithms and graph search.',
}
TITLES = {'CS 101': 'Introduction to Computer Science', 'CSC 101': 'Intro to Computer Science', 'MATH 151': 'Calculus I',
          'PSY 101': 'Introduction to Psychology', 'ECON 101': 'Principles of Microeconomics', 'CS 450': 'Advanced AI Systems'}
STUDENTS = [
    ('STU-020', 'Ava Thompson', 'B.S. Computer Science (incomplete, transferring)', [
        ('Fall 2024', [('CS 101', 4, 'A'), ('MATH 151', 4, 'B+')]), ('Spring 2025', [('PSY 101', 4, 'A-')])]),
    ('STU-021', 'Liam Carter', 'B.S. Computer Science (incomplete, transferring)', [
        ('Fall 2024', [('CS 101', 4, 'B+'), ('MATH 151', 4, 'A')]), ('Spring 2025', [('ECON 101', 4, 'B')])]),
    ('STU-022', 'Zoe Nguyen', 'B.S. Computer Science (incomplete, transferring)', [
        ('Fall 2023', [('CSC 101', 4, 'A-'), ('MATH 151', 4, 'B+', 14.80)]), ('Spring 2025', [('CS 450', 3, 'A-')])]),
    ('STU-023', 'Mason Reed', 'B.S. Computer Science (incomplete, transferring)', [
        ('Fall 2024', [('CS 101', 4, 'A-')]), ('Spring 2025', [('CS 450', 3, 'B+')])]),
]


def esc(s):
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')


class Page:
    def __init__(self):
        self.ops = []

    def text(self, x, y, s, size=9, bold=False, right=False):
        if right:  # approximate Helvetica width for right alignment of numbers
            x -= len(s) * size * 0.55
        self.ops.append(f'BT /{"F2" if bold else "F1"} {size} Tf {x:.1f} {y:.1f} Td ({esc(s)}) Tj ET')

    def line(self, x1, y, x2):
        self.ops.append(f'0.6 w {x1} {y} m {x2} {y} l S')


def write_pdf(path, pages, title):
    objs = []
    add = lambda body: objs.append(body) or len(objs)
    f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
    pages_id = len(objs) + 1 + 2 * len(pages)
    kids = []
    for p in pages:
        stream = '\n'.join(p.ops).encode('latin-1')
        c = add(f'<< /Length {len(stream)} >>\nstream\n'.encode('latin-1') + stream + b'\nendstream')
        kids.append(add(f'<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 {f1} 0 R /F2 {f2} 0 R >> >> /Contents {c} 0 R >>'))
    assert add(f'<< /Type /Pages /Kids [{" ".join(f"{k} 0 R" for k in kids)}] /Count {len(kids)} >>') == pages_id
    cat = add(f'<< /Type /Catalog /Pages {pages_id} 0 R >>')
    info = add(f'<< /Title ({esc(title)}) /Producer (make_demo_transcripts.py) >>')
    out = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offs = []
    for i, body in enumerate(objs, 1):
        offs.append(len(out))
        out += f'{i} 0 obj\n'.encode() + (body if isinstance(body, bytes) else body.encode('latin-1')) + b'\nendobj\n'
    x = len(out)
    out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode() + b''.join(f'{o:010d} 00000 n \n'.encode() for o in offs)
    out += f'trailer\n<< /Size {len(objs) + 1} /Root {cat} 0 R /Info {info} 0 R >>\nstartxref\n{x}\n%%EOF\n'.encode()
    path.write_bytes(bytes(out))


def build(sid, name, program, terms):
    p = Page()
    W = 612
    p.text(40, 752, 'SAMPLE TRANSCRIPT - SYNTHETIC TEST DATA - NOT AN OFFICIAL RECORD', 8, True)
    p.text(40, 730, f'Official Transcript - {INST}', 17, True)
    p.text(40, 714, 'Office of the Registrar - Lakeshore, MI (fictional institution) - Semester system, credits in semester hours', 8.5)
    labels = [('STUDENT', name), ('STUDENT ID', sid), ('INSTITUTION', INST), ('PROGRAM', program)]
    for i, (k, v) in enumerate(labels):
        x = 40 + (i % 2) * 280; y = 684 - (i // 2) * 32
        p.text(x, y, k, 7, True)
        p.text(x, y - 12, v, 9.5)
    y = 610
    total = 0.0
    lines = []
    for term, rows in terms:
        p.line(40, y + 6, W - 40)
        p.text(40, y - 8, term, 10, True); y -= 24
        for k, xx, r in (('COURSE', 40, False), ('TITLE', 112, False), ('ATTEMPTED', 400, True), ('EARNED', 455, True), ('GRADE', 475, False), ('QUALITY PTS', 572, True)):
            p.text(xx, y, k, 7, True, right=r)
        y -= 15
        for row in rows:
            code, cr, grade = row[:3]
            qp = row[3] if len(row) > 3 else GP[grade] * cr
            p.text(40, y, code, 9); p.text(112, y, TITLES[code], 9)
            p.text(400, y, f'{cr:.2f}', 9, right=True); p.text(455, y, f'{cr:.2f}', 9, right=True)
            p.text(480, y, grade, 9, True); p.text(572, y, f'{qp:.2f}', 9, right=True)
            lines.append(f'{code}  {TITLES[code]}  {cr:.2f}  {cr:.2f}  {grade}  {qp:.2f}')
            total += cr; y -= 15
        lines.append('')
        y -= 12
    p.line(40, y + 6, W - 40)
    p.text(40, y - 10, f'TOTAL EARNED: {total:.2f} semester hours', 10, True)
    p.text(40, 60, 'Grading key: A 4.0 - A- 3.7 - B+ 3.3 - B 3.0 - B- 2.7 - C+ 2.3 - C 2.0 - W withdrawn. Synthetic test document, page 1 of 2.', 7.5)
    d = Page()
    d.text(40, 750, 'COURSE DESCRIPTIONS', 13, True)
    d.text(40, 734, f'Catalog descriptions supplied with the transcript by {INST}.', 8.5)
    yy = 708
    codes = [r[0] for _, rows in terms for r in rows]
    for code in dict.fromkeys(codes):
        words = f'{code} - {TITLES[code]}: {DESC[code]}'.split(' ')
        cur = ''
        for w in words:
            if len(cur) + len(w) > 105:
                d.text(40, yy, cur.strip(), 9); yy -= 13; cur = ''
            cur += w + ' '
        d.text(40, yy, cur.strip(), 9); yy -= 22
    d.text(40, 60, 'Synthetic test document, page 2 of 2.', 7.5)
    stem = f'{sid}_{name.replace(" ", "_")}_Lakeshore_State'
    write_pdf(OUT / f'{stem}.pdf', [p, d], f'SAMPLE transcript (synthetic) - {name} - {INST}')
    txt = [f'Official Transcript - {INST}', '', f'Student: {name}', f'Student ID: {sid}', f'Institution: {INST}', f'Program: {program}', '']
    i = 0
    for term, rows in terms:
        txt.append(term)
        for _ in rows:
            txt.append(lines[i]); i += 1
        i += 1
        txt.append('')
    txt += [f'TOTAL EARNED: {total:.2f}', '', 'COURSE DESCRIPTIONS'] + [f'{c} - {TITLES[c]}: {DESC[c]}' for c in dict.fromkeys(codes)]
    (OUT / f'{stem}.txt').write_text('\n'.join(txt) + '\n', encoding='utf8')
    return stem


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    for s in STUDENTS:
        print(build(*s))
