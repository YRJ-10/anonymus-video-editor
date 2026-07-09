(function exposeEditorHistory(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EditorHistory = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createEditorHistory() {
  "use strict";

  function clone(value) {
    return structuredClone(value);
  }

  function same(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function create(initialState, limit = 100) {
    return {
      past: [],
      present: clone(initialState),
      future: [],
      limit: Math.max(1, Number(limit) || 100),
    };
  }

  function commit(history, nextState) {
    const next = clone(nextState);
    if (same(history.present, next)) return history;
    const past = [...history.past, clone(history.present)];
    if (past.length > history.limit) past.splice(0, past.length - history.limit);
    return { ...history, past, present: next, future: [] };
  }

  function undo(history) {
    if (history.past.length === 0) return history;
    const past = history.past.slice();
    const present = past.pop();
    return {
      ...history,
      past,
      present: clone(present),
      future: [clone(history.present), ...history.future],
    };
  }

  function redo(history) {
    if (history.future.length === 0) return history;
    const [present, ...future] = history.future;
    return {
      ...history,
      past: [...history.past, clone(history.present)],
      present: clone(present),
      future,
    };
  }

  return Object.freeze({
    canRedo: (history) => history.future.length > 0,
    canUndo: (history) => history.past.length > 0,
    commit,
    create,
    redo,
    undo,
  });
});
