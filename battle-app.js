(function () {
  'use strict';

  const core = globalThis.BB_BATTLE_CORE;
  const example = globalThis.BB_BATTLE_EXAMPLE;
  const STORAGE_KEY = 'bb-battle-build-v1';
  const MAIN_THREAD_CHUNK = 40;
  const $ = (id) => document.getElementById(id);

  const elements = {
    round: $('battleRound'), runs: $('battleRuns'), seed: $('battleSeed'),
    run: $('battleRunButton'), cancel: $('battleCancelButton'),
    loadExample: $('battleExampleButton'), clear: $('battleClearButton'),
    progress: $('battleProgress'), error: $('battleError'), sides: $('battleSides'),
    results: $('battleResults'), resultMeta: $('battleResultMeta'), winBar: $('battleWinBar'),
    summary: $('battleSummary'), warnings: $('battleWarnings'), log: $('battleLog'), logMeta: $('battleLogMeta'),
    json: $('battleJson'), jsonApply: $('battleJsonApply'), jsonCopy: $('battleJsonCopy'), jsonStatus: $('battleJsonStatus'),
    itemCount: $('battleItemCount'),
  };

  const groups = core.catalog();
  let state = loadInitialState();
  let keySequence = 0;
  let activeRun = null;

  function emptySide(hero) {
    return { name: hero, hero, heroLevel: 20, healthBonus: 0.5, rows: [] };
  }

  function loadInitialState() {
    try {
      const saved = globalThis.localStorage.getItem(STORAGE_KEY);
      if (saved) return core.fromBuild(JSON.parse(saved));
    } catch (_) { /* 저장된 값을 쓸 수 없으면 예시로 시작한다. */ }
    return core.fromBuild(example);
  }

  function persist() {
    const text = JSON.stringify(core.toBuild(state), null, 2);
    elements.json.value = text;
    try { globalThis.localStorage.setItem(STORAGE_KEY, text); } catch (_) { /* 저장은 편의 기능이다. */ }
  }

  function nextKey() {
    keySequence += 1;
    const used = new Set(state.sides.flatMap((side) => side.rows.map((row) => row.key)));
    while (used.has(`new${keySequence}`)) keySequence += 1;
    return `new${keySequence}`;
  }

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key in node) node[key] = value;
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child != null) node.append(child);
    return node;
  }

  function numberField(label, field, value, min, max) {
    return el('label', { className: 'battle-field' }, [
      el('span', { textContent: label }),
      el('input', { type: 'number', min, max, step: 1, value, dataset: { field } }),
    ]);
  }

  function renderTargets(side, row) {
    const options = core.targetOptions(side.rows, row);
    if (!options.length) return el('p', { className: 'battle-target-empty', textContent: '별 대상으로 고를 수 있는 아이템이 없습니다.' });
    return el('fieldset', { className: 'battle-targets' }, [
      el('legend', { textContent: `별 대상 ${row.stars.length}개` }),
      ...options.map((option) => el('label', { className: 'battle-chip' }, [
        el('input', { type: 'checkbox', checked: row.stars.includes(option.ref), dataset: { target: option.ref } }),
        el('span', { textContent: option.label }),
      ])),
    ]);
  }

  function renderRow(side, row) {
    const info = core.describeItem(row.item);
    const fields = [numberField('레벨', 'level', row.level, 1, 15), numberField('수량', 'count', row.count, 1, 99)];
    if (info.starMode === 'count') fields.push(numberField('활성 별', 'stars', row.stars, 0, 40));
    if (info.usesFanny) fields.push(numberField('Fanny Pack', 'fanny', row.fanny, 0, 12));
    if (info.usesSatchel) fields.push(numberField("Ranger's Satchel", 'satchel', row.satchel, 0, 12));
    if (info.usesInside) fields.push(numberField('내부 아이템', 'inside', row.inside, 0, 40));
    if (info.usesDragonleafInside) fields.push(numberField('내부 Dragonleaf', 'dragonleafInside', row.dragonleafInside, 0, 40));
    return el('li', { className: 'battle-row', dataset: { key: row.key } }, [
      el('div', { className: 'battle-row-head' }, [
        el('strong', { textContent: row.item }),
        el('button', { className: 'button button-quiet', type: 'button', textContent: '삭제', dataset: { action: 'remove' }, ariaLabel: `${row.item} 삭제` }),
      ]),
      el('div', { className: 'battle-row-fields' }, fields),
      info.starMode === 'targets' ? renderTargets(side, row) : null,
    ]);
  }

  function renderSide(side, index) {
    const heroSelect = el('select', { dataset: { sideField: 'hero' } },
      core.HEROES.map((hero) => el('option', { value: hero, textContent: hero, selected: hero === side.hero })));
    const bonusSelect = el('select', { dataset: { sideField: 'healthBonus' } },
      Array.from({ length: 11 }, (_, step) => el('option', {
        value: step * 0.05, textContent: `+${step * 5}%`, selected: Math.abs(step * 0.05 - (side.healthBonus ?? 0.5)) < 1e-9,
      })));
    const addSelect = el('select', { ariaLabel: `진영 ${index + 1}에 추가할 아이템`, dataset: { addSelect: 'true' } },
      groups.map((group) => el('optgroup', { label: group.label },
        group.items.map((name) => el('option', { value: name, textContent: name })))));
    return el('section', { className: 'panel battle-side', dataset: { side: index } }, [
      el('div', { className: 'panel-heading' }, [
        el('div', {}, [
          el('p', { className: 'step-label', textContent: `SIDE ${index + 1}` }),
          el('h2', { textContent: side.name || side.hero }),
        ]),
        el('span', { className: 'battle-meta', textContent: `${side.rows.reduce((sum, row) => sum + row.count, 0)}개 아이템` }),
      ]),
      el('div', { className: 'battle-side-fields' }, [
        el('label', { className: 'battle-field' }, [el('span', { textContent: '이름' }), el('input', { type: 'text', maxLength: 30, value: side.name || '', dataset: { sideField: 'name' } })]),
        el('label', { className: 'battle-field' }, [el('span', { textContent: '영웅' }), heroSelect]),
        el('label', { className: 'battle-field' }, [el('span', { textContent: '영웅 레벨' }), el('input', { type: 'number', min: 1, max: 20, step: 1, value: side.heroLevel ?? 20, dataset: { sideField: 'heroLevel' } })]),
        el('label', { className: 'battle-field' }, [el('span', { textContent: '플레이어 레벨 체력' }), bonusSelect]),
      ]),
      el('div', { className: 'battle-add' }, [
        addSelect,
        el('button', { className: 'button button-secondary', type: 'button', textContent: '아이템 추가', dataset: { action: 'add' } }),
      ]),
      side.rows.length
        ? el('ul', { className: 'battle-rows' }, side.rows.map((row) => renderRow(side, row)))
        : el('p', { className: 'empty-list', textContent: '아이템을 추가하세요.' }),
    ]);
  }

  function render() {
    elements.round.value = state.round;
    elements.sides.replaceChildren(...state.sides.map(renderSide));
    persist();
  }

  function sideOf(node) { return state.sides[Number(node.closest('[data-side]').dataset.side)]; }
  function rowOf(node, side) { return side.rows.find((row) => row.key === node.closest('[data-key]').dataset.key); }

  function handleSideInput(event) {
    const target = event.target;
    const side = sideOf(target);
    if (target.dataset.sideField) {
      const field = target.dataset.sideField;
      side[field] = field === 'name' || field === 'hero' ? target.value : Number(target.value);
      if (field === 'heroLevel') side[field] = Math.max(1, Math.min(20, Math.round(side[field]) || 1));
    } else if (target.dataset.field) {
      rowOf(target, side)[target.dataset.field] = Number(target.value);
    } else if (target.dataset.target) {
      const row = rowOf(target, side);
      const others = row.stars.filter((ref) => ref !== target.dataset.target);
      row.stars = target.checked ? [...others, target.dataset.target] : others;
    } else return;
    persist();
  }

  function handleSideChange(event) {
    const target = event.target;
    if (target.dataset.addSelect) return;
    handleSideInput(event);
    if (target.dataset.field === 'count' || target.dataset.target || target.dataset.sideField === 'name') {
      const sideIndex = target.closest('[data-side]').dataset.side;
      const rowKey = target.closest('[data-key]')?.dataset.key;
      const control = target.dataset.target ? `[data-target="${CSS.escape(target.dataset.target)}"]`
        : target.dataset.field ? `[data-field="${target.dataset.field}"]` : '[data-side-field="name"]';
      const scope = rowKey ? `[data-side="${sideIndex}"] [data-key="${CSS.escape(rowKey)}"]` : `[data-side="${sideIndex}"]`;
      render();
      elements.sides.querySelector(`${scope} ${control}`)?.focus();
    }
  }

  function handleSideClick(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const side = sideOf(button);
    if (button.dataset.action === 'add') {
      const name = button.parentElement.querySelector('select').value;
      side.rows.push(core.createRow(name, nextKey()));
    } else {
      const row = rowOf(button, side);
      side.rows = side.rows.filter((candidate) => candidate !== row);
    }
    render();
  }

  // ── 실행 ──
  function setRunning(running) {
    elements.run.disabled = running;
    elements.cancel.hidden = !running;
  }

  function stopRun() {
    if (activeRun?.worker) activeRun.worker.terminate();
    activeRun = null;
    setRunning(false);
  }

  function failRun(message) {
    stopRun();
    elements.progress.textContent = '';
    elements.error.textContent = message;
  }

  function showProgress(done, total) {
    elements.progress.textContent = `${done.toLocaleString('ko-KR')} / ${total.toLocaleString('ko-KR')}회 실행 중…`;
  }

  function runOnMainThread(run) {
    let batch;
    try { batch = core.createBatch(run.build, run.options); } catch (error) { failRun(error.message); return; }
    const tick = () => {
      if (activeRun !== run) return;
      try {
        if (batch.step(MAIN_THREAD_CHUNK)) { finishRun(batch.finish()); return; }
      } catch (error) { failRun(error.message); return; }
      showProgress(batch.done, batch.runs);
      setTimeout(tick, 0);
    };
    tick();
  }

  function startRun() {
    elements.error.textContent = '';
    state.round = Number(elements.round.value);
    const build = core.toBuild(state);
    if (build.sides.some((side) => !side.items.length)) {
      elements.error.textContent = '양쪽 진영에 아이템을 하나 이상 추가하세요.';
      return;
    }
    const run = { id: `battle-${Date.now()}`, build, options: { runs: Number(elements.runs.value), seed: Number(elements.seed.value) } };
    activeRun = run;
    setRunning(true);
    showProgress(0, run.options.runs);
    if (!globalThis.Worker) { runOnMainThread(run); return; }
    try {
      run.worker = new Worker('battle-worker.js');
      run.worker.onmessage = (event) => {
        const message = event.data;
        if (activeRun !== run || message.requestId !== run.id) return;
        if (message.type === 'progress') showProgress(message.done, message.total);
        else if (message.type === 'complete') finishRun(message.result);
        else failRun(message.message);
      };
      run.worker.onerror = (event) => {
        event.preventDefault?.();
        if (activeRun !== run) return;
        run.worker.terminate();
        run.worker = null;
        runOnMainThread(run);
      };
      run.worker.postMessage({ type: 'run', requestId: run.id, build, options: run.options });
    } catch (_) {
      run.worker = null;
      runOnMainThread(run);
    }
  }

  // ── 결과 ──
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  const seconds = (value) => `${value.toFixed(1)}초`;

  function summaryCard(value, label) {
    return el('article', {}, [el('strong', { textContent: value }), el('span', { textContent: label })]);
  }

  function finishRun(result) {
    stopRun();
    elements.progress.textContent = '';
    const [first, second] = result.names;
    elements.resultMeta.textContent = `${result.runs.toLocaleString('ko-KR')}회 · 시드 ${result.seed}부터`;
    elements.winBar.ariaLabel = `${first} ${percent(result.winRates[0])}, ${second} ${percent(result.winRates[1])}, 무승부 ${percent(result.drawRate)}`;
    elements.winBar.replaceChildren(
      el('span', { className: 'is-first', style: `flex-grow:${result.winRates[0]}` }),
      el('span', { className: 'is-draw', style: `flex-grow:${result.drawRate}` }),
      el('span', { className: 'is-second', style: `flex-grow:${result.winRates[1]}` }),
    );
    const healthText = (index) => (result.averageWinnerHealth[index] == null ? '—' : Math.round(result.averageWinnerHealth[index]).toLocaleString('ko-KR'));
    elements.summary.replaceChildren(
      summaryCard(percent(result.winRates[0]), `${first} 승률`),
      summaryCard(percent(result.winRates[1]), `${second} 승률`),
      summaryCard(percent(result.drawRate), '무승부'),
      summaryCard(seconds(result.time.median), '전투 시간 중앙값'),
      summaryCard(`${seconds(result.time.p10)} – ${seconds(result.time.p90)}`, '전투 시간 10–90%'),
      summaryCard(`${healthText(0)} / ${healthText(1)}`, '승리 시 평균 남은 체력'),
    );
    const warnings = [...result.warnings];
    if (result.overFatigueRate > 0) warnings.unshift(`전투의 ${percent(result.overFatigueRate)}가 ${core.FATIGUE_START}초를 넘었습니다. 피로 피해는 임시 모델이라 이 구간의 결과는 믿기 어렵습니다.`);
    elements.warnings.replaceChildren(...warnings.map((text) => el('li', { textContent: text })));
    elements.warnings.hidden = !warnings.length;
    const winnerName = result.sample.winner === -1 ? '무승부' : `${result.names[result.sample.winner]} 승`;
    elements.logMeta.textContent = `시드 ${result.sample.seed} · ${winnerName} · ${seconds(result.sample.time)}`;
    elements.log.textContent = result.sample.log.map(core.formatLogLine).join('\n');
    elements.results.hidden = false;
    elements.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── JSON ──
  function applyJson() {
    try {
      state = core.fromBuild(JSON.parse(elements.json.value));
      render();
      elements.jsonStatus.textContent = '적용했습니다.';
    } catch (error) {
      elements.jsonStatus.textContent = `적용 실패: ${error.message}`;
    }
  }

  async function copyJson() {
    try {
      await globalThis.navigator.clipboard.writeText(elements.json.value);
      elements.jsonStatus.textContent = '복사했습니다.';
    } catch (_) {
      elements.json.select();
      elements.jsonStatus.textContent = '자동 복사를 사용할 수 없어 텍스트를 선택했습니다.';
    }
  }

  elements.itemCount.textContent = String(groups.reduce((sum, group) => sum + group.items.length, 0));
  elements.sides.addEventListener('input', handleSideInput);
  elements.sides.addEventListener('change', handleSideChange);
  elements.sides.addEventListener('click', handleSideClick);
  elements.round.addEventListener('change', () => { state.round = Number(elements.round.value); persist(); });
  elements.run.addEventListener('click', startRun);
  elements.cancel.addEventListener('click', () => { stopRun(); elements.progress.textContent = '취소했습니다.'; });
  elements.loadExample.addEventListener('click', () => { state = core.fromBuild(example); render(); });
  elements.clear.addEventListener('click', () => { state = { round: state.round, sides: [emptySide('Harkon'), emptySide('Nymphedora')] }; render(); });
  elements.jsonApply.addEventListener('click', applyJson);
  elements.jsonCopy.addEventListener('click', copyJson);
  render();
})();
