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
    prepared.forEach((instance, sourceIndex) => {
      const sourceItem = itemById[instance.itemId];
      let outgoingPotential = 0;
      let incomingPotential = 0;
      for (const group of sourceItem.starGroups) {
        const matchingTargets = prepared.reduce((count, target, targetIndex) => {
          if (sourceIndex === targetIndex) return count;
          return count + Number(core.targetMatches(sourceItem, itemById[target.itemId], group.target));
        }, 0);
        outgoingPotential += Math.min(new Set(group.offsets.map((point) => point.join(','))).size, matchingTargets);
      }
      prepared.forEach((source, otherSourceIndex) => {
        if (sourceIndex === otherSourceIndex) return;
        const otherSourceItem = itemById[source.itemId];
        incomingPotential += otherSourceItem.starGroups.reduce((count, group) =>
          count + Number(core.targetMatches(otherSourceItem, sourceItem, group.target)), 0);
      });
      instance.connectionPotential = outgoingPotential + incomingPotential;
    });
    return { prepared, instances, itemById, area };
  }

  function scoreUpperBound(prepared, itemById) {
    let validConnections = 0;
    let activeGroups = 0;
    const eligibleTargets = new Set();
    prepared.forEach((source, sourceIndex) => {
      const sourceItem = itemById[source.itemId];
      for (const group of sourceItem.starGroups) {
        const matchingTargets = [];
        prepared.forEach((target, targetIndex) => {
          if (sourceIndex === targetIndex) return;
          if (core.targetMatches(sourceItem, itemById[target.itemId], group.target)) {
            matchingTargets.push(target.instanceId);
            eligibleTargets.add(target.instanceId);
          }
        });
        const distinctStarCells = new Set(group.offsets.map((point) => point.join(','))).size;
        const groupMaximum = Math.min(distinctStarCells, matchingTargets.length);
        validConnections += groupMaximum;
        if (groupMaximum) activeGroups += 1;
      }
    });
    return { validConnections, activeGroups, contributingTargets: eligibleTargets.size };
  }

  function reachesScoreUpperBound(score, upperBound) {
    return score.validConnections === upperBound.validConnections
      && score.activeGroups === upperBound.activeGroups
      && score.contributingTargets === upperBound.contributingTargets;
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
      a.candidates.length - b.candidates.length || b.connectionPotential - a.connectionPotential
      || b.area - a.area || b.starCount - a.starCount || a.instanceId.localeCompare(b.instanceId));
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

  function scoreEnergy(score, totalGroups, totalInstances) {
    return score.validConnections
      + score.activeGroups / Math.max(1, totalGroups + 1) * 0.01
      + score.contributingTargets / Math.max(1, totalInstances + 1) * 0.0001;
  }

  function randomFeasibleLayout(prepared, random, preferredLayout) {
    if (preferredLayout?.length === prepared.length) {
      const byInstance = Object.fromEntries(preferredLayout.map((placement) => [placement.instanceId, placement]));
      const restored = prepared.map((instance) => byInstance[instance.instanceId]);
      if (restored.every(Boolean)) return restored;
    }
    const order = prepared.map((_, index) => index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [order[index], order[swapIndex]] = [order[swapIndex], order[index]];
    }
    const layout = new Array(prepared.length);
    let occupied = 0n;
    for (const index of order) {
      const candidates = prepared[index].candidates;
      const start = Math.floor(random() * candidates.length);
      let chosen = null;
      for (let offset = 0; offset < candidates.length; offset += 1) {
        const candidate = candidates[(start + offset) % candidates.length];
        if (!core.masksOverlap(occupied, candidate.occupancyMask)) {
          chosen = candidate;
          break;
        }
      }
      if (!chosen) return null;
      layout[index] = chosen;
      occupied |= chosen.occupancyMask;
    }
    return layout;
  }

  function localImprovement(prepared, itemById, initialBest, options) {
    const random = randomFactory(`${options.seed}|local`);
    const restarts = Math.max(1, Number(options.restarts || 5));
    const stepsPerRestart = Math.max(100, Number(options.stepsPerRestart || 20000));
    const stepLimit = Math.max(0, Number(options.stepLimit ?? restarts * stepsPerRestart));
    const upperBound = options.upperBound;
    const totalGroups = prepared.reduce((sum, instance) => sum + itemById[instance.itemId].starGroups.length, 0);
    let best = initialBest;
    let explored = 0;
    for (let restart = 0; restart < restarts && explored < stepLimit; restart += 1) {
      if (options.shouldStop() || (best && reachesScoreUpperBound(best.score, upperBound))) break;
      const layout = randomFeasibleLayout(prepared, random, restart === 0 ? best?.layout : null);
      if (!layout) continue;
      let evaluated = core.evaluateLayout(layout, itemById);
      let energy = scoreEnergy(evaluated.score, totalGroups, prepared.length);
      const initial = { layout: layout.slice(), score: evaluated.score, evaluation: evaluated };
      if (core.compareSolutions(initial, best) > 0) best = initial;
      for (let step = 0; step < stepsPerRestart && explored < stepLimit; step += 1) {
        if ((explored & 255) === 0 && options.shouldStop()) break;
        explored += 1;
        const movingIndex = Math.floor(random() * prepared.length);
        let occupiedWithoutMoving = 0n;
        for (let index = 0; index < layout.length; index += 1) {
          if (index !== movingIndex) occupiedWithoutMoving |= layout[index].occupancyMask;
        }
        const candidates = prepared[movingIndex].candidates;
        const start = Math.floor(random() * candidates.length);
        let candidate = null;
        for (let offset = 0; offset < candidates.length; offset += 1) {
          const next = candidates[(start + offset) % candidates.length];
          if (!core.masksOverlap(occupiedWithoutMoving, next.occupancyMask)) {
            candidate = next;
            break;
          }
        }
        if (!candidate || candidate.canonicalKey === layout[movingIndex].canonicalKey) continue;
        const previous = layout[movingIndex];
        layout[movingIndex] = candidate;
        const nextEvaluation = core.evaluateLayout(layout, itemById);
        const nextEnergy = scoreEnergy(nextEvaluation.score, totalGroups, prepared.length);
        const temperature = Math.max(0.05, 2 * (1 - step / stepsPerRestart));
        if (nextEnergy >= energy || random() < Math.exp((nextEnergy - energy) / temperature)) {
          evaluated = nextEvaluation;
          energy = nextEnergy;
          const solution = { layout: layout.slice(), score: evaluated.score, evaluation: evaluated };
          if (core.compareSolutions(solution, best) > 0) best = solution;
          if (reachesScoreUpperBound(best.score, upperBound)) break;
        } else {
          layout[movingIndex] = previous;
        }
      }
    }
    return { best, explored, upperBoundReached: Boolean(best && reachesScoreUpperBound(best.score, upperBound)) };
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

    const upperBound = scoreUpperBound(prepared, itemById);
    const deadlineReached = () => isCancelled() || Boolean(timeLimitMs && now() - start >= timeLimitMs);
    const provenResult = (solution, explored) => ({
      status: 'optimal',
      proof: 'score-upper-bound',
      elapsedMs: now() - start,
      explored,
      score: solution.score,
      scoreUpperBound: upperBound,
      layout: solution.layout,
      evaluation: solution.evaluation || core.evaluateLayout(solution.layout, itemById),
      area,
      transpositionEntries: 0
    });

    let best = options.skipGreedy ? null : greedySolution(
      prepared, itemById, options.seed || prepared.map((entry) => entry.itemId).join('|'),
      Math.max(1, Number(options.restarts || 5)), isCancelled
    );
    let explored = 0;
    if (upperBound.validConnections > 0 && best && reachesScoreUpperBound(best.score, upperBound)) return provenResult(best, explored);
    if (!options.skipGreedy && upperBound.validConnections > 0 && timeLimitMs >= 20 && !deadlineReached()) {
      const requestedFraction = Number(options.localTimeFraction ?? 0.7);
      const localTimeFraction = Number.isFinite(requestedFraction)
        ? Math.min(0.9, Math.max(0.1, requestedFraction)) : 0.7;
      const localDeadline = start + timeLimitMs * localTimeFraction;
      const improved = localImprovement(prepared, itemById, best, {
        seed: options.seed || prepared.map((entry) => entry.itemId).join('|'),
        restarts: Math.max(10, Number(options.localRestarts || options.restarts || 5) * 2),
        stepsPerRestart: options.localStepsPerRestart,
        stepLimit: options.localStepLimit,
        upperBound,
        shouldStop: () => isCancelled() || now() >= localDeadline
      });
      best = improved.best;
      explored += improved.explored;
      if (improved.upperBoundReached) return provenResult(best, explored);
    }
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
        || prepared[b.index].connectionPotential - prepared[a.index].connectionPotential
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
      scoreUpperBound: upperBound,
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

  const api = {
    solve, bruteForce, prepare, expandInstances, hashSeed, randomFactory,
    scoreUpperBound, reachesScoreUpperBound
  };
  root.BBOptimizerSolver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
