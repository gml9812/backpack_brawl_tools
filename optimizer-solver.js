(function (root) {
  'use strict';

  const core = root.BBOptimizerCore || (typeof require === 'function' ? require('./optimizer-core.js') : null);

  function now() {
    return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
  }

  function hashSeed(value) {
    let hash = 2166136261;
    const text = String(value || 'backpack-brawl');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function randomFactory(seed) {
    let state = hashSeed(seed) || 1;
    return function random() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967296;
    };
  }

  function expandInstances(requested, itemById) {
    const counts = new Map();
    return requested.map((entry) => {
      const itemId = typeof entry === 'string' ? entry : entry.itemId;
      if (!itemById[itemId]) throw new Error(`Unknown item: ${itemId}`);
      counts.set(itemId, (counts.get(itemId) || 0) + 1);
      return {
        itemId,
        instanceId: typeof entry === 'object' && entry.instanceId
          ? entry.instanceId : `${itemId}#${counts.get(itemId)}`
      };
    });
  }

  function prepare(requested, items, board) {
    const itemById = Object.fromEntries(items.map((item) => [item.id, item]));
    const instances = expandInstances(requested, itemById);
    const area = instances.reduce((sum, instance) => sum + itemById[instance.itemId].footprint.length, 0);
    if (area > board.columns * board.rows) {
      return { error: 'area-exceeded', area, instances, itemById };
    }
    const prepared = instances.map((instance, index) => {
      const item = itemById[instance.itemId];
      const candidates = core.buildPlacementCandidates(instance, item, board);
      return {
        ...instance,
        index,
        area: item.footprint.length,
        starCount: item.starGroups.reduce((sum, group) => sum + group.offsets.length, 0),
        candidates
      };
    });
    const impossible = prepared.find((instance) => !instance.candidates.length);
    if (impossible) return { error: 'item-does-not-fit', itemId: impossible.itemId, instances, itemById };
    return { prepared, instances, itemById, area };
  }

  function candidateHeuristic(candidate, layout, itemById) {
    const evaluated = core.evaluateLayout([...layout, candidate], itemById).score;
    return evaluated.validConnections * 100000 + evaluated.activeGroups * 1000
      + evaluated.contributingTargets * 100 - candidate.y * 2 - candidate.x;
  }

  function greedySolution(prepared, itemById, seed, restarts, cancelled) {
    let best = null;
    const random = randomFactory(seed);
    const baseOrder = prepared.slice().sort((a, b) =>
      a.candidates.length - b.candidates.length || b.area - a.area || b.starCount - a.starCount || a.instanceId.localeCompare(b.instanceId));
    for (let restart = 0; restart < restarts && !cancelled(); restart += 1) {
      let occupied = 0n;
      const layout = [];
      let feasible = true;
      for (const instance of baseOrder) {
        const legal = instance.candidates.filter((candidate) => !core.masksOverlap(occupied, candidate.occupancyMask));
        if (!legal.length) { feasible = false; break; }
        const ranked = legal.map((candidate) => ({
          candidate,
          score: candidateHeuristic(candidate, layout, itemById),
          noise: random()
        })).sort((a, b) => b.score - a.score || (restart ? a.noise - b.noise : a.candidate.canonicalKey.localeCompare(b.candidate.canonicalKey)));
        const choiceWindow = restart ? Math.min(4, ranked.length) : 1;
        const chosen = ranked[Math.floor(random() * choiceWindow)].candidate;
        layout.push(chosen);
        occupied |= chosen.occupancyMask;
      }
      if (feasible) {
        const evaluated = core.evaluateLayout(layout, itemById);
        const solution = { layout: layout.slice(), score: evaluated.score, evaluation: evaluated };
        if (core.compareSolutions(solution, best) > 0) best = solution;
      }
    }
    return best;
  }

  function solve(input) {
    const options = input.options || {};
    const board = input.board || { columns: 6, rows: 9 };
    const timeLimitMs = Math.max(0, Number(options.timeLimitMs ?? 5000));
    const start = now();
    const isCancelled = typeof options.isCancelled === 'function' ? options.isCancelled : () => false;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const preparedData = prepare(input.instances || [], input.items || [], board);
    if (preparedData.error) {
      return { status: preparedData.error, elapsedMs: now() - start, explored: 0, score: null, layout: [] };
    }
    const { prepared, itemById, area } = preparedData;
    if (!prepared.length) return { status: 'empty-input', elapsedMs: now() - start, explored: 0, score: null, layout: [] };

    let best = options.skipGreedy ? null : greedySolution(
      prepared, itemById, options.seed || prepared.map((entry) => entry.itemId).join('|'),
      Math.max(1, Number(options.restarts || 5)), isCancelled
    );
    let explored = 0;
    let completed = true;
    let cancelled = false;
    let lastProgress = start;
    const placementByIndex = new Array(prepared.length);
    const placed = new Array(prepared.length).fill(false);
    const transposition = new Set();
    const transpositionCap = Math.max(0, Number(options.transpositionCap ?? 100000));

    function shouldStop() {
      if (isCancelled()) { cancelled = true; completed = false; return true; }
      if (timeLimitMs && now() - start >= timeLimitMs) { completed = false; return true; }
      return false;
    }

    function previousIdenticalIndex(index) {
      for (let previous = index - 1; previous >= 0; previous -= 1) {
        if (prepared[previous].itemId === prepared[index].itemId) return previous;
      }
      return -1;
    }

    function selectableIndexes(occupied) {
      const choices = [];
      for (let index = 0; index < prepared.length; index += 1) {
        if (placed[index]) continue;
        const previous = previousIdenticalIndex(index);
        if (previous >= 0 && !placed[previous]) continue;
        const minimumKey = previous >= 0 ? placementByIndex[previous].canonicalKey : '';
        const legal = prepared[index].candidates.filter((candidate) =>
          candidate.canonicalKey >= minimumKey && !core.masksOverlap(occupied, candidate.occupancyMask));
        if (!legal.length) return [{ index, legal }];
        choices.push({ index, legal });
      }
      choices.sort((a, b) => a.legal.length - b.legal.length
        || prepared[b.index].area - prepared[a.index].area
        || prepared[b.index].starCount - prepared[a.index].starCount
        || prepared[a.index].instanceId.localeCompare(prepared[b.index].instanceId));
      return choices;
    }

    function visit(depth, occupied) {
      if ((explored & 255) === 0 && shouldStop()) return;
      explored += 1;
      const tick = now();
      if (tick - lastProgress >= 150) {
        lastProgress = tick;
        onProgress({ elapsedMs: tick - start, explored, bestScore: best?.score || null, bestLayout: best?.layout || [] });
      }
      if (depth === prepared.length) {
        const layout = placementByIndex.slice();
        const evaluated = core.evaluateLayout(layout, itemById);
        const solution = { layout, score: evaluated.score, evaluation: evaluated };
        if (core.compareSolutions(solution, best) > 0) best = solution;
        return;
      }
      const choices = selectableIndexes(occupied);
      if (!choices.length || !choices[0].legal.length) return;
      const choice = choices[0];
      const ordered = choice.legal.map((candidate) => ({
        candidate,
        heuristic: candidateHeuristic(candidate, placementByIndex.filter(Boolean), itemById)
      })).sort((a, b) => b.heuristic - a.heuristic || a.candidate.canonicalKey.localeCompare(b.candidate.canonicalKey));
      placed[choice.index] = true;
      for (const entry of ordered) {
        placementByIndex[choice.index] = entry.candidate;
        const nextOccupied = occupied | entry.candidate.occupancyMask;
        if (transpositionCap) {
          const key = placementByIndex.filter(Boolean).map((placement) => `${placement.instanceId}=${placement.canonicalKey}`).sort().join(';');
          if (transposition.has(key)) continue;
          if (transposition.size < transpositionCap) transposition.add(key);
        }
        visit(depth + 1, nextOccupied);
        if (!completed) break;
      }
      placementByIndex[choice.index] = undefined;
      placed[choice.index] = false;
    }

    visit(0, 0n);
    const elapsedMs = now() - start;
    if (cancelled) return { status: 'cancelled', elapsedMs, explored, score: best?.score || null, layout: best?.layout || [] };
    if (!best) {
      return { status: completed ? 'no-feasible-arrangement' : 'no-layout-timeout', elapsedMs, explored, score: null, layout: [] };
    }
    return {
      status: completed ? 'optimal' : 'best-found',
      elapsedMs,
      explored,
      score: best.score,
      layout: best.layout,
      evaluation: best.evaluation || core.evaluateLayout(best.layout, itemById),
      area,
      transpositionEntries: transposition.size
    };
  }

  function bruteForce(input) {
    return solve({
      ...input,
      options: { ...(input.options || {}), skipGreedy: true, timeLimitMs: 0, transpositionCap: 0 }
    });
  }

  const api = { solve, bruteForce, prepare, expandInstances, hashSeed, randomFactory };
  root.BBOptimizerSolver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
