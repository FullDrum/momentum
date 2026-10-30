/* Structured task memory for the voice prototype.
 * Explicitly user-reviewed notes only; this module does not pretend to be AI.
 * Kept separate from full transcript archive.
 */
(function(root){
  'use strict';
  function normalize(note) {
    var n = note && typeof note === 'object' ? note : {};
    return {
      summary: String(n.summary || '').trim(),
      details: Array.isArray(n.details) ? n.details.map(String).map(function(x){return x.trim();}).filter(Boolean) : [],
      outcome: String(n.outcome || '').trim(),
      nextAction: String(n.nextAction || '').trim(),
      status: ['pending','in_progress','waiting','completed'].indexOf(n.status) >= 0 ? n.status : 'pending',
      sourceRecordId: n.sourceRecordId ? String(n.sourceRecordId) : null
    };
  }
  function fromReviewedText(text, outcome, nextAction, status, sourceRecordId) {
    return normalize({
      summary: String(text || '').trim(),
      details: [],
      outcome: outcome,
      nextAction: nextAction,
      status: status,
      sourceRecordId: sourceRecordId
    });
  }
  root.MomentumTaskMemory = {normalize:normalize,fromReviewedText:fromReviewedText};
})(typeof window !== 'undefined' ? window : this);
