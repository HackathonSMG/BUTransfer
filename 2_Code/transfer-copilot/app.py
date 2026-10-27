"""Step 8 - The UI: three screens on one engine.

Run:  streamlit run app.py
"""
import pandas as pd
import streamlit as st
from engine.pipeline import Pipeline, summary, STATUS_REVIEW

st.set_page_config(page_title="Transfer Credit Co-pilot", layout="wide")


@st.cache_resource
def get_pipeline():
    return Pipeline()


p = get_pipeline()
s = p.store
if "decisions" not in st.session_state:
    st.session_state.decisions = {}   # row_id -> (decision, bu_course)

role = st.sidebar.radio("I am a…", ["Student", "Evaluator", "Admin"])
sid = st.sidebar.selectbox("Student", s.students.student_id,
                           format_func=lambda x: f"{x} · {s.students.set_index('student_id').loc[x, 'name']}")


def results_for(student_id):
    res = p.evaluate_student(student_id)
    for r in res:  # apply evaluator decisions made in this session
        if r.row_id in st.session_state.decisions:
            dec, bu = st.session_state.decisions[r.row_id]
            r.status = "Not transferable" if dec == "No credit" else "Confirmed"
            r.suggestion, r.path = bu, "Evaluator decided"
            if dec == "No credit":
                r.bu_credits = 0
    return res


# ---------------- Student ----------------
if role == "Student":
    stu = s.students.set_index("student_id").loc[sid]
    st.title(f"Your transfer credit · {stu['name']}")
    st.caption(f"Intended major: {stu.intended_major} · Started {stu.bu_start_term} · "
               f"All credits must be transferred within one year of starting.")
    res = results_for(sid)
    sm = summary(res)
    c = st.columns(4)
    c[0].metric("Confirmed", f"{sm['Confirmed']:.2f} cr")
    c[1].metric("Likely", f"{sm['Likely']:.2f} cr")
    c[2].metric("Under review", f"{sm['Under review']:.2f} cr")
    c[3].metric("Not transferable", sum(r.status == "Not transferable" for r in res))
    for r in res:
        with st.expander(f"{r.status} · {r.institution} {r.course} {r.title} → {r.suggestion} ({r.bu_credits} cr)"):
            st.write(r.reason)
            if r.status == STATUS_REVIEW:
                st.file_uploader("Upload syllabus to speed this up", key=f"up-{r.row_id}")

# ---------------- Evaluator ----------------
elif role == "Evaluator":
    st.title("Review queue")
    queue = [r for x in s.students.student_id for r in results_for(x)
             if r.path in ("Needs review", "Precedent") and r.status != "Not transferable" and r.row_id not in st.session_state.decisions]
    queue.sort(key=lambda r: -r.confidence)
    st.caption(f"{len(queue)} courses waiting · sorted by AI confidence · you make the final decision")
    for r in queue:
        with st.container(border=True):
            left, right = st.columns(2)
            src = s.course(r.institution, r.course)
            left.subheader(f"{r.institution} · {r.course}")
            left.write(f"**{r.title}** · {r.source_credits} {r.credit_system.lower()} cr → {r.bu_credits} BU cr · grade {r.grade}")
            left.caption(src["description"])
            syl = s.syllabus_for(r.institution, r.course)
            if syl:
                left.info(syl)
            right.subheader(f"Suggested: {r.suggestion}  ({r.confidence:.0%})")
            right.write(r.reason)
            if r.candidates:
                right.dataframe(pd.DataFrame(r.candidates)[["bu_course", "title", "score", "covered", "missing"]],
                                hide_index=True)
            options = [r.suggestion] + [c["bu_course"] for c in r.candidates if c["bu_course"] != r.suggestion] + ["Elective credit"]
            choice = right.selectbox("Award", options, key=f"ch-{r.row_id}")
            b1, b2 = right.columns(2)
            if b1.button("Approve", key=f"ap-{r.row_id}", type="primary"):
                st.session_state.decisions[r.row_id] = ("Approve", choice)
                s.add_equivalency(r.institution, r.course, r.title, choice if choice.startswith("CAS") else "",
                                  "BU equivalent" if choice.startswith("CAS") else "Elective credit", "EVAL-YOU")
                st.rerun()
            if b2.button("No credit", key=f"no-{r.row_id}"):
                st.session_state.decisions[r.row_id] = ("No credit", "No credit")
                st.rerun()

# ---------------- Admin ----------------
else:
    st.title("Transfer credit operations")
    allr = [r for x in s.students.student_id for r in results_for(x)]
    paths = pd.Series([r.path for r in allr]).value_counts()
    c = st.columns(4)
    c[0].metric("Courses processed", len(allr))
    c[1].metric("Auto-applied", f"{(paths.get('Auto-applied', 0) / len(allr)):.0%}")
    c[2].metric("In review queue", int(paths.get("Needs review", 0) + paths.get("Precedent", 0)))
    c[3].metric("Avg days to decide (history)", f"{s.past.days_to_decision.mean():.0f}")
    st.bar_chart(paths)
    st.subheader("Equivalency database")
    st.dataframe(s.equivalency.tail(15), hide_index=True)
