(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BB_OPTIMIZER_STORAGE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY = 'bb-optimizer-saved-layouts-v1';
  const LIMIT = 20;

  function cleanName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  }

  function validPlacement(value) {
    return value && typeof value.instanceId === 'string' && typeof value.itemId === 'string'
      && Number.isInteger(value.x) && Number.isInteger(value.y) && Number.isInteger(value.rotation);
  }

  function normalize(record) {
    if (!record || typeof record.id !== 'string' || !Array.isArray(record.layout) || !record.layout.every(validPlacement)) return null;
    const columns = Math.max(1, Math.min(9, Math.round(Number(record.board?.columns)) || 9));
    const rows = Math.max(1, Math.min(6, Math.round(Number(record.board?.rows)) || 6));
    return {
      schemaVersion: 1,
      id: record.id,
      name: cleanName(record.name) || 'Saved layout',
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString(),
      dataVersion: String(record.dataVersion || ''),
      board: { columns, rows },
      quality: String(record.quality || 'standard'),
      items: Array.isArray(record.items) ? record.items.filter((entry) => entry && typeof entry.id === 'string' && Number.isInteger(entry.count) && entry.count > 0)
        .map((entry) => ({ id: entry.id, count: Math.min(99, entry.count) })) : [],
      layout: record.layout.map((placement) => ({
        instanceId: placement.instanceId,
        itemId: placement.itemId,
        x: placement.x,
        y: placement.y,
        rotation: placement.rotation
      })),
      score: {
        validConnections: Number(record.score?.validConnections) || 0,
        activeGroups: Number(record.score?.activeGroups) || 0,
        contributingTargets: Number(record.score?.contributingTargets) || 0
      }
    };
  }

  function read(storage) {
    try {
      const parsed = JSON.parse(storage.getItem(KEY) || '[]');
      return Array.isArray(parsed) ? parsed.map(normalize).filter(Boolean).slice(0, LIMIT) : [];
    } catch (_) { return []; }
  }

  function write(storage, records) {
    const normalized = records.map(normalize).filter(Boolean).slice(0, LIMIT);
    storage.setItem(KEY, JSON.stringify(normalized));
    return normalized;
  }

  function save(storage, record) {
    const normalized = normalize(record);
    if (!normalized) throw new Error('Invalid saved layout');
    return write(storage, [normalized, ...read(storage).filter((entry) => entry.id !== normalized.id)]);
  }

  function remove(storage, id) {
    return write(storage, read(storage).filter((record) => record.id !== id));
  }

  return { KEY, LIMIT, cleanName, normalize, read, save, remove };
});
