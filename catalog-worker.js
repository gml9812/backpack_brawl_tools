'use strict';

importScripts('data.js', 'catalog.js');

self.addEventListener('message', (event) => {
  try {
    const result = self.BBCatalogCalculator.calculate(event.data, self.BB_DATA);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
