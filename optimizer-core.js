(function (root) {
  'use strict';

  function pointKey(point) { return `${point[0]},${point[1]}`; }

  function normalizePoints(points) {
    if (!points.length) return [];
    const minX = Math.min(...points.map((point) => point[0]));
    const minY = Math.min(...points.map((point) => point[1]));
    return points.map(([x, y]) => [x - minX, y - minY])
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }

  function rotatePoint([x, y], turns) {
    let nextX = x;
    let nextY = y;
    for (let turn = 0; turn < ((turns % 4) + 4) % 4; turn += 1) {
      const oldX = nextX;
      nextX = -nextY;
      nextY = oldX;
    }
    return [nextX, nextY];
  }

  function rotateDefinition(item, degrees) {
    const turns = (((degrees / 90) % 4) + 4) % 4;
    const rawFootprint = item.footprint.map((point) => rotatePoint(point, turns));
    const minX = Math.min(...rawFootprint.map((point) => point[0]));
    const minY = Math.min(...rawFootprint.map((point) => point[1]));
    const shift = ([x, y]) => [x - minX, y - minY];
    const footprint = rawFootprint.map(shift).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const starGroups = (item.starGroups || []).map((group) => ({
      ...group,
      target: { ...(group.target || {}) },
      offsets: group.offsets.map((point) => shift(rotatePoint(point, turns)))
        .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    }));
    return {
      rotation: degrees,
      footprint,
      starGroups,
      width: Math.max(...footprint.map((point) => point[0])) + 1,
      height: Math.max(...footprint.map((point) => point[1])) + 1
    };
  }

  function rotationKey(rotation) {
    return JSON.stringify({
      footprint: rotation.footprint,
      groups: rotation.starGroups.map((group) => ({ id: group.id, offsets: group.offsets }))
    });
  }

  function uniqueRotations(item) {
    const seen = new Set();
    const result = [];
    for (const degrees of (item.rotations || [0, 90, 180, 270])) {
      const rotation = rotateDefinition(item, degrees);
      const key = rotationKey(rotation);
      if (!seen.has(key)) {
        seen.add(key);
        result.push(rotation);
      }
    }
    return result;
  }

  function cellIndex(x, y, board) { return y * board.columns + x; }
  function cellMask(x, y, board) { return 1n << BigInt(cellIndex(x, y, board)); }

  function pointsToMask(points, board, originX = 0, originY = 0) {
    let mask = 0n;
    for (const [dx, dy] of points) {
      const x = originX + dx;
      const y = originY + dy;
      if (x < 0 || y < 0 || x >= board.columns || y >= board.rows) return null;
      mask |= cellMask(x, y, board);
    }
    return mask;
  }

  function masksOverlap(a, b) { return (a & b) !== 0n; }

  function buildPlacementCandidates(instance, item, board) {
    const placements = [];
    for (const rotation of uniqueRotations(item)) {
      for (let y = 0; y <= board.rows - rotation.height; y += 1) {
        for (let x = 0; x <= board.columns - rotation.width; x += 1) {
          const occupancyMask = pointsToMask(rotation.footprint, board, x, y);
          const starMasksByGroup = rotation.starGroups.map((group) => {
            let mask = 0n;
            for (const [dx, dy] of group.offsets) {
              const starX = x + dx;
              const starY = y + dy;
              if (starX >= 0 && starY >= 0 && starX < board.columns && starY < board.rows) {
                mask |= cellMask(starX, starY, board);
              }
            }
            return mask;
          });
          placements.push({
            instanceId: instance.instanceId,
            itemId: item.id,
            x, y,
            rotation: rotation.rotation,
            footprint: rotation.footprint,
            width: rotation.width,
            height: rotation.height,
            occupancyMask,
            starGroups: rotation.starGroups,
            starMasksByGroup,
            canonicalKey: `${item.id}:${rotation.rotation}:${y}:${x}`
          });
        }
      }
    }
    return placements;
  }

  function targetMatches(sourceItem, targetItem, condition) {
    const rule = condition || {};
    if (rule.any !== true && !rule.anyTypes?.length && !rule.allTypes?.length && !rule.anyItemIds?.length) return false;
    if (rule.excludedItemIds?.includes(targetItem.id)) return false;
    if (rule.anyItemIds?.length && !rule.anyItemIds.includes(targetItem.id)) return false;
    if (rule.anyTypes?.length && !rule.anyTypes.some((type) => targetItem.types.includes(type))) return false;
    if (rule.allTypes?.length && !rule.allTypes.every((type) => targetItem.types.includes(type))) return false;
    if (rule.excludedTypes?.some((type) => targetItem.types.includes(type))) return false;
    if (rule.anyHeroIds?.length && !rule.anyHeroIds.includes(targetItem.hero)) return false;
    return sourceItem.id !== undefined;
  }

  function evaluateLayout(layout, itemById) {
    const connections = [];
    const activeGroupKeys = new Set();
    const contributingTargets = new Set();
    let totalGroups = 0;
    const details = [];
    for (const source of layout) {
      const sourceItem = itemById[source.itemId];
      const sourceDetails = { instanceId: source.instanceId, itemId: source.itemId, groups: [] };
      totalGroups += source.starGroups.length;
      source.starGroups.forEach((group, groupIndex) => {
        const targets = [];
        for (const target of layout) {
          if (target.instanceId === source.instanceId) continue;
          const targetItem = itemById[target.itemId];
          if (!targetMatches(sourceItem, targetItem, group.target)) continue;
          if (masksOverlap(source.starMasksByGroup[groupIndex], target.occupancyMask)) {
            targets.push(target.instanceId);
            connections.push({
              key: `${source.instanceId}|${group.id}|${target.instanceId}`,
              sourceInstanceId: source.instanceId,
              sourceItemId: source.itemId,
              groupId: group.id,
              groupLabel: group.label,
              targetInstanceId: target.instanceId,
              targetItemId: target.itemId
            });
            contributingTargets.add(target.instanceId);
          }
        }
        if (targets.length) activeGroupKeys.add(`${source.instanceId}|${group.id}`);
        sourceDetails.groups.push({ id: group.id, label: group.label, targets });
      });
      details.push(sourceDetails);
    }
    const score = {
      validConnections: connections.length,
      activeGroups: activeGroupKeys.size,
      contributingTargets: contributingTargets.size
    };
    return { score, connections, details, totalGroups };
  }

  function layoutTieKey(layout) {
    return layout.slice().sort((a, b) => a.instanceId.localeCompare(b.instanceId))
      .map((placement) => `${placement.instanceId}:${String(placement.rotation).padStart(3, '0')}:${String(placement.y).padStart(2, '0')}:${String(placement.x).padStart(2, '0')}`)
      .join('|');
  }

  function boundingBoxArea(layout) {
    if (!layout.length) return 0;
    let minX = Infinity; let minY = Infinity; let maxX = -1; let maxY = -1;
    for (const placement of layout) {
      for (const [dx, dy] of placement.footprint) {
        minX = Math.min(minX, placement.x + dx);
        minY = Math.min(minY, placement.y + dy);
        maxX = Math.max(maxX, placement.x + dx);
        maxY = Math.max(maxY, placement.y + dy);
      }
    }
    return (maxX - minX + 1) * (maxY - minY + 1);
  }

  function densityKey(layout) {
    return layout.flatMap((placement) => placement.footprint.map(([dx, dy]) => [placement.x + dx, placement.y + dy]))
      .sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(pointKey).join('|');
  }

  function compareSolutions(a, b) {
    if (!b) return 1;
    const fields = ['validConnections', 'activeGroups', 'contributingTargets'];
    for (const field of fields) {
      if (a.score[field] !== b.score[field]) return a.score[field] > b.score[field] ? 1 : -1;
    }
    const areaA = boundingBoxArea(a.layout);
    const areaB = boundingBoxArea(b.layout);
    if (areaA !== areaB) return areaA < areaB ? 1 : -1;
    const densityA = densityKey(a.layout);
    const densityB = densityKey(b.layout);
    if (densityA !== densityB) return densityA < densityB ? 1 : -1;
    const keyA = layoutTieKey(a.layout);
    const keyB = layoutTieKey(b.layout);
    return keyA === keyB ? 0 : keyA < keyB ? 1 : -1;
  }

  const api = {
    normalizePoints, rotatePoint, rotateDefinition, uniqueRotations,
    cellIndex, cellMask, pointsToMask, masksOverlap, buildPlacementCandidates,
    targetMatches, evaluateLayout, compareSolutions, boundingBoxArea, layoutTieKey
  };
  root.BBOptimizerCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
