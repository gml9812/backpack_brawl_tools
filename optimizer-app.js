(function () {
  'use strict';

  const data = globalThis.BB_OPTIMIZER_DATA;
  const solver = globalThis.BBOptimizerSolver;
  const core = globalThis.BBOptimizerCore;
  const savedLayoutStorage = globalThis.BB_OPTIMIZER_STORAGE;
  const combatSimulator = globalThis.BB_COMBAT_SIMULATOR;
  const $ = (id) => document.getElementById(id);
  const itemById = Object.fromEntries(data.items.map((item) => [item.id, item]));
  const selected = new Map();
  const qualityTimes = { fast: 1000, standard: 5000, thorough: 20000 };
  let activeWorker = null;
  let requestSequence = 0;
  let activeRequestId = null;
  let lastResult = null;
  let selectedPlacementId = null;
  let inspectorPinnedKey = null;
  let inspectorVisibleKey = null;
  let manualEditEnabled = false;
  let manualDrag = null;
  let suppressManualClick = false;
  const defaultBoard = { columns: data.board.columns, rows: data.board.rows };
  const hoverCapable = !globalThis.matchMedia || globalThis.matchMedia('(hover: hover)').matches;

  const elements = {
    version: $('optimizerDataVersion'), verified: $('optimizerVerifiedOn'),
    search: $('optimizerSearchInput'), hero: $('optimizerHeroFilter'), type: $('optimizerTypeFilter'),
    boardColumns: $('optimizerBoardColumns'), boardRows: $('optimizerBoardRows'),
    catalog: $('optimizerCatalog'), catalogCount: $('optimizerCatalogCount'),
    selectedList: $('optimizerSelectedList'), selectionSummary: $('optimizerSelectionSummary'),
    quality: $('optimizerQualitySelect'), calculate: $('optimizerCalculateButton'), cancel: $('optimizerCancelButton'),
    reset: $('optimizerResetButton'), inputError: $('optimizerInputError'), resultError: $('optimizerResultError'),
    progress: $('optimizerProgress'), content: $('optimizerResultContent'), board: $('optimizerBoard'),
    status: $('optimizerStatus'), connections: $('optimizerConnectionScore'), groups: $('optimizerGroupScore'),
    contributing: $('optimizerContributingScore'), elapsed: $('optimizerElapsed'), explored: $('optimizerExplored'),
    details: $('optimizerConnectionDetails'), selectedPlacement: $('optimizerSelectedPlacement'),
    copyLink: $('optimizerCopyLinkButton'), sources: $('optimizerSourceList'), inspector: $('optimizerItemInspector'),
    combatDuration: $('combatDuration'), combatArmor: $('combatDummyArmor'),
    combatReduction: $('combatDummyReduction'), combatDodge: $('combatDummyDodge'),
    combatSimulate: $('combatSimulateButton'), combatResult: $('combatSimulationResult'),
    combatDamage: $('combatTotalDamage'), combatDps: $('combatDps'), combatHits: $('combatExpectedHits'),
    combatCrits: $('combatExpectedCrits'), combatBuffs: $('combatBuffList'), combatDebuffs: $('combatDebuffList'),
    combatContributions: $('combatContributionList'), combatCoverage: $('combatCoverage'),
    savedName: $('savedLayoutName'), saveLayout: $('saveLayoutButton'),
    savedStatus: $('savedLayoutStatus'), savedList: $('savedLayoutList'),
    manualToggle: $('manualEditToggle'), manualControls: $('manualEditControls'),
    manualSelection: $('manualEditSelection'), manualStatus: $('manualEditStatus'),
    rotate: $('manualRotate')
  };
  elements.board.style.setProperty('--board-columns', data.board.columns);
  elements.board.style.setProperty('--board-rows', data.board.rows);
  const boardLimits = {
    columns: Number(elements.boardColumns.max) || defaultBoard.columns,
    rows: Number(elements.boardRows.max) || defaultBoard.rows
  };

  function clampDimension(value, dimension) {
    const fallback = defaultBoard[dimension];
    return Math.max(1, Math.min(boardLimits[dimension], Math.round(Number(value)) || fallback));
  }

  function currentBoard() {
    return {
      columns: clampDimension(elements.boardColumns.value, 'columns'),
      rows: clampDimension(elements.boardRows.value, 'rows')
    };
  }

  function boardArea(board = currentBoard()) { return board.columns * board.rows; }

  function updateBoardPresentation(board = currentBoard()) {
    data.board.columns = board.columns;
    data.board.rows = board.rows;
    const area = boardArea(board);
    const assumptionLabel = document.querySelector('.optimizer-assumption > strong');
    const assumptionCopy = document.querySelector('.optimizer-assumption > span');
    assumptionLabel.after(document.querySelector('.optimizer-board-size'));
    document.querySelector('.optimizer-header .subtitle').textContent = 'Find the best placement for all items in the selected board size.';
    assumptionLabel.textContent = board.columns + ' columns x ' + board.rows + ' rows - ' + area + ' cells';
    assumptionCopy.textContent = 'Placement optimization ignores combat performance; the training dummy panel below provides a draft estimate.';
    elements.board.style.setProperty('--board-columns', board.columns);
    elements.board.style.setProperty('--board-rows', board.rows);
    elements.board.setAttribute('aria-label', board.columns + 'x' + board.rows + ' optimal placement board');
  }

  function syncBoardState() {
    const board = currentBoard();
    const capacity = boardArea(board);
    const area = totalArea();
    const count = totalCount();
    updateBoardPresentation(board);
    elements.selectionSummary.textContent = count + ' ' + (count === 1 ? 'item' : 'items') + ' - ' + area + ' / ' + capacity + ' cells';
    elements.calculate.disabled = !count || area > capacity || Boolean(activeWorker);
    elements.inputError.textContent = area > capacity
      ? 'Selected items use ' + area + ' cells. Remove at least ' + (area - capacity) + ' cells to fit the ' + board.columns + 'x' + board.rows + ' board.' : '';
  }

  function titleCase(value) { return value === 'shared' ? 'Shared' : value.charAt(0).toUpperCase() + value.slice(1); }
  function totalCount() { return [...selected.values()].reduce((sum, count) => sum + count, 0); }
  function totalArea() { return [...selected].reduce((sum, [id, count]) => sum + itemById[id].footprint.length * count, 0); }

  function appendImage(parent, item) {
    const image = document.createElement('img');
    image.src = item.image;
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      image.hidden = true;
      parent.classList.add('image-failed');
      parent.title = item.name;
    }, { once: true });
    parent.append(image);
  }

  function appendInspectorFact(parent, label, value) {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = label;
    detail.textContent = value;
    wrapper.append(term, detail);
    parent.append(wrapper);
  }

  function appendCombatDetails(parent, item) {
    const combat = item.combat;
    const section = document.createElement('section');
    section.className = 'item-inspector-combat';
    const heading = document.createElement('div');
    heading.className = 'item-inspector-section-heading';
    const title = document.createElement('h4');
    title.textContent = 'Combat specs';
    heading.append(title);
    if (combat?.verifiedOn) {
      const verified = document.createElement('small');
      verified.textContent = 'Verified ' + combat.verifiedOn;
      heading.append(verified);
    }
    section.append(heading);

    if (!combat) {
      const unavailable = document.createElement('p');
      unavailable.className = 'item-inspector-empty';
      unavailable.textContent = 'Combat data unavailable.';
      section.append(unavailable);
      parent.append(section);
      return;
    }

    const combatFacts = document.createElement('dl');
    combatFacts.className = 'item-inspector-facts item-inspector-combat-facts';
    if (combat.price) appendInspectorFact(combatFacts, 'Price', combat.price + ' gold');
    combat.baseStats.forEach((stat) => appendInspectorFact(combatFacts, stat.label, stat.value));
    if (combatFacts.childElementCount) section.append(combatFacts);

    if (combat.effects.length) {
      const effectsTitle = document.createElement('h5');
      effectsTitle.textContent = 'Effects';
      const effects = document.createElement('ul');
      combat.effects.forEach((effect) => {
        const entry = document.createElement('li');
        entry.textContent = effect;
        effects.append(entry);
      });
      section.append(effectsTitle, effects);
    }

    const meaningfulLevels = combat.levels.filter((level) =>
      level.upgrade && level.upgrade !== 'Starting level' && !/unavailable/i.test(level.upgrade));
    if (meaningfulLevels.length) {
      const details = document.createElement('details');
      details.className = 'item-inspector-levels';
      const summary = document.createElement('summary');
      summary.textContent = 'Level upgrades (' + meaningfulLevels.length + ')';
      const levels = document.createElement('ul');
      meaningfulLevels.forEach((level) => {
        const entry = document.createElement('li');
        entry.textContent = 'Lv. ' + level.level + ': ' + level.upgrade;
        levels.append(entry);
      });
      details.append(summary, levels);
      section.append(details);
    }

    if (!combatFacts.childElementCount && !combat.effects.length && !meaningfulLevels.length) {
      const empty = document.createElement('p');
      empty.className = 'item-inspector-empty';
      empty.textContent = 'No combat specs listed for this item.';
      section.append(empty);
    }
    parent.append(section);
  }
  function positionInspector(trigger, event) {
    const inspector = elements.inspector;
    const anchor = trigger.getBoundingClientRect();
    const pointerX = Number.isFinite(event?.clientX) ? event.clientX : anchor.right;
    const pointerY = Number.isFinite(event?.clientY) ? event.clientY : anchor.top;
    const gap = 14;
    const width = inspector.offsetWidth;
    const height = inspector.offsetHeight;
    const left = Math.max(12, Math.min(pointerX + gap, window.innerWidth - width - 12));
    const preferredTop = pointerY + gap;
    const top = preferredTop + height <= window.innerHeight - 12
      ? preferredTop : Math.max(12, pointerY - height - gap);
    inspector.style.left = left + 'px';
    inspector.style.top = top + 'px';
  }

  function hideItemInspector(force = false) {
    if (inspectorPinnedKey && !force) return;
    inspectorPinnedKey = null;
    inspectorVisibleKey = null;
    elements.inspector.hidden = true;
    elements.inspector.classList.remove('is-pinned');
  }

  function showItemInspector(item, trigger, placement, pin, event) {
    const key = placement?.instanceId || item.id;
    if (manualEditEnabled) return;
    if (inspectorPinnedKey && !pin) return;
    if (pin && inspectorPinnedKey === key) {
      hideItemInspector(true);
      return;
    }
    inspectorPinnedKey = pin ? key : null;
    inspectorVisibleKey = key;
    const inspector = elements.inspector;
    inspector.replaceChildren();
    inspector.classList.toggle('is-pinned', pin);

    const header = document.createElement('header');
    header.className = 'item-inspector-header';
    appendImage(header, item);
    const heading = document.createElement('div');
    heading.className = 'item-inspector-heading';
    const title = document.createElement('h3');
    title.textContent = item.name;
    heading.append(title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'item-inspector-close';
    close.textContent = String.fromCharCode(215);
    close.setAttribute('aria-label', 'Close item details');
    close.addEventListener('click', (closeEvent) => {
      closeEvent.stopPropagation();
      hideItemInspector(true);
    });
    header.append(heading, close);
    inspector.append(header);

    appendCombatDetails(inspector, item);
    inspector.hidden = false;
    positionInspector(trigger, event);
    if (pin) close.focus({ preventScroll: true });
  }

  function attachItemInspector(trigger, item, placement = null) {
    const key = placement?.instanceId || item.id;
    trigger.classList.add('has-item-inspector');
    if (trigger.tagName !== 'BUTTON') trigger.tabIndex = 0;
    if (hoverCapable) {
      trigger.addEventListener('mouseenter', (event) => showItemInspector(item, trigger, placement, false, event));
      trigger.addEventListener('mousemove', (event) => {
        if (!inspectorPinnedKey && inspectorVisibleKey === key) positionInspector(trigger, event);
      });
      trigger.addEventListener('mouseleave', () => hideItemInspector());
    }
    trigger.addEventListener('focus', () => showItemInspector(item, trigger, placement, false));
    trigger.addEventListener('blur', () => hideItemInspector());
    trigger.addEventListener('click', (event) => {
      if (event.target.closest('button') && event.target !== trigger) return;
      showItemInspector(item, trigger, placement, true, event);
    });
  }
  function appendFootprint(parent, placement) {
    const occupied = new Set(placement.footprint.map(([x, y]) => `${x},${y}`));
    const neighbors = [
      ['top', 0, -1],
      ['right', 1, 0],
      ['bottom', 0, 1],
      ['left', -1, 0]
    ];
    placement.footprint.forEach(([x, y]) => {
      const cell = document.createElement('span');
      cell.className = 'placed-item-cell';
      cell.style.left = `${x / placement.width * 100}%`;
      cell.style.top = `${y / placement.height * 100}%`;
      cell.style.width = `${100 / placement.width}%`;
      cell.style.height = `${100 / placement.height}%`;
      neighbors.forEach(([side, dx, dy]) => {
        if (!occupied.has(`${x + dx},${y + dy}`)) cell.classList.add(`is-edge-${side}`);
      });
      parent.append(cell);
    });
  }

  function populateFilters() {
    const heroes = [...new Set(data.items.map((item) => item.hero))].sort();
    heroes.forEach((hero) => elements.hero.add(new Option(titleCase(hero), hero)));
    data.types.forEach((type) => elements.type.add(new Option(type, type)));
    elements.version.textContent = data.version;
    elements.verified.textContent = data.verifiedOn;
    elements.sources.replaceChildren(...data.sources.map((source) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = source.url;
      link.textContent = source.label;
      link.target = '_blank';
      link.rel = 'noreferrer';
      li.append(link);
      return li;
    }));
  }

  function renderCatalog() {
    const query = elements.search.value.trim().toLowerCase();
    const hero = elements.hero.value;
    const type = elements.type.value;
    const matches = data.items.filter((item) => item.name.toLowerCase().includes(query)
      && (hero === 'all' || item.hero === hero)
      && (type === 'all' || item.types.includes(type)));
    const ready = data.items.filter((item) => item.selectable).length;
    elements.catalogCount.textContent = `${matches.length} of ${data.items.length} current items · ${ready} calculation-ready`;
    elements.catalog.replaceChildren();
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = '검색 결과가 없습니다.';
      elements.catalog.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    matches.forEach((item) => {
      const row = document.createElement('div');
      row.className = `optimizer-catalog-row${item.selectable ? '' : ' is-unsupported'}`;
      appendImage(row, item);
      const copy = document.createElement('span');
      copy.className = 'optimizer-item-copy';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const meta = document.createElement('small');
      meta.textContent = item.selectable
        ? `${item.dataStatus === 'verified' ? 'Reviewed' : 'Generated'} · ${titleCase(item.hero)} · ${item.rarity} · ${item.types.join(', ')} · ${item.footprint.length} cells`
        : item.unsupportedReason;
      copy.append(name, meta);
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'optimizer-add';
      add.textContent = '+';
      add.disabled = !item.selectable;
      add.title = item.selectable ? `Add ${item.name}` : item.unsupportedReason;
      add.setAttribute('aria-label', item.selectable ? `Add ${item.name}` : `${item.name}: ${item.unsupportedReason}`);
      add.addEventListener('click', () => changeQuantity(item.id, 1));
      row.append(copy, add);
      attachItemInspector(row, item);
      fragment.append(row);
    });
    elements.catalog.append(fragment);
  }

  function changeQuantity(id, delta) {
    const next = Math.max(0, (selected.get(id) || 0) + delta);
    if (next) selected.set(id, next); else selected.delete(id);
    inputsChanged();
  }

  function renderSelected() {
    elements.selectedList.replaceChildren();
    if (!selected.size) {
      const empty = document.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = '아직 선택한 아이템이 없습니다.';
      elements.selectedList.append(empty);
    } else {
      const fragment = document.createDocumentFragment();
      data.items.filter((item) => selected.has(item.id)).forEach((item) => {
        const row = document.createElement('div');
        row.className = 'optimizer-selected-row';
        appendImage(row, item);
        const copy = document.createElement('span');
        copy.className = 'optimizer-item-copy';
        const name = document.createElement('strong');
        name.textContent = item.name;
        const meta = document.createElement('small');
        meta.textContent = `${item.footprint.length} cells each · ${item.types.join(', ')}`;
        copy.append(name, meta);
        const controls = document.createElement('span');
        controls.className = 'quantity-controls';
        const minus = quantityButton('−', `Remove one ${item.name}`, () => changeQuantity(item.id, -1));
        const output = document.createElement('output');
        output.textContent = selected.get(item.id);
        output.setAttribute('aria-label', `${item.name} quantity`);
        const plus = quantityButton('+', `Add one ${item.name}`, () => changeQuantity(item.id, 1));
        const remove = quantityButton('×', `Remove all ${item.name}`, () => { selected.delete(item.id); inputsChanged(); });
        remove.className = 'optimizer-remove';
        controls.append(minus, output, plus, remove);
        row.append(copy, controls);
        attachItemInspector(row, item);
        fragment.append(row);
      });
      elements.selectedList.append(fragment);
    }
    const count = totalCount();
    const area = totalArea();
    elements.selectionSummary.textContent = `${count} ${count === 1 ? 'item' : 'items'} · ${area} / 54 cells`;
    elements.calculate.disabled = !count || area > 54 || Boolean(activeWorker);
    elements.inputError.textContent = area > 54
      ? `총 면적이 ${area}칸입니다. 계산하려면 최소 ${area - 54}칸을 줄이세요.` : '';
    syncBoardState();
  }

  function quantityButton(text, label, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'quantity-button';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', handler);
    return button;
  }

  function serializeHash() {
    const params = new URLSearchParams();
    params.set('v', '1');
    params.set('data', data.version);
    params.set('items', data.items.filter((item) => selected.has(item.id)).map((item) => `${item.id}:${selected.get(item.id)}`).join(','));
    params.set('quality', elements.quality.value);
    const board = currentBoard();
    params.set('board', board.columns + 'x' + board.rows);
    return params.toString();
  }

  function saveHash() {
    try { history.replaceState(null, '', `#${serializeHash()}`); } catch (_) { location.hash = serializeHash(); }
  }

  function restoreHash() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const version = params.get('data');
    if (version && version !== data.version) {
      elements.inputError.textContent = `공유 링크 데이터 ${version}과 현재 데이터 ${data.version}이 달라 지원 항목만 복원했습니다.`;
    }
    const items = params.get('items');
    if (items) {
      items.split(',').forEach((entry) => {
        const separator = entry.lastIndexOf(':');
        const id = entry.slice(0, separator);
        const count = Math.max(0, Math.min(99, Number(entry.slice(separator + 1)) || 0));
        if (count && itemById[id]?.selectable) selected.set(id, count);
      });
    }
    if (qualityTimes[params.get('quality')]) elements.quality.value = params.get('quality');
    const boardMatch = /^([0-9]+)x([0-9]+)$/.exec(params.get('board') || '');
    if (boardMatch) {
      elements.boardColumns.value = clampDimension(boardMatch[1], 'columns');
      elements.boardRows.value = clampDimension(boardMatch[2], 'rows');
    }

  }

  function inputsChanged() {
    if (activeWorker) cancelCalculation('입력이 변경되어 계산을 취소했습니다.');
    lastResult = null;
    selectedPlacementId = null;
    setManualEdit(false);
    elements.manualToggle.disabled = true;
    elements.content.hidden = true;
    elements.saveLayout.disabled = true;
    renderSelected();
    saveHash();
  }

  function expandedInstances() {
    const instances = [];
    data.items.filter((item) => selected.has(item.id)).forEach((item) => {
      for (let index = 1; index <= selected.get(item.id); index += 1) {
        instances.push({ itemId: item.id, instanceId: `${item.id}#${index}` });
      }
    });
    return instances;
  }

  function setCalculating(calculating) {
    elements.cancel.hidden = !calculating;
    elements.calculate.disabled = calculating || !totalCount() || totalArea() > boardArea();
    elements.quality.disabled = calculating;
    elements.boardColumns.disabled = calculating;
    elements.boardRows.disabled = calculating;
  }

  function runCalculation() {
    const board = currentBoard();
    if (!totalCount() || totalArea() > boardArea(board)) return;
    cancelCalculation('');
    elements.resultError.textContent = '';
    elements.content.hidden = true;
    const instances = expandedInstances();
    const requestId = `optimizer-${Date.now()}-${++requestSequence}`;
    activeRequestId = requestId;
    const options = {
      timeLimitMs: qualityTimes[elements.quality.value],
      seed: board.columns + 'x' + board.rows + '|' + instances.map((entry) => entry.itemId).join('|'),
      restarts: elements.quality.value === 'fast' ? 2 : elements.quality.value === 'thorough' ? 9 : 5,
      transpositionCap: elements.quality.value === 'thorough' ? 180000 : 80000
    };
    elements.progress.textContent = '후보 배치를 만들고 빠른 초기 해를 찾는 중…';
    setCalculating(true);
    if (globalThis.Worker) {
      try {
        activeWorker = new Worker('optimizer-worker.js');
        activeWorker.onmessage = (event) => handleWorkerMessage(event.data, requestId);
        activeWorker.onerror = () => {
          cleanupWorker();
          if (instances.length <= 8) runOnMainThread(instances, board, options, requestId);
          else failCalculation('Worker를 시작할 수 없습니다. file:// Worker를 지원하는 최신 브라우저에서 다시 시도하세요.');
        };
        activeWorker.postMessage({ type: 'solve', requestId, instances, options, items: data.items, board, dataVersion: data.version });
        return;
      } catch (_) { cleanupWorker(); }
    }
    if (instances.length <= 8) runOnMainThread(instances, board, options, requestId);
    else failCalculation('이 브라우저에서는 Worker를 사용할 수 없어 8개 이하 입력만 fallback 계산할 수 있습니다.');
  }

  function runOnMainThread(instances, board, options, requestId) {
    elements.progress.textContent = '작은 입력을 호환 모드로 계산 중…';
    setTimeout(() => {
      try {
        const result = solver.solve({ instances, items: data.items, board, options });
        if (activeRequestId === requestId) finishCalculation(result);
      } catch (error) {
        failCalculation(error instanceof Error ? error.message : String(error));
      }
    }, 30);
  }

  function handleWorkerMessage(message, requestId) {
    if (message.requestId !== requestId || activeRequestId !== requestId) return;
    if (message.type === 'progress') {
      const best = message.bestScore ? ` · best ${message.bestScore.validConnections} connections` : '';
      elements.progress.textContent = `${(message.elapsedMs / 1000).toFixed(1)}s · ${message.explored.toLocaleString('ko-KR')} states${best}`;
    } else if (message.type === 'complete') {
      cleanupWorker();
      finishCalculation(message);
    } else if (message.type === 'error') {
      cleanupWorker();
      failCalculation(message.message);
    }
  }

  function cleanupWorker() {
    if (activeWorker) activeWorker.terminate();
    activeWorker = null;
    setCalculating(false);
  }

  function cancelCalculation(message = '계산을 취소했습니다.') {
    if (!activeWorker && !activeRequestId) return;
    cleanupWorker();
    activeRequestId = null;
    if (message) elements.progress.textContent = message;
  }

  function failCalculation(message) {
    activeRequestId = null;
    setCalculating(false);
    elements.resultError.textContent = message;
    elements.progress.textContent = '계산을 완료하지 못했습니다.';
  }

  function statusLabel(result) {
    const labels = {
      optimal: 'Optimal', 'best-found': `Best found in ${(result.elapsedMs / 1000).toFixed(1)}s`,
      'no-feasible-arrangement': 'No feasible arrangement', 'no-layout-timeout': 'No layout found within time limit',
      'area-exceeded': 'Area exceeds ' + boardArea() + ' cells', 'item-does-not-fit': 'Item does not fit',
      cancelled: 'Cancelled', saved: 'Saved layout', edited: 'Manually edited'
    };
    return labels[result.status] || result.status;
  }

  function finishCalculation(result) {
    activeRequestId = null;
    setCalculating(false);
    if (manualEditEnabled) setManualEdit(false);
    lastResult = result;
    selectedPlacementId = null;
    elements.progress.textContent = result.status === 'optimal'
      ? result.proof === 'score-upper-bound'
        ? '이론적 연결 상한에 도달해 최적임을 증명했습니다.'
        : '전체 탐색을 완료해 최적임을 증명했습니다.'
      : result.status === 'best-found' ? '시간 제한까지 찾은 가장 좋은 배치입니다. 최적임이 증명되지는 않았습니다.'
        : statusLabel(result);
    if (!result.layout?.length) {
      elements.content.hidden = true;
      elements.saveLayout.disabled = true;
      elements.resultError.textContent = statusLabel(result);
      elements.manualToggle.disabled = true;
      return;
    }
    elements.content.hidden = false;
    elements.saveLayout.disabled = false;
    elements.status.textContent = statusLabel(result);
    elements.connections.textContent = result.score.validConnections;
    elements.manualToggle.disabled = false;
    elements.groups.textContent = `${result.score.activeGroups} / ${result.evaluation.totalGroups}`;
    elements.contributing.textContent = `${result.score.contributingTargets} / ${result.layout.length}`;
    elements.elapsed.textContent = `${(result.elapsedMs / 1000).toFixed(2)}s`;
    elements.explored.textContent = result.explored.toLocaleString('ko-KR');
    renderBoard();
    renderDetails();
    runCombatSimulation();
  }

  function selectedManualPlacement() {
    return lastResult?.layout?.find((placement) => placement.instanceId === selectedPlacementId) || null;
  }

  function updateManualControls() {
    const placement = selectedManualPlacement();
    const disabled = !manualEditEnabled || !placement;
    const rotations = placement ? [...new Set(itemById[placement.itemId].rotations || [0, 90, 180, 270])] : [];
    elements.rotate.disabled = disabled || rotations.length < 2;
    if (!manualEditEnabled) return;
    elements.manualSelection.textContent = placement
      ? itemById[placement.itemId].name + ' · column ' + (placement.x + 1) + ', row ' + (placement.y + 1) + ' · ' + placement.rotation + '°'
      : '편집할 아이템을 선택하세요';
  }

  function setManualEdit(enabled) {
    manualEditEnabled = Boolean(enabled && lastResult?.layout?.length);
    manualDrag = null;
    suppressManualClick = false;
    elements.manualControls.hidden = !manualEditEnabled;
    elements.manualToggle.textContent = manualEditEnabled ? '편집 종료' : '수동 편집';
    elements.manualToggle.setAttribute('aria-pressed', String(manualEditEnabled));
    elements.board.classList.toggle('is-manual-editing', manualEditEnabled);
    hideItemInspector(true);
    elements.manualStatus.textContent = manualEditEnabled
      ? '아이템을 직접 드래그하거나 선택 후 90° 회전 버튼을 사용하세요.'
      : '';
    updateManualControls();
    if (lastResult?.layout?.length) renderBoard();
  }

  function applyManualPlacement(x, y, rotation) {
    const current = selectedManualPlacement();
    if (!manualEditEnabled || !current) return false;
    const item = itemById[current.itemId];
    const board = currentBoard();
    const candidate = core.buildPlacementAt({ instanceId: current.instanceId, itemId: current.itemId }, item, board, x, y, rotation);
    const overlaps = candidate && lastResult.layout.some((placement) =>
      placement.instanceId !== current.instanceId && core.masksOverlap(placement.occupancyMask, candidate.occupancyMask));
    if (!candidate || overlaps) {
      elements.manualStatus.textContent = !candidate ? '보드 밖으로 이동할 수 없습니다.' : '다른 아이템과 겹치는 위치입니다.';
      return false;
    }
    const layout = lastResult.layout.map((placement) => placement.instanceId === current.instanceId ? candidate : placement);
    const evaluation = core.evaluateLayout(layout, itemById);
    lastResult = {
      ...lastResult,
      status: 'edited', proof: 'manual-edit', layout,
      score: evaluation.score, evaluation
    };
    elements.status.textContent = statusLabel(lastResult);
    elements.connections.textContent = evaluation.score.validConnections;
    elements.groups.textContent = evaluation.score.activeGroups + ' / ' + evaluation.totalGroups;
    elements.contributing.textContent = evaluation.score.contributingTargets + ' / ' + layout.length;
    elements.progress.textContent = '수동으로 수정한 배치입니다. 전투 결과를 다시 계산했습니다.';
    elements.manualStatus.textContent = '배치를 수정했습니다.';
    elements.saveLayout.disabled = false;
    renderBoard();
    renderDetails();
    runCombatSimulation();
    return true;
  }

  function rotateSelectedPlacement() {
    const placement = selectedManualPlacement();
    if (!placement) return;
    const rotations = [...new Set(itemById[placement.itemId].rotations || [0, 90, 180, 270])];
    const index = rotations.indexOf(placement.rotation);
    const nextRotation = rotations[(index + 1) % rotations.length];
    applyManualPlacement(placement.x, placement.y, nextRotation);
  }
  function activeTargetsFor(instanceId) {
    if (!lastResult || !instanceId) return new Set();
    return new Set(lastResult.evaluation.connections
      .filter((connection) => connection.sourceInstanceId === instanceId)
      .map((connection) => connection.targetInstanceId));
  }

  function renderBoard() {
    elements.board.replaceChildren();
    for (let index = 0; index < data.board.columns * data.board.rows; index += 1) {
      const cell = document.createElement('span');
      cell.className = 'optimizer-cell';
      cell.setAttribute('aria-hidden', 'true');
      elements.board.append(cell);
    }
    const targets = activeTargetsFor(selectedPlacementId);
    lastResult.layout.forEach((placement) => {
      const item = itemById[placement.itemId];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'placed-item';
      if (placement.instanceId === selectedPlacementId) button.classList.add('is-source');
      else if (targets.has(placement.instanceId)) button.classList.add('is-target');
      else if (selectedPlacementId) button.classList.add('is-dimmed');
      button.style.left = `${placement.x / data.board.columns * 100}%`;
      button.style.top = `${placement.y / data.board.rows * 100}%`;
      button.style.width = `${placement.width / data.board.columns * 100}%`;
      button.style.height = `${placement.height / data.board.rows * 100}%`;
      button.setAttribute('aria-label', `${placement.instanceId}, rotation ${placement.rotation} degrees, column ${placement.x + 1}, row ${placement.y + 1}`);
      appendImage(button, item);
      appendFootprint(button, placement);
      const image = button.querySelector('img');
      if (image) image.style.transform = `rotate(${placement.rotation}deg)`;
      button.addEventListener('click', () => {
        if (suppressManualClick) {
          suppressManualClick = false;
          return;
        }
        selectedPlacementId = manualEditEnabled
          ? placement.instanceId
          : selectedPlacementId === placement.instanceId ? null : placement.instanceId;
        renderBoard();
        renderDetails();
        updateManualControls();
      });
      button.addEventListener('pointerdown', (event) => {
        if (!manualEditEnabled || (event.button != null && event.button !== 0)) return;
        const rect = elements.board.getBoundingClientRect();
        const cellWidth = rect.width / data.board.columns;
        const cellHeight = rect.height / data.board.rows;
        selectedPlacementId = placement.instanceId;
        manualDrag = {
          instanceId: placement.instanceId,
          startX: event.clientX,
          startY: event.clientY,
          offsetX: Math.floor((event.clientX - rect.left) / cellWidth) - placement.x,
          offsetY: Math.floor((event.clientY - rect.top) / cellHeight) - placement.y,
          dragging: false
        };
        updateManualControls();
        try { button.setPointerCapture(event.pointerId); } catch (_) { /* pointer capture is optional */ }
      });
      button.addEventListener('pointermove', (event) => {
        if (!manualDrag || manualDrag.instanceId !== placement.instanceId) return;
        if (Math.hypot(event.clientX - manualDrag.startX, event.clientY - manualDrag.startY) > 5) {
          manualDrag.dragging = true;
          button.classList.add('is-dragging');
        }
      });
      button.addEventListener('pointerup', (event) => {
        if (!manualDrag || manualDrag.instanceId !== placement.instanceId) return;
        const drag = manualDrag;
        manualDrag = null;
        button.classList.remove('is-dragging');
        if (!drag.dragging) return;
        const rect = elements.board.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / (rect.width / data.board.columns)) - drag.offsetX;
        const y = Math.floor((event.clientY - rect.top) / (rect.height / data.board.rows)) - drag.offsetY;
        suppressManualClick = true;
        applyManualPlacement(x, y, placement.rotation);
      });
      button.addEventListener('pointercancel', () => {
        manualDrag = null;
        button.classList.remove('is-dragging');
      });
      elements.board.append(button);
      attachItemInspector(button, item, placement);
    });
    renderStarMarkers();
    updateManualControls();
  }

  function renderStarMarkers() {
    const aggregate = new Map();
    const placementByInstance = Object.fromEntries(lastResult.layout.map((placement) => [placement.instanceId, placement]));
    const targetsByGroup = new Map();
    lastResult.evaluation.connections.forEach((connection) => {
      const key = `${connection.sourceInstanceId}|${connection.groupId}`;
      const targets = targetsByGroup.get(key) || [];
      targets.push(placementByInstance[connection.targetInstanceId]);
      targetsByGroup.set(key, targets);
    });
    lastResult.layout.forEach((placement) => {
      placement.starGroups.forEach((group) => {
        group.offsets.forEach(([dx, dy]) => {
          const x = placement.x + dx;
          const y = placement.y + dy;
          if (x < 0 || y < 0 || x >= data.board.columns || y >= data.board.rows) return;
          const key = `${x},${y}`;
          const record = aggregate.get(key) || { x, y, count: 0, active: false, sources: new Set() };
          record.count += 1;
          const cell = 1n << BigInt(y * data.board.columns + x);
          const groupTargets = targetsByGroup.get(`${placement.instanceId}|${group.id}`) || [];
          record.active ||= groupTargets.some((target) => (target.occupancyMask & cell) !== 0n);
          record.sources.add(placement.instanceId);
          aggregate.set(key, record);
        });
      });
    });
    aggregate.forEach((record) => {
      const marker = document.createElement('span');
      marker.className = `star-marker${record.active ? ' is-active' : ''}`;
      if (selectedPlacementId && !record.sources.has(selectedPlacementId)) marker.style.opacity = '.25';
      marker.style.left = `${record.x / data.board.columns * 100}%`;
      marker.style.top = `${record.y / data.board.rows * 100}%`;
      marker.style.width = `${100 / data.board.columns}%`;
      marker.style.height = `${100 / data.board.rows}%`;
      marker.textContent = record.active ? '★' : '☆';
      if (record.count > 1) {
        const badge = document.createElement('b');
        badge.textContent = record.count;
        marker.append(badge);
      }
      elements.board.append(marker);
    });
  }

  function renderDetails() {
    elements.details.replaceChildren();
    elements.selectedPlacement.textContent = selectedPlacementId || '모든 아이템';
    const details = lastResult.evaluation.details.filter((detail) => !selectedPlacementId || detail.instanceId === selectedPlacementId);
    details.forEach((detail) => {
      const item = itemById[detail.itemId];
      const card = document.createElement('article');
      card.className = `connection-card${detail.instanceId === selectedPlacementId ? ' is-selected' : ''}`;
      appendImage(card, item);
      const body = document.createElement('div');
      const heading = document.createElement('h4');
      heading.textContent = detail.instanceId;
      body.append(heading);
      if (!detail.groups.length) {
        const noGroups = document.createElement('small');
        noGroups.textContent = 'No Star groups';
        body.append(noGroups);
      }
      detail.groups.forEach((group) => {
        const section = document.createElement('div');
        section.className = 'connection-group';
        const label = document.createElement('strong');
        label.textContent = group.label;
        section.append(label);
        if (group.targets.length) {
          const list = document.createElement('ul');
          group.targets.forEach((target) => {
            const li = document.createElement('li');
            li.textContent = target;
            list.append(li);
          });
          section.append(list);
        } else {
          const inactive = document.createElement('small');
          inactive.className = 'inactive';
          inactive.textContent = 'No eligible target placed on this group’s Star cells.';
          section.append(inactive);
        }
        body.append(section);
      });
      card.append(body);
      elements.details.append(card);
    });
  }

  function formatCombatNumber(value) {
    return Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  function renderCombatMetrics(list, metrics, emptyMessage) {
    list.replaceChildren();
    const entries = Object.entries(metrics).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (!entries.length) {
      const empty = document.createElement('li');
      empty.className = 'inactive';
      empty.textContent = emptyMessage;
      list.append(empty);
      return;
    }
    entries.forEach(([label, amount]) => {
      const entry = document.createElement('li');
      entry.textContent = label + ' +' + formatCombatNumber(amount);
      list.append(entry);
    });
  }

  function runCombatSimulation() {
    if (!lastResult?.layout?.length) return;
    const result = combatSimulator.simulate({
      layout: lastResult.layout,
      items: data.items,
      evaluation: lastResult.evaluation,
      duration: elements.combatDuration.value,
      dummy: {
        armor: elements.combatArmor.value,
        reduction: elements.combatReduction.value,
        dodge: elements.combatDodge.value
      }
    });
    elements.combatDamage.textContent = formatCombatNumber(result.damage);
    elements.combatDps.textContent = formatCombatNumber(result.dps);
    elements.combatHits.textContent = formatCombatNumber(result.expectedHits);
    elements.combatCrits.textContent = formatCombatNumber(result.expectedCrits);
    renderCombatMetrics(elements.combatBuffs, result.buffs, '계산된 버프 없음');
    renderCombatMetrics(elements.combatDebuffs, result.debuffs, '계산된 디버프 없음');
    elements.combatContributions.replaceChildren();
    if (!result.contributions.length) {
      const empty = document.createElement('li');
      empty.className = 'inactive';
      empty.textContent = '계산 가능한 직접 피해 없음';
      elements.combatContributions.append(empty);
    } else {
      result.contributions.forEach((contribution) => {
        const entry = document.createElement('li');
        entry.textContent = contribution.name + ' (' + contribution.instanceId + '): ' + formatCombatNumber(contribution.damage);
        elements.combatContributions.append(entry);
      });
    }
    const modeled = result.recognizedEffects;
    const skipped = result.unsupportedEffects;
    elements.combatCoverage.textContent = result.supportedItems + ' / ' + lastResult.layout.length + '개 아이템에 combat 데이터가 있습니다. '
      + modeled + '개 효과 절을 계산했고 ' + skipped + '개는 초안 범위 밖이라 제외했습니다. '
      + 'Armor는 먼저 피해를 흡수하고, 이후 피해 감소율을 적용합니다.';
    elements.combatResult.hidden = false;
  }
  function readSavedLayouts() {
    try { return savedLayoutStorage.read(globalThis.localStorage); }
    catch (_) {
      elements.savedStatus.textContent = '이 브라우저에서는 로컬 저장소를 사용할 수 없습니다.';
      return [];
    }
  }

  function renderSavedLayouts() {
    const records = readSavedLayouts();
    elements.savedList.replaceChildren();
    if (!records.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = '저장된 배치가 없습니다.';
      elements.savedList.append(empty);
      return;
    }
    records.forEach((record) => {
      const card = document.createElement('article');
      card.className = 'saved-layout-card';
      const body = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = record.name;
      const created = new Date(record.createdAt);
      const meta = document.createElement('small');
      meta.textContent = record.board.columns + 'x' + record.board.rows + ' · ' + record.layout.length + ' items · '
        + (Number.isNaN(created.getTime()) ? record.createdAt : created.toLocaleString('ko-KR'));
      body.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'saved-layout-actions';
      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'button button-secondary';
      load.textContent = '불러오기';
      load.addEventListener('click', () => restoreSavedLayout(record));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button-quiet';
      remove.textContent = '삭제';
      remove.addEventListener('click', () => {
        if (!globalThis.confirm('이 저장된 배치를 삭제할까요?')) return;
        try {
          savedLayoutStorage.remove(globalThis.localStorage, record.id);
          elements.savedStatus.textContent = '저장된 배치를 삭제했습니다.';
          renderSavedLayouts();
        } catch (_) { elements.savedStatus.textContent = '저장된 배치를 삭제하지 못했습니다.'; }
      });
      actions.append(load, remove);
      card.append(body, actions);
      elements.savedList.append(card);
    });
  }

  function saveCurrentLayout() {
    if (!lastResult?.layout?.length) return;
    const board = currentBoard();
    const now = new Date();
    const record = {
      id: 'layout-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 8),
      name: elements.savedName.value || board.columns + 'x' + board.rows + ' layout ' + now.toLocaleString('ko-KR'),
      createdAt: now.toISOString(),
      dataVersion: data.version,
      board,
      quality: elements.quality.value,
      items: data.items.filter((item) => selected.has(item.id)).map((item) => ({ id: item.id, count: selected.get(item.id) })),
      layout: lastResult.layout.map(({ instanceId, itemId, x, y, rotation }) => ({ instanceId, itemId, x, y, rotation })),
      score: lastResult.score
    };
    try {
      savedLayoutStorage.save(globalThis.localStorage, record);
      elements.savedName.value = '';
      elements.savedStatus.textContent = '현재 최적 배치를 이 브라우저에 저장했습니다.';
      renderSavedLayouts();
    } catch (_) { elements.savedStatus.textContent = '저장 공간을 사용할 수 없거나 용량이 부족합니다.'; }
  }

  function restoreSavedLayout(record) {
    try {
      cancelCalculation('');
      const board = record.board;
      elements.boardColumns.value = board.columns;
      elements.boardRows.value = board.rows;
      elements.quality.value = qualityTimes[record.quality] ? record.quality : 'standard';
      selected.clear();
      record.items.forEach((entry) => {
        if (itemById[entry.id]?.selectable) selected.set(entry.id, entry.count);
      });
      renderSelected();
      const occupied = [];
      const layout = record.layout.map((saved) => {
        const item = itemById[saved.itemId];
        if (!item?.selectable) throw new Error('Saved item is unavailable');
        const candidate = core.buildPlacementAt({ instanceId: saved.instanceId, itemId: saved.itemId }, item, board, saved.x, saved.y, saved.rotation);
        if (!candidate || occupied.some((mask) => core.masksOverlap(mask, candidate.occupancyMask))) throw new Error('Saved placement is invalid');
        occupied.push(candidate.occupancyMask);
        return candidate;
      });
      if (!layout.length) throw new Error('Saved layout is empty');
      const evaluation = core.evaluateLayout(layout, itemById);
      saveHash();
      finishCalculation({
        status: 'saved', proof: 'saved-layout', layout,
        score: evaluation.score, evaluation, elapsedMs: 0, explored: 0
      });
      elements.savedStatus.textContent = record.dataVersion && record.dataVersion !== data.version
        ? '다른 데이터 버전의 배치를 현재 데이터로 다시 계산해 불러왔습니다.'
        : '저장된 배치를 불러왔습니다.';
    } catch (_) { elements.savedStatus.textContent = '현재 데이터에서 이 배치를 복원할 수 없습니다.'; }
  }
  async function copyLink() {
    saveHash();
    const value = location.href;
    try {
      await navigator.clipboard.writeText(value);
      elements.progress.textContent = '입력 링크를 복사했습니다.';
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      elements.progress.textContent = '입력 링크를 복사했습니다.';
    }
  }

  function reset() {
    hideItemInspector(true);
    cancelCalculation('');
    selected.clear();
    elements.search.value = '';
    elements.hero.value = 'all';
    elements.type.value = 'all';
    elements.quality.value = 'standard';
    elements.boardColumns.value = defaultBoard.columns;
    elements.boardRows.value = defaultBoard.rows;
    elements.resultError.textContent = '';
    elements.inputError.textContent = '';
    elements.progress.textContent = '아이템을 추가한 뒤 Calculate를 누르세요.';
    elements.content.hidden = true;
    elements.saveLayout.disabled = true;
    elements.combatResult.hidden = true;
    lastResult = null;
    setManualEdit(false);
    elements.manualToggle.disabled = true;
    renderCatalog();
    renderSelected();
    saveHash();
  }

  populateFilters();
  restoreHash();
  renderCatalog();
  updateBoardPresentation();
  renderSelected();
  renderSavedLayouts();
  [elements.search, elements.hero, elements.type].forEach((element) => element.addEventListener('input', renderCatalog));
  elements.quality.addEventListener('change', saveHash);
  elements.calculate.addEventListener('click', runCalculation);
  [elements.boardColumns, elements.boardRows].forEach((element) => element.addEventListener('change', () => {
    const board = currentBoard();
    elements.boardColumns.value = board.columns;
    elements.boardRows.value = board.rows;
    inputsChanged();
  }));
  elements.cancel.addEventListener('click', () => cancelCalculation());
  elements.reset.addEventListener('click', reset);
  elements.copyLink.addEventListener('click', copyLink);
  elements.combatSimulate.addEventListener('click', runCombatSimulation);
  elements.saveLayout.addEventListener('click', saveCurrentLayout);
  elements.savedName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !elements.saveLayout.disabled) saveCurrentLayout();
  });
  elements.manualToggle.addEventListener('click', () => setManualEdit(!manualEditEnabled));
  elements.rotate.addEventListener('click', rotateSelectedPlacement);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideItemInspector(true);
  });
})();
