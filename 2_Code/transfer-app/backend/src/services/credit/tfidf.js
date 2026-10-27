// Minimal TF-IDF with cosine similarity: ranks BU catalog courses against an external course's text.

const STOP = new Set([
  'and', 'the', 'of', 'to', 'in', 'a', 'with', 'for', 'an', 'on', 'including', 'introduction', 'basic',
  'course', 'use', 'using', 'apply', 'explain', 'describe', 'covers', 'includes', 'laboratory', 'lab',
  'students', 'will', 'are', 'be', 'is', 'this', 'that', 'which', 'as', 'at', 'or', 'by', 'from', 'can',
  'week', 'weeks', 'midterm', 'final', 'exam', 'project',
]);

function tokenise(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
}

function terms(text) {
  const tokens = tokenise(text);
  const out = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]}_${tokens[i + 1]}`);
  return out;
}

function termFrequencies(list) {
  const freq = {};
  for (const t of list) freq[t] = (freq[t] || 0) + 1;
  const n = list.length || 1;
  for (const k of Object.keys(freq)) freq[k] /= n;
  return freq;
}

export class TfIdf {
  constructor(docs) {
    this.n = docs.length;
    this.df = {};
    this.docTfs = docs.map((d) => {
      const tf = termFrequencies(terms(d));
      for (const k of Object.keys(tf)) this.df[k] = (this.df[k] || 0) + 1;
      return tf;
    });
    this.docVecs = this.docTfs.map((tf) => this.vector(tf));
  }

  idf(term) {
    const df = this.df[term] || 0;
    return df ? Math.log((this.n + 1) / (df + 1)) + 1 : 0;
  }

  vector(tf) {
    const v = {};
    for (const [t, f] of Object.entries(tf)) v[t] = f * this.idf(t);
    return v;
  }

  static cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (const [k, av] of Object.entries(a)) { na += av * av; if (b[k]) dot += av * b[k]; }
    for (const bv of Object.values(b)) nb += bv * bv;
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }

  similarities(queryText) {
    const q = this.vector(termFrequencies(terms(queryText)));
    return this.docVecs.map((d) => TfIdf.cosine(q, d));
  }
}
