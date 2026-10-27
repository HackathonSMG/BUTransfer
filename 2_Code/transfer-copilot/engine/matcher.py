"""Step 3 - Similarity matching: rank BU courses for a course with no existing equivalency.

Default: TF-IDF (no API key needed, runs anywhere).
Upgrade: set USE_EMBEDDINGS=1 and install sentence-transformers for semantic embeddings.
"""
import os
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def _text(row: dict, syllabus: str = "") -> str:
    return " ".join([row.get("title", ""), row.get("title", ""),  # title twice = more weight
                     row.get("description", ""), row.get("learning_outcomes", ""), syllabus])


class Matcher:
    def __init__(self, bu_catalog):
        self.bu = bu_catalog.to_dict("records")
        docs = [_text(r) for r in self.bu]
        self.use_emb = os.getenv("USE_EMBEDDINGS") == "1"
        if self.use_emb:
            from sentence_transformers import SentenceTransformer
            self.model = SentenceTransformer("all-MiniLM-L6-v2")
            self.bu_vecs = self.model.encode(docs, normalize_embeddings=True)
        else:
            self.vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
            self.bu_vecs = self.vec.fit_transform(docs)

    def top_k(self, course: dict, syllabus: str = "", k: int = 3):
        q = _text(course, syllabus)
        if self.use_emb:
            sims = self.bu_vecs @ self.model.encode([q], normalize_embeddings=True)[0]
        else:
            sims = cosine_similarity(self.vec.transform([q]), self.bu_vecs)[0]
        # small boost when the program (major) is the same
        sims = np.array([s + (0.05 if r["program"] == course.get("program") else 0) for s, r in zip(sims, self.bu)])
        order = sims.argsort()[::-1][:k]
        best = sims[order[0]] if len(order) else 1
        out = []
        for i in order:
            r = self.bu[i]
            out.append(dict(bu_course=r["course"], title=r["title"], score=round(float(sims[i]), 3),
                            # relative confidence: how far ahead of the field the candidate is
                            confidence=round(min(0.95, float(sims[i]) / max(best, 1e-9) * min(1, best * 1.5)), 2),
                            covered=_overlap(course, r), missing=_missing(course, r)))
        return out


def _keywords(text: str) -> set:
    stop = {"and", "the", "of", "to", "in", "a", "with", "for", "an", "on", "including", "introduction", "basic",
            "course", "use", "using", "apply", "explain", "describe", "covers", "includes", "laboratory", "lab"}
    words = [w.strip(".,;:()").lower() for w in text.split()]
    return {w for w in words if len(w) > 3 and w not in stop}


def _overlap(src: dict, bu: dict) -> list:
    return sorted(_keywords(src.get("description", "")) & _keywords(bu["description"]))[:8]


def _missing(src: dict, bu: dict) -> list:
    return sorted(_keywords(bu["description"]) - _keywords(src.get("description", "")))[:8]
