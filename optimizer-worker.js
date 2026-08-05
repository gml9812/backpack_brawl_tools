'use strict';

importScripts('optimizer-core.js', 'optimizer-solver.js');

let activeRequestId = null;

self.onmessage = function (event) {
  const message = event.data || {};
  if (message.type !== 'solve') return;
  activeRequestId = message.requestId;
  const requestId = message.requestId;
  try {
    const result = self.BBOptimizerSolver.solve({
      instances: message.instances,
      items: message.items,
      board: message.board,
      options: {
        ...message.options,
        onProgress(progress) {
          if (activeRequestId === requestId) self.postMessage({ type: 'progress', requestId, ...progress });
        }
      }
    });
    if (activeRequestId === requestId) self.postMessage({ type: 'complete', requestId, ...result });
  } catch (error) {
    self.postMessage({
      type: 'error', requestId, code: 'SOLVER_ERROR',
      message: error instanceof Error ? error.message : String(error)
    });
  }
};
