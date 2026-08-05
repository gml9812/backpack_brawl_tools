(function () {
  'use strict';

  const data = globalThis.BB_OPTIMIZER_DATA;
  const solver = globalThis.BBOptimizerSolver;
  const $ = (id) => document.getElementById(id);
  const itemById = Object.fromEntries(data.items.map((item) => [item.id, item]));
  const selected = new Map();
  const qualityTimes = { fast: 1000, standard: 5000, thorough: 20000 };
  let activeWorker = null;
  let requestSequence = 0;
  let activeRequestId = null;
  let lastResult = null;
  let selectedPlacementId = null;

  const elements = {
    version: $('optimizerDataVersion'), verified: $('optimizerVerifiedOn'),
    search: $('optimizerSearchInput'), hero: $('optimizerHeroFilter'), type: $('optimizerTypeFilter'),
    catalog: $('optimizerCatalog'), catalogCount: $('optimizerCatalogCount'),
    selectedList: $('optimizerSelectedList'), selectionSummary: $('optimizerSelectionSummary'),
    quality: $('optimizerQualitySelect'), calculate: $('optimizerCalculateButton'), cancel: $('optimizerCancelButton'),
    reset: $('optimizerResetButton'), inputError: $('optimizerInputError'), resultError: $('optimizerResultError'),
    progress: $('optimizerProgress'), content: $('optimizerResultContent'), board: $('optimizerBoard'),
    status: $('optimizerStatus'), connections: $('optimizerConnectionScore'), groups: $('optimizerGroupScore'),
    contributing: $('optimizerContributingScore'), elapsed: $('optimizerElapsed'), explored: $('optimizerExplored'),
    details: $('optimizerConnectionDetails'), selectedPlacement: $('optimizerSelectedPlacement'),
    copyLink: $('optimizerCopyLinkButton'), sources: $('optimizerSourceList')
  };

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
  }

  function inputsChanged() {
    if (activeWorker) cancelCalculation('입력이 변경되어 계산을 취소했습니다.');
    lastResult = null;
    selectedPlacementId = null;
    elements.content.hidden = true;
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
    elements.calculate.disabled = calculating || !totalCount() || totalArea() > 54;
    elements.quality.disabled = calculating;
  }

  function runCalculation() {
    if (!totalCount() || totalArea() > 54) return;
    cancelCalculation('');
    elements.resultError.textContent = '';
    elements.content.hidden = true;
    const instances = expandedInstances();
    const requestId = `optimizer-${Date.now()}-${++requestSequence}`;
    activeRequestId = requestId;
    const options = {
      timeLimitMs: qualityTimes[elements.quality.value],
      seed: instances.map((entry) => entry.itemId).join('|'),
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
          if (instances.length <= 8) runOnMainThread(instances, options, requestId);
          else failCalculation('Worker를 시작할 수 없습니다. file:// Worker를 지원하는 최신 브라우저에서 다시 시도하세요.');
        };
        activeWorker.postMessage({ type: 'solve', requestId, instances, options, items: data.items, board: data.board, dataVersion: data.version });
        return;
      } catch (_) { cleanupWorker(); }
    }
    if (instances.length <= 8) runOnMainThread(instances, options, requestId);
    else failCalculation('이 브라우저에서는 Worker를 사용할 수 없어 8개 이하 입력만 fallback 계산할 수 있습니다.');
  }

  function runOnMainThread(instances, options, requestId) {
    elements.progress.textContent = '작은 입력을 호환 모드로 계산 중…';
    setTimeout(() => {
      try {
        const result = solver.solve({ instances, items: data.items, board: data.board, options });
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
      'area-exceeded': 'Area exceeds 54 cells', 'item-does-not-fit': 'Item does not fit', cancelled: 'Cancelled'
    };
    return labels[result.status] || result.status;
  }

  function finishCalculation(result) {
    activeRequestId = null;
    setCalculating(false);
    lastResult = result;
    selectedPlacementId = null;
    elements.progress.textContent = result.status === 'optimal'
      ? '전체 탐색을 완료해 최적임을 증명했습니다.'
      : result.status === 'best-found' ? '시간 제한까지 찾은 가장 좋은 배치입니다. 최적임이 증명되지는 않았습니다.'
        : statusLabel(result);
    if (!result.layout?.length) {
      elements.content.hidden = true;
      elements.resultError.textContent = statusLabel(result);
      return;
    }
    elements.content.hidden = false;
    elements.status.textContent = statusLabel(result);
    elements.connections.textContent = result.score.validConnections;
    elements.groups.textContent = `${result.score.activeGroups} / ${result.evaluation.totalGroups}`;
    elements.contributing.textContent = `${result.score.contributingTargets} / ${result.layout.length}`;
    elements.elapsed.textContent = `${(result.elapsedMs / 1000).toFixed(2)}s`;
    elements.explored.textContent = result.explored.toLocaleString('ko-KR');
    renderBoard();
    renderDetails();
  }

  function activeTargetsFor(instanceId) {
    if (!lastResult || !instanceId) return new Set();
    return new Set(lastResult.evaluation.connections
      .filter((connection) => connection.sourceInstanceId === instanceId)
      .map((connection) => connection.targetInstanceId));
  }

  function renderBoard() {
    elements.board.replaceChildren();
    for (let index = 0; index < 54; index += 1) {
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
      button.style.left = `${placement.x / 6 * 100}%`;
      button.style.top = `${placement.y / 9 * 100}%`;
      button.style.width = `${placement.width / 6 * 100}%`;
      button.style.height = `${placement.height / 9 * 100}%`;
      button.setAttribute('aria-label', `${placement.instanceId}, rotation ${placement.rotation} degrees, column ${placement.x + 1}, row ${placement.y + 1}`);
      appendImage(button, item);
      const image = button.querySelector('img');
      if (image) image.style.transform = `rotate(${placement.rotation}deg)`;
      button.addEventListener('click', () => {
        selectedPlacementId = selectedPlacementId === placement.instanceId ? null : placement.instanceId;
        renderBoard();
        renderDetails();
      });
      elements.board.append(button);
    });
    renderStarMarkers();
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
          if (x < 0 || y < 0 || x >= 6 || y >= 9) return;
          const key = `${x},${y}`;
          const record = aggregate.get(key) || { x, y, count: 0, active: false, sources: new Set() };
          record.count += 1;
          const cell = 1n << BigInt(y * 6 + x);
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
      marker.style.left = `${record.x / 6 * 100}%`;
      marker.style.top = `${record.y / 9 * 100}%`;
      marker.style.width = `${100 / 6}%`;
      marker.style.height = `${100 / 9}%`;
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
    cancelCalculation('');
    selected.clear();
    elements.search.value = '';
    elements.hero.value = 'all';
    elements.type.value = 'all';
    elements.quality.value = 'standard';
    elements.resultError.textContent = '';
    elements.inputError.textContent = '';
    elements.progress.textContent = '아이템을 추가한 뒤 Calculate를 누르세요.';
    elements.content.hidden = true;
    renderCatalog();
    renderSelected();
    saveHash();
  }

  populateFilters();
  restoreHash();
  renderCatalog();
  renderSelected();
  [elements.search, elements.hero, elements.type].forEach((element) => element.addEventListener('input', renderCatalog));
  elements.quality.addEventListener('change', saveHash);
  elements.calculate.addEventListener('click', runCalculation);
  elements.cancel.addEventListener('click', () => cancelCalculation());
  elements.reset.addEventListener('click', reset);
  elements.copyLink.addEventListener('click', copyLink);
})();
