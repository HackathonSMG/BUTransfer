/**
 * TF-IDF matcher: given a source course, rank BU catalog courses by content similarity.
 * Port of engine/matcher.py.
 */
import { TfIdf, overlap, missing } from './tfidf.js';

function docText(course) {
  return [course.title || '', course.title || '', course.description || '', course.learning_outcomes || ''].join(' ');
}

export class Matcher {
  /** @param {Array<{id,code,title,description,learning_outcomes,program_area}>} buCatalog */
  constructor(buCatalog) {
    this._catalog = buCatalog;
    this._docs    = buCatalog.map(docText);
    this._tfidf   = new TfIdf(this._docs);
  }

  /**
   * Return the top-k BU courses for a source course.
   * @param {{title,description,learning_outcomes,program_area}} course
   * @param {string} syllabus
   * @param {number} k
   */
  topK(course, syllabus = '', k = 3) {
    const q    = [docText(course), syllabus].join(' ');
    const sims = this._tfidf.similarities(q);

    // small boost when program area matches
    const boosted = sims.map((s, i) => {
      const bonus = this._catalog[i].program_area === course.program_area ? 0.05 : 0;
      return s + bonus;
    });

    const best  = Math.max(...boosted, 1e-9);
    const order = boosted.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).slice(0, k);

    return order.map(([sim, i]) => {
      const buCourse = this._catalog[i];
      return {
        bu_course_id: buCourse.id,
        bu_code:      buCourse.code,
        bu_title:     buCourse.title,
        score:        Math.round(sim * 1000) / 1000,
        confidence:   Math.round(Math.min(0.95, (sim / Math.max(best, 1e-9)) * Math.min(1, best * 1.5)) * 100) / 100,
        covered:      overlap(course.description || '', buCourse.description || ''),
        missing:      missing(course.description || '', buCourse.description || ''),
      };
    });
  }
}
