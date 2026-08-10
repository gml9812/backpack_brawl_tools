(function () {
  'use strict';

  const data = globalThis.BB_OPTIMIZER_DATA;
  const core = globalThis.BBOptimizerCore;
  const combatSimulator = globalThis.BB_COMBAT_SIMULATOR;
  const storageApi = globalThis.BB_OPTIMIZER_STORAGE;
  const itemById = Object.fromEntries(data.items.map((item) => [item.id, item]));
  const $ = (id) => document.getElementById(id);
  const elements = {
    version: $('simulatorDataVersion'), verified: $('simulatorVerifiedOn'),
    savedStatus: $('simulatorSavedStatus'), savedList: $('simulatorSavedList'),
    empty: $('simulatorEmpty'), content: $('simulatorContent'), save: $('simulatorSaveChanges'),
    name: $('simulatorLayoutName'), meta: $('simulatorLayoutMeta'), editStatus: $('simulatorEditStatus'),
    connections: $('simulatorConnectionScore'), groups: $('simulatorGroupScore'),
    contributing: $('simulatorContributingScore'), board: $('simulatorBoard'),
    selection: $('simulatorSelection'), rotate: $('simulatorRotate'),
    combatDuration: $('combatDuration'), combatArmor: $('combatDummyArmor'),
    combatReduction: $('combatDummyReduction'), combatDodge: $('combatDummyDodge'),
    combatRun: $('combatSimulateButton'), combatResult: $('combatSimulationResult'),
    combatDamage: $('combatTotalDamage'), combatDps: $('combatDps'), combatHits: $('combatExpectedHits'),
    combatCrits: $('combatExpectedCrits'), combatBuffs: $('combatBuffList'),
    combatDebuffs: $('combatDebuffList'), combatContributions: $('combatContributionList'),
    combatCoverage: $('combatCoverage')
  };

  let currentRecord = null;
  let layout = [];
  let evaluation = null;
  let selectedInstanceId = null;
  let dragState = null;
  let suppressClick = false;

  elements.version.textContent = data.version;
  elements.verified.textContent = data.verifiedOn;

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
  }

  function readRecords() {
    try { return storageApi.read(globalThis.localStorage); }
    catch (_) {
      elements.savedStatus.textContent = '이 브라우저에서는 로컬 저장소를 사용할 수 없습니다.';
      return [];
    }
  }

  function clearWorkspace() {
    currentRecord = null;
    layout = [];
    evaluation = null;
    selectedInstanceId = null;
    elements.empty.hidden = false;
    elements.content.hidden = true;
    elements.save.disabled = true;
  }

  function renderSavedList() {
    const records = readRecords();
    elements.savedList.replaceChildren();
    if (!records.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = '저장된 배치가 없습니다. Star Optimizer에서 배치를 먼저 저장하세요.';
      elements.savedList.append(empty);
      return records;
    }
    records.forEach((record) => {
      const card = document.createElement('article');
      card.className = 'saved-layout-card' + (record.id === currentRecord?.id ? ' is-current' : '');
      const body = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = record.name;
      const date = new Date(record.createdAt);
      const meta = document.createElement('small');
      meta.textContent = record.board.columns + 'x' + record.board.rows + ' · ' + record.layout.length + ' items · '
        + (Number.isNaN(date.getTime()) ? record.createdAt : date.toLocaleString('ko-KR'));
      body.append(title, meta);
      const actions = document.createElement('div');
      actions.className = 'saved-layout-actions';
      const load = document.createElement('button');
      load.type = 'button';
      load.className = 'button button-secondary';
      load.textContent = '불러오기';
      load.addEventListener('click', () => loadRecord(record));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button-quiet';
      remove.textContent = '삭제';
      remove.addEventListener('click', () => {
        if (!globalThis.confirm('이 저장된 배치를 삭제할까요?')) return;
        try {
          storageApi.remove(globalThis.localStorage, record.id);
          if (currentRecord?.id === record.id) clearWorkspace();
          elements.savedStatus.textContent = '저장된 배치를 삭제했습니다.';
          renderSavedList();
        } catch (_) { elements.savedStatus.textContent = '저장된 배치를 삭제하지 못했습니다.'; }
      });
      actions.append(load, remove);
      card.append(body, actions);
      elements.savedList.append(card);
    });
    return records;
  }

  function reviveLayout(record) {
    const masks = [];
    return record.layout.map((saved) => {
      const item = itemById[saved.itemId];
      if (!item?.selectable) throw new Error('Saved item unavailable');
      const placement = core.buildPlacementAt(
        { instanceId: saved.instanceId, itemId: saved.itemId }, item, record.board,
        saved.x, saved.y, saved.rotation
      );
      if (!placement || masks.some((mask) => core.masksOverlap(mask, placement.occupancyMask))) {
        throw new Error('Saved placement invalid');
      }
      masks.push(placement.occupancyMask);
      return placement;
    });
  }

  function loadRecord(record) {
    try {
      const revived = reviveLayout(record);
      currentRecord = record;
      layout = revived;
      evaluation = core.evaluateLayout(layout, itemById);
      selectedInstanceId = null;
      elements.empty.hidden = true;
      elements.content.hidden = false;
      elements.save.disabled = true;
      elements.name.textContent = record.name;
      elements.meta.textContent = record.board.columns + 'x' + record.board.rows + ' · data ' + (record.dataVersion || 'unknown');
      elements.editStatus.textContent = '아이템을 드래그해 이동하거나 선택 후 회전할 수 있습니다.';
      renderWorkspace();
      renderSavedList();
      runCombatSimulation();
      elements.savedStatus.textContent = record.dataVersion && record.dataVersion !== data.version
        ? '다른 데이터 버전의 배치를 현재 데이터로 다시 계산했습니다.' : '저장된 배치를 불러왔습니다.';
    } catch (_) { elements.savedStatus.textContent = '현재 데이터에서 이 배치를 복원할 수 없습니다.'; }
  }

  function appendImage(parent, item) {
    if (!item.image) return;
    const image = document.createElement('img');
    image.src = item.image;
    image.alt = '';
    image.draggable = false;
    image.addEventListener('error', () => { image.hidden = true; }, { once: true });
    parent.append(image);
  }

  function appendFootprint(parent, placement) {
    const occupied = new Set(placement.footprint.map(([x, y]) => x + ',' + y));
    const neighbors = [[0, -1, 'top'], [1, 0, 'right'], [0, 1, 'bottom'], [-1, 0, 'left']];
    placement.footprint.forEach(([x, y]) => {
      const cell = document.createElement('span');
      cell.className = 'placed-item-cell';
      neighbors.forEach(([dx, dy, edge]) => {
        if (!occupied.has((x + dx) + ',' + (y + dy))) cell.classList.add('is-edge-' + edge);
      });
      cell.style.left = x / placement.width * 100 + '%';
      cell.style.top = y / placement.height * 100 + '%';
      cell.style.width = 100 / placement.width + '%';
      cell.style.height = 100 / placement.height + '%';
      parent.append(cell);
    });
  }

  function renderWorkspace() {
    elements.connections.textContent = evaluation.score.validConnections;
    elements.groups.textContent = evaluation.score.activeGroups + ' / ' + evaluation.totalGroups;
    elements.contributing.textContent = evaluation.score.contributingTargets + ' / ' + layout.length;
    renderBoard();
    const selected = layout.find((placement) => placement.instanceId === selectedInstanceId);
    elements.selection.textContent = selected
      ? itemById[selected.itemId].name + ' · ' + selected.rotation + '°'
      : '회전할 아이템을 선택하세요';
    const rotations = selected ? [...new Set(itemById[selected.itemId].rotations || [0, 90, 180, 270])] : [];
    elements.rotate.disabled = !selected || rotations.length < 2;
  }

  function renderBoard() {
    const board = currentRecord.board;
    elements.board.replaceChildren();
    elements.board.style.setProperty('--board-columns', board.columns);
    elements.board.style.setProperty('--board-rows', board.rows);
    elements.board.setAttribute('aria-label', board.columns + 'x' + board.rows + ' 저장된 배치 편집 보드');
    for (let index = 0; index < board.columns * board.rows; index += 1) {
      const cell = document.createElement('span');
      cell.className = 'optimizer-cell';
      cell.setAttribute('aria-hidden', 'true');
      elements.board.append(cell);
    }
    layout.forEach((placement) => {
      const item = itemById[placement.itemId];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'placed-item' + (placement.instanceId === selectedInstanceId ? ' is-source' : '');
      button.style.left = placement.x / board.columns * 100 + '%';
      button.style.top = placement.y / board.rows * 100 + '%';
      button.style.width = placement.width / board.columns * 100 + '%';
      button.style.height = placement.height / board.rows * 100 + '%';
      button.setAttribute('aria-label', placement.instanceId + ', rotation ' + placement.rotation + ' degrees');
      appendImage(button, item);
      appendFootprint(button, placement);
      const image = button.querySelector('img');
      if (image) image.style.transform = 'rotate(' + placement.rotation + 'deg)';
      button.addEventListener('click', () => {
        if (suppressClick) { suppressClick = false; return; }
        selectedInstanceId = placement.instanceId;
        renderWorkspace();
      });
      button.addEventListener('pointerdown', (event) => {
        if (event.button != null && event.button !== 0) return;
        const rect = elements.board.getBoundingClientRect();
        selectedInstanceId = placement.instanceId;
        dragState = {
          instanceId: placement.instanceId, startX: event.clientX, startY: event.clientY,
          offsetX: Math.floor((event.clientX - rect.left) / (rect.width / board.columns)) - placement.x,
          offsetY: Math.floor((event.clientY - rect.top) / (rect.height / board.rows)) - placement.y,
          dragging: false
        };
        try { button.setPointerCapture(event.pointerId); } catch (_) { /* optional */ }
      });
      button.addEventListener('pointermove', (event) => {
        if (!dragState || dragState.instanceId !== placement.instanceId) return;
        if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 5) {
          dragState.dragging = true;
          button.classList.add('is-dragging');
        }
      });
      button.addEventListener('pointerup', (event) => {
        if (!dragState || dragState.instanceId !== placement.instanceId) return;
        const drag = dragState;
        dragState = null;
        if (!drag.dragging) return;
        const rect = elements.board.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / (rect.width / board.columns)) - drag.offsetX;
        const y = Math.floor((event.clientY - rect.top) / (rect.height / board.rows)) - drag.offsetY;
        suppressClick = true;
        applyPlacement(x, y, placement.rotation);
      });
      button.addEventListener('pointercancel', () => { dragState = null; });
      elements.board.append(button);
    });
    renderStarMarkers();
  }

  function renderStarMarkers() {
    const board = currentRecord.board;
    const targets = new Map();
    evaluation.connections.forEach((connection) => {
      const key = connection.sourceInstanceId + '|' + connection.groupId;
      targets.set(key, (targets.get(key) || 0) + 1);
    });
    layout.forEach((placement) => {
      placement.starGroups.forEach((group) => {
        group.offsets.forEach(([dx, dy]) => {
          const x = placement.x + dx;
          const y = placement.y + dy;
          if (x < 0 || y < 0 || x >= board.columns || y >= board.rows) return;
          const marker = document.createElement('span');
          marker.className = 'star-marker' + (targets.has(placement.instanceId + '|' + group.id) ? ' is-active' : '');
          marker.style.left = x / board.columns * 100 + '%';
          marker.style.top = y / board.rows * 100 + '%';
          marker.style.width = 100 / board.columns + '%';
          marker.style.height = 100 / board.rows + '%';
          marker.textContent = targets.has(placement.instanceId + '|' + group.id) ? '★' : '☆';
          elements.board.append(marker);
        });
      });
    });
  }

  function applyPlacement(x, y, rotation) {
    const current = layout.find((placement) => placement.instanceId === selectedInstanceId);
    if (!current) return false;
    const item = itemById[current.itemId];
    const candidate = core.buildPlacementAt(
      { instanceId: current.instanceId, itemId: current.itemId }, item, currentRecord.board, x, y, rotation
    );
    const overlaps = candidate && layout.some((placement) =>
      placement.instanceId !== current.instanceId && core.masksOverlap(placement.occupancyMask, candidate.occupancyMask));
    if (!candidate || overlaps) {
      elements.editStatus.textContent = !candidate ? '보드 밖으로 이동할 수 없습니다.' : '다른 아이템과 겹치는 위치입니다.';
      return false;
    }
    layout = layout.map((placement) => placement.instanceId === current.instanceId ? candidate : placement);
    evaluation = core.evaluateLayout(layout, itemById);
    elements.editStatus.textContent = '배치를 수정했습니다. 전투 결과를 다시 계산했습니다.';
    elements.save.disabled = false;
    renderWorkspace();
    runCombatSimulation();
    return true;
  }

  function rotateSelected() {
    const placement = layout.find((entry) => entry.instanceId === selectedInstanceId);
    if (!placement) return;
    const rotations = [...new Set(itemById[placement.itemId].rotations || [0, 90, 180, 270])];
    const index = rotations.indexOf(placement.rotation);
    applyPlacement(placement.x, placement.y, rotations[(index + 1) % rotations.length]);
  }

  function saveChanges() {
    if (!currentRecord || !layout.length) return;
    const updated = {
      ...currentRecord,
      dataVersion: data.version,
      layout: layout.map(({ instanceId, itemId, x, y, rotation }) => ({ instanceId, itemId, x, y, rotation })),
      score: evaluation.score
    };
    try {
      storageApi.save(globalThis.localStorage, updated);
      currentRecord = storageApi.read(globalThis.localStorage).find((record) => record.id === updated.id) || updated;
      elements.save.disabled = true;
      elements.savedStatus.textContent = '수정한 배치를 저장했습니다.';
      renderSavedList();
    } catch (_) { elements.savedStatus.textContent = '변경사항을 저장하지 못했습니다.'; }
  }

  function renderMetrics(list, metrics, emptyMessage) {
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
      entry.textContent = label + ' +' + formatNumber(amount);
      list.append(entry);
    });
  }

  function runCombatSimulation() {
    if (!layout.length || !evaluation) return;
    const result = combatSimulator.simulate({
      layout, items: data.items, evaluation,
      duration: elements.combatDuration.value,
      dummy: { armor: elements.combatArmor.value, reduction: elements.combatReduction.value, dodge: elements.combatDodge.value }
    });
    elements.combatDamage.textContent = formatNumber(result.damage);
    elements.combatDps.textContent = formatNumber(result.dps);
    elements.combatHits.textContent = formatNumber(result.expectedHits);
    elements.combatCrits.textContent = formatNumber(result.expectedCrits);
    renderMetrics(elements.combatBuffs, result.buffs, '계산된 버프 없음');
    renderMetrics(elements.combatDebuffs, result.debuffs, '계산된 디버프 없음');
    elements.combatContributions.replaceChildren();
    if (!result.contributions.length) {
      const empty = document.createElement('li');
      empty.className = 'inactive';
      empty.textContent = '계산 가능한 직접 피해 없음';
      elements.combatContributions.append(empty);
    } else {
      result.contributions.forEach((contribution) => {
        const entry = document.createElement('li');
        entry.textContent = contribution.name + ': ' + formatNumber(contribution.damage);
        elements.combatContributions.append(entry);
      });
    }
    elements.combatCoverage.textContent = result.supportedItems + ' / ' + layout.length + '개 아이템에 combat 데이터가 있습니다. '
      + result.recognizedEffects + '개 효과 절을 계산했고 ' + result.unsupportedEffects + '개는 초안 범위 밖이라 제외했습니다.';
    elements.combatResult.hidden = false;
  }

  elements.rotate.addEventListener('click', rotateSelected);
  elements.save.addEventListener('click', saveChanges);
  elements.combatRun.addEventListener('click', runCombatSimulation);
  const records = renderSavedList();
  if (records.length) loadRecord(records[0]);
  else clearWorkspace();
})();
