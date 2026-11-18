'use strict';

importScripts('battle-rng.js', 'battle-heroes.js', 'battle-items.js', 'battle-engine.js', 'battle-core.js');

const CHUNK = 100;

self.onmessage = function (event) {
  const message = event.data || {};
  if (message.type !== 'run') return;
  const requestId = message.requestId;
  try {
    const batch = self.BB_BATTLE_CORE.createBatch(message.build, message.options);
    while (!batch.step(CHUNK)) self.postMessage({ type: 'progress', requestId, done: batch.done, total: batch.runs });
    self.postMessage({ type: 'complete', requestId, result: batch.finish() });
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error instanceof Error ? error.message : String(error) });
  }
};
