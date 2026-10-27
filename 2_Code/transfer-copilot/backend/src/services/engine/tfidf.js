/** Minimal TF-IDF implementation — no external ML dependency. */

const STOP = new Set([
  'and','the','of','to','in','a','with','for','an','on','including','introduction','basic',
  'course','use','using','apply','explain','describe','covers','includes','laboratory','lab',
  'students','will','are','be','is','this','that','which','as','at','or','by','from','can',
]);

function tokenise(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
}

function bigrams(tokens) {
  const out = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]}_${tokens[i + 1]}`);
  return out;
}

function tf(terms) {
  const freq = {};
  for (const t of terms) freq[t] = (freq[t] || 0) + 1;
  const n = terms.length || 1;
  return Object.fromEntries(Object.entries(freq).map(([k, v]) => [k, v / n]));
}

export class TfIdf {
  constructor(docs) {
    this._n = docs.length;
    this._df = {};
    this._tfs = docs.map((d) => {
      const terms = bigrams(tokenise(d));
      const t = tf(terms);
      for (const k of Object.keys(t)) this._df[k] = (this._df[k] || 0) + 1;
      return t;
    });
  }

  _idf(term) {
    const df = this._df[term] || 0;
    return df ? Math.log((this._n + 1) / (df + 1)) + 1 : 0;
  }

  _vec(docTf) {
    const v = {};
    for (const [t, f] of Object.entries(docTf)) v[t] = f * this._idf(t);
    return v;
  }

  _queryVec(text) {
    const terms = bigrams(tokenise(text));
    return this._vec(tf(terms));
  }

  cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const av = a[k] || 0, bv = b[k] || 0;
      dot += av * bv; na += av * av; nb += bv * bv;
    }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }

  /** Returns cosine similarities of query vs all docs */
  similarities(queryText) {
    const qv = this._queryVec(queryText);
    return this._tfs.map((docTf) => this.cosine(qv, this._vec(docTf)));
  }
}

export function keywords(text) {
  return [...new Set(tokenise(text))];
}

export function overlap(srcText, buText) {
  const sa = new Set(keywords(srcText));
  const ba = new Set(keywords(buText));
  return [...sa].filter((w) => ba.has(w)).slice(0, 8);
}

export function missing(srcText, buText) {
  const sa = new Set(keywords(srcText));
  const ba = new Set(keywords(buText));
  return [...ba].filter((w) => !sa.has(w)).slice(0, 8);
}
