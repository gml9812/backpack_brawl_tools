(function () {
  'use strict';

  const data = window.BB_DATA;
  const engine = window.BBCalculator;
  const STORAGE_KEY = 'backpack-brawl-shop-odds:v1';
  const $ = (id) => document.getElementById(id);

  const elements = {
    form: $('calculatorForm'), calculate: $('calculateButton'), calculateStatus: $('calculateStatus'), reset: $('resetButton'),
    hero: $('heroSelect'), round: $('roundInput'), rerolls: $('rerollsInput'), lockedSlots: $('lockedSlotsInput'),
    lucky: $('luckyCloverInput'), golden: $('goldenCloverInput'), cursed: $('cursedCloverInput'),
    upgradeChance: $('upgradeChanceInput'), downgradeChance: $('downgradeChanceInput'), bagPity: $('bagPityInput'),
    seenCount: $('seenCountInput'), repeatMultiplier: $('repeatMultiplierInput'), targetBoost: $('targetBoostInput'),
    targetWeight: $('targetWeightInput'), saleOnly: $('saleOnlyInput'), saleChance: $('saleChanceInput'),
    paidRerolls: $('paidRerollsInput'), freeRerolls: $('freeRerollsInput'),
    itemPickerButton: $('itemPickerButton'), selectedItemName: $('selectedItemName'), selectedItemMeta: $('selectedItemMeta'),
    itemDialog: $('itemDialog'), itemSearch: $('itemSearchInput'), rarityFilter: $('rarityFilter'), itemList: $('itemList'),
    itemResultCount: $('itemResultCount'), customName: $('customItemName'), customRarity: $('customItemRarity'),
    customError: $('customItemError'), addCustom: $('addCustomItemButton'), poolDialog: $('poolDialog'),
    poolEditor: $('poolEditorButton'), poolList: $('poolList'), poolSearch: $('poolSearchInput'), restorePool: $('restorePoolButton'),
    poolSummary: $('poolSummary'), rarityPreview: $('rarityPreview'), activeCount: $('activeSettingsCount'),
    formError: $('formError'), itemError: $('itemError'), emptyResults: $('emptyResults'), resultContent: $('resultContent'),
    staleNotice: $('staleNotice'), diagnostic: $('diagnosticNotice'), method: $('resultMethod'),
    cumulativeProbability: $('cumulativeProbability'), cumulativeOdds: $('cumulativeOdds'), confidence: $('confidenceInterval'),
    slotProbability: $('slotProbability'), shopProbability: $('shopProbability'), expectedRerolls: $('expectedRerolls'),
    totalGold: $('totalGold'), expectedGold: $('expectedGold'), conditionSummary: $('conditionSummary'),
    assumptionList: $('assumptionList'), sourceList: $('sourceList'), dataVersion: $('dataVersion'), verifiedOn: $('verifiedOn')
  };

  let items = data.items.map((item) => ({ ...item }));
  let selectedItemId = null;
  let lastCalculatedSignature = null;
  let saveTimer = 0;
  let activeWorker = null;

  function titleCase(value) {
    if (value === 'any') return 'Any / No hero filtering';
    if (value === 'hob') return 'Hob Gang';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function rarityClass(rarity) {
    return `rarity-${rarity.toLowerCase()}`;
  }

  function itemById(id) {
    return items.find((item) => item.id === id) || null;
  }

  function createImage(item, className) {
    const image = document.createElement('img');
    image.src = item.image;
    image.alt = '';
    if (className) image.className = className;
    image.addEventListener('error', () => {
      image.replaceWith(createPlaceholder(item));
    }, { once: true });
    return image;
  }

  function createPlaceholder(item) {
    const span = document.createElement('span');
    span.className = `item-placeholder ${rarityClass(item.rarity)}`;
    span.textContent = item.name.slice(0, 1).toUpperCase();
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  function populateStaticUi() {
    elements.dataVersion.textContent = data.version;
    elements.verifiedOn.textContent = data.verifiedOn;
    elements.hero.innerHTML = data.heroes.map((hero) => `<option value="${hero}">${titleCase(hero)}</option>`).join('');
    const rarityOptions = data.rarities.map((rarity) => `<option value="${rarity}">${rarity}</option>`).join('');
    elements.rarityFilter.insertAdjacentHTML('beforeend', rarityOptions);
    if (elements.customRarity) elements.customRarity.innerHTML = rarityOptions;
    elements.sourceList.innerHTML = data.sources.map((source) => {
      const url = new URL(source.url);
      return `<li><a href="${url.href}" target="_blank" rel="noreferrer">${escapeHtml(source.label)}</a></li>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[character]);
  }

  function renderRarityPreview() {
    const round = clampInt(elements.round.value, 1, data.roundOdds.length);
    const odds = data.roundOdds[round - 1];
    elements.rarityPreview.innerHTML = data.rarities.map((rarity, index) =>
      `<span class="rarity-chip ${rarityClass(rarity)}">${rarity} ${odds[index]}%</span>`
    ).join('');
  }

  function selectedItem() {
    return itemById(selectedItemId);
  }

  function updateSelectedItemUi() {
    const item = selectedItem();
    const oldVisual = elements.itemPickerButton.firstElementChild;
    if (!item) {
      const placeholder = document.createElement('span');
      placeholder.className = 'item-placeholder';
      placeholder.textContent = '?';
      placeholder.setAttribute('aria-hidden', 'true');
      oldVisual.replaceWith(placeholder);
      elements.selectedItemName.textContent = '아이템 선택';
      elements.selectedItemMeta.textContent = '영문명으로 검색할 수 있습니다';
      elements.calculate.disabled = true;
      return;
    }
    oldVisual.replaceWith(item.custom ? createPlaceholder(item) : createImage(item, 'selected-image'));
    elements.selectedItemName.textContent = item.name;
    elements.selectedItemMeta.textContent = `${item.rarity} · ${item.hero === 'shared' ? 'Shared' : titleCase(item.hero)}`;
    elements.calculate.disabled = false;
    if (elements.targetWeight) elements.targetWeight.value = String(item.weight || 1);
  }

  function matchesCurrentHero(item) {
    const hero = elements.hero.value;
    return item.hero === 'shared' || hero === 'any' || item.hero === hero;
  }

  function renderItemList() {
    const query = elements.itemSearch.value.trim().toLowerCase();
    const rarity = elements.rarityFilter.value;
    const filtered = items.filter((item) => {
      return matchesCurrentHero(item) && (rarity === 'all' || item.rarity === rarity) && item.name.toLowerCase().includes(query);
    }).sort((a, b) => data.rarities.indexOf(a.rarity) - data.rarities.indexOf(b.rarity) || a.name.localeCompare(b.name));
    elements.itemResultCount.textContent = `${filtered.length} items`;
    elements.itemList.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = '검색 결과가 없습니다.';
      elements.itemList.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of filtered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'item-row';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(item.id === selectedItemId));
      button.append(item.custom ? createPlaceholder(item) : createImage(item));
      const copy = document.createElement('span');
      copy.className = 'item-row-copy';
      const strong = document.createElement('strong');
      strong.textContent = item.name;
      const small = document.createElement('small');
      small.textContent = `${item.rarity} · ${item.hero === 'shared' ? 'Shared' : titleCase(item.hero)}`;
      copy.append(strong, small);
      const badge = document.createElement('span');
      badge.className = `rarity-badge ${rarityClass(item.rarity)}`;
      badge.textContent = item.rarity;
      button.append(copy, badge);
      button.addEventListener('click', () => chooseItem(item));
      fragment.append(button);
    }
    elements.itemList.append(fragment);
  }

  function chooseItem(item) {
    selectedItemId = item.id;
    if (item.hero !== 'shared') elements.hero.value = item.hero;
    item.status = 'available';
    updateSelectedItemUi();
    updatePoolSummary();
    elements.itemDialog.close();
    markInputsChanged();
  }

  function addCustomItem() {
    const name = elements.customName.value.trim();
    if (!/^[\x20-\x7E]{2,80}$/.test(name)) {
      elements.customError.textContent = '2~80자의 영문 이름을 입력하세요.';
      return;
    }
    const id = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Date.now()}`;
    const item = { id, name, rarity: elements.customRarity.value, hero: 'shared', bag: false, status: 'available', weight: 1, image: '', custom: true };
    items.push(item);
    elements.customError.textContent = '';
    elements.customName.value = '';
    chooseItem(item);
  }

  function eligiblePoolItems() {
    const hero = elements.hero.value;
    return items.filter((item) => item.hero === 'shared' || (hero !== 'any' && item.hero === hero));
  }

  function renderPoolList() {
    const query = elements.poolSearch.value.trim().toLowerCase();
    const pool = eligiblePoolItems().filter((item) => item.name.toLowerCase().includes(query));
    elements.poolList.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const item of pool) {
      const row = document.createElement('div');
      row.className = 'pool-row';
      row.append(item.custom ? createPlaceholder(item) : createImage(item));
      const name = document.createElement('strong');
      name.textContent = item.name;
      const select = document.createElement('select');
      select.setAttribute('aria-label', `${item.name} 상태`);
      select.innerHTML = '<option value="available">Available</option><option value="unavailable">Unavailable</option><option value="banished">Banished</option>';
      select.value = item.status || 'available';
      if (item.id === selectedItemId) {
        select.value = 'available';
        select.disabled = true;
        select.title = '목표 아이템은 Available로 유지됩니다.';
      }
      select.addEventListener('change', () => {
        item.status = select.value;
        updatePoolSummary();
        markInputsChanged();
      });
      row.append(name, select);
      fragment.append(row);
    }
    elements.poolList.append(fragment);
  }

  function updatePoolSummary() {
    const pool = eligiblePoolItems();
    const available = pool.filter((item) => item.status === 'available').length;
    elements.poolSummary.textContent = `${available} / ${pool.length} Available`;
  }

  function syncCloverTotals() {
    elements.upgradeChance.value = String(clampInt(elements.lucky.value, 0, 16) * data.mechanics.luckyCloverUpgrade
      + clampInt(elements.golden.value, 0, 12) * data.mechanics.goldenCloverUpgrade);
    elements.downgradeChance.value = String(clampInt(elements.cursed.value, 0, 16) * data.mechanics.cursedCloverDowngrade);
  }

  function gatherInput() {
    const target = selectedItem();
    if (target && elements.targetWeight) target.weight = clampNumber(elements.targetWeight.value, .01, 100);
    return {
      target,
      items,
      hero: elements.hero.value,
      round: clampInt(elements.round.value, 1, data.roundOdds.length),
      rerolls: clampInt(elements.rerolls.value, 1, 100),
      openSlots: data.mechanics.shopSlots - clampInt(elements.lockedSlots.value, 0, 4),
      upgradeChance: clampNumber(elements.upgradeChance.value, 0, 500),
      downgradeChance: clampNumber(elements.downgradeChance.value, 0, 500),
      bagPity: clampInt(elements.bagPity.value, 0, 10),
      seenCount: clampInt(elements.seenCount.value, 0, 99),
      repeatMultiplier: clampNumber(elements.repeatMultiplier.value, .01, 1),
      targetBoost: clampNumber(elements.targetBoost.value, 0, 100),
      saleOnly: elements.saleOnly.checked,
      saleChance: clampNumber(elements.saleChance.value, 0, 100),
      paidRerolls: clampInt(elements.paidRerolls.value, 0, 99),
      freeRerolls: clampInt(elements.freeRerolls.value, 0, 99)
    };
  }

  function validateForm() {
    elements.itemError.textContent = '';
    elements.formError.textContent = '';
    if (!selectedItem()) {
      elements.itemError.textContent = '목표 아이템을 선택하세요.';
      elements.itemPickerButton.focus();
      return false;
    }
    const numericInputs = elements.form.querySelectorAll('input[type="number"]');
    for (const input of numericInputs) {
      if (!input.checkValidity() || input.value === '') {
        elements.formError.textContent = '입력 범위를 확인하세요.';
        input.focus();
        return false;
      }
    }
    return true;
  }

  function calculationSignature(input) {
    return JSON.stringify({
      target: input.target && input.target.id, hero: input.hero, round: input.round, rerolls: input.rerolls,
      openSlots: input.openSlots, upgradeChance: input.upgradeChance, downgradeChance: input.downgradeChance,
      bagPity: input.bagPity, seenCount: input.seenCount, repeatMultiplier: input.repeatMultiplier,
      targetBoost: input.targetBoost, targetWeight: input.target && input.target.weight, saleOnly: input.saleOnly,
      saleChance: input.saleChance, paidRerolls: input.paidRerolls, freeRerolls: input.freeRerolls,
      statuses: input.items.filter((item) => item.status !== 'available').map((item) => [item.id, item.status])
    });
  }

  function needsSimulation(input) {
    return input.upgradeChance > 0 || input.downgradeChance > 0
      || input.bagPity + input.openSlots * input.rerolls >= data.mechanics.bagPityAt;
  }

  function runCalculation(input) {
    elements.calculate.disabled = true;
    elements.calculateStatus.textContent = needsSimulation(input) ? '100,000 simulations…' : 'Calculating…';
    if (needsSimulation(input) && window.Worker) {
      try {
        activeWorker = new Worker('simulation-worker.js');
        activeWorker.onmessage = (event) => {
          if (event.data.ok) finishCalculation(event.data.result, input);
          else calculationFailed(event.data.error);
          activeWorker.terminate();
          activeWorker = null;
        };
        activeWorker.onerror = () => {
          activeWorker.terminate();
          activeWorker = null;
          runOnMainThread(input);
        };
        activeWorker.postMessage(input);
        return;
      } catch (_) {
        activeWorker = null;
      }
    }
    runOnMainThread(input);
  }

  function runOnMainThread(input) {
    window.setTimeout(() => {
      try {
        finishCalculation(engine.calculate(input, data), input);
      } catch (error) {
        calculationFailed(error instanceof Error ? error.message : String(error));
      }
    }, 40);
  }

  function calculationFailed(message) {
    elements.calculate.disabled = false;
    elements.calculateStatus.textContent = '';
    elements.formError.textContent = `계산 중 오류가 발생했습니다: ${message}`;
  }

  function finishCalculation(result, input) {
    elements.calculate.disabled = false;
    elements.calculateStatus.textContent = '';
    lastCalculatedSignature = calculationSignature(input);
    elements.emptyResults.hidden = true;
    elements.resultContent.hidden = false;
    elements.staleNotice.hidden = true;
    renderResult(result, input);
    saveState();
  }

  function formatPercent(probability) {
    if (!Number.isFinite(probability)) return '—';
    const percent = probability * 100;
    if (percent === 0) return '0%';
    if (percent < .01) return `${Number(percent.toPrecision(2))}%`;
    return `${percent.toFixed(2)}%`;
  }

  function formatOneIn(probability) {
    if (probability <= 0) return '출현 불가';
    if (probability >= .999999) return '거의 확실';
    return `약 ${Math.round(1 / probability).toLocaleString('ko-KR')}분의 1`;
  }

  function renderResult(result, input) {
    const isSimulation = result.method === 'estimated-simulation';
    const isUnavailable = result.method === 'unavailable';
    elements.method.textContent = isUnavailable ? 'UNAVAILABLE' : result.method === 'exact' ? 'EXACT' : 'ESTIMATED';
    elements.method.className = `method-badge ${result.method === 'exact' ? 'exact' : 'estimated'}`;
    elements.cumulativeProbability.textContent = formatPercent(result.cumulativeProbability);
    elements.cumulativeOdds.textContent = formatOneIn(result.cumulativeProbability);
    elements.slotProbability.textContent = formatPercent(result.slotProbability);
    elements.shopProbability.textContent = formatPercent(result.shopProbability);
    elements.expectedRerolls.textContent = Number.isFinite(result.expectedRerolls)
      ? `${result.expectedRerolls.toFixed(result.expectedRerolls < 100 ? 1 : 0)}회` : '계산 불가';
    elements.totalGold.textContent = `${result.totalGold.toFixed(0)} Gold`;
    elements.expectedGold.textContent = `${result.expectedGold.toFixed(2)} Gold`;
    elements.confidence.textContent = isSimulation && result.confidenceInterval
      ? `95% CI ${formatPercent(result.confidenceInterval.low)} – ${formatPercent(result.confidenceInterval.high)} · ${result.runs.toLocaleString('ko-KR')}회`
      : '';

    elements.diagnostic.hidden = !(result.diagnostics && result.diagnostics.length);
    elements.diagnostic.textContent = result.diagnostics && result.diagnostics.length ? result.diagnostics.join(' ') : '';
    const clovers = [];
    if (Number(elements.lucky.value)) clovers.push(`${elements.lucky.value} Lucky`);
    if (Number(elements.golden.value)) clovers.push(`${elements.golden.value} Golden`);
    if (Number(elements.cursed.value)) clovers.push(`${elements.cursed.value} Cursed`);
    elements.conditionSummary.textContent = [
      `Round ${input.round}`, `${input.openSlots} open slots`, `${input.rerolls} rerolls`, titleCase(input.hero), ...clovers
    ].join(' · ');

    const assumptions = [];
    assumptions.push('같은 레어도 안에서는 가중치가 같은 것으로 가정합니다.');
    if (input.hero === 'any') assumptions.push('Any 모드에서는 Shared 아이템 풀만 사용합니다.');
    if (input.seenCount > 0) assumptions.push(`재등장 억제는 회당 ×${input.repeatMultiplier} 추정 배율입니다.`);
    if (input.targetBoost > 0) assumptions.push(`추가 출현 확률 ${input.targetBoost}%는 공개되지 않은 내부 로직의 사용자 지정 추정값입니다.`);
    if (isSimulation) assumptions.push('가방 보정 또는 클로버로 상태가 변해 시뮬레이션을 사용했습니다.');
    if (input.target && input.target.custom) assumptions.push('직접 입력 아이템은 사용자가 선택한 레어도와 가중치를 사용합니다.');
    assumptions.push('첫 상점의 무기·펫 전용 규칙과 시즌 Special Shop은 모델링하지 않습니다.');
    elements.assumptionList.innerHTML = assumptions.map((text) => `<li>${escapeHtml(text)}</li>`).join('');
  }

  function updateActiveSettings() {
    let count = 0;
    const numberActive = [elements.bagPity, elements.seenCount, elements.targetBoost,
      elements.paidRerolls, elements.freeRerolls].filter((input) => Number(input.value) > 0).length;
    count += numberActive;
    if (elements.saleOnly.checked) count += 1;
    if (Number(elements.repeatMultiplier.value) !== .75) count += 1;
    if (elements.targetWeight && Number(elements.targetWeight.value) !== 1) count += 1;
    if (Number(elements.rerolls.value) !== 5) count += 1;
    count += items.filter((item) => item.status !== 'available').length;
    elements.activeCount.textContent = count ? `${count} active settings` : '기본값';
  }

  function markInputsChanged() {
    renderRarityPreview();
    updateActiveSettings();
    updatePoolSummary();
    scheduleSave();
    if (lastCalculatedSignature) {
      const signature = calculationSignature(gatherInput());
      elements.staleNotice.hidden = signature === lastCalculatedSignature;
    }
  }

  function clampInt(value, min, max) {
    const number = Math.round(Number(value));
    return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    return Math.min(max, Math.max(min, Number.isFinite(number) ? number : min));
  }

  function serializableState() {
    const fields = {};
    elements.form.querySelectorAll('input, select').forEach((input) => {
      if (!input.id) return;
      fields[input.id] = input.type === 'checkbox' ? input.checked : input.value;
    });
    return {
      selectedItemId,
      fields,
      statuses: Object.fromEntries(items.filter((item) => item.status !== 'available').map((item) => [item.id, item.status])),
      customItems: items.filter((item) => item.custom)
    };
  }

  function scheduleSave() {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveState, 150);
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableState())); } catch (_) { /* Storage can be disabled. */ }
  }

  function restoreState() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { return; }
    if (!saved || typeof saved !== 'object') return;
    if (Array.isArray(saved.customItems)) {
      for (const item of saved.customItems) {
        if (item && item.id && !itemById(item.id)) items.push({ ...item, custom: true });
      }
    }
    if (saved.statuses) {
      for (const [id, status] of Object.entries(saved.statuses)) {
        const item = itemById(id);
        if (item && ['available', 'unavailable', 'banished'].includes(status)) item.status = status;
      }
    }
    if (saved.fields) {
      for (const [id, value] of Object.entries(saved.fields)) {
        const input = $(id);
        if (!input) continue;
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else input.value = value;
      }
    }
    if (saved.selectedItemId && itemById(saved.selectedItemId)) selectedItemId = saved.selectedItemId;
  }

  function resetAll() {
    if (!window.confirm('저장된 설정과 아이템 풀 변경을 모두 초기화할까요?')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* Ignore. */ }
    items = data.items.map((item) => ({ ...item }));
    selectedItemId = null;
    elements.form.reset();
    elements.hero.value = 'any';
    elements.round.value = '1';
    elements.rerolls.value = '5';
    elements.lockedSlots.value = '0';
    elements.repeatMultiplier.value = '.75';
    elements.saleChance.value = String(data.mechanics.baseSaleChance);
    elements.upgradeChance.value = '0';
    elements.downgradeChance.value = '0';
    if (elements.targetWeight) elements.targetWeight.value = '1';
    lastCalculatedSignature = null;
    elements.resultContent.hidden = true;
    elements.emptyResults.hidden = false;
    elements.itemError.textContent = '';
    elements.formError.textContent = '';
    updateSelectedItemUi();
    markInputsChanged();
  }

  function bindEvents() {
    elements.itemPickerButton.addEventListener('click', () => {
      renderItemList();
      elements.itemDialog.showModal();
      window.setTimeout(() => elements.itemSearch.focus(), 0);
    });
    elements.itemSearch.addEventListener('input', renderItemList);
    elements.rarityFilter.addEventListener('change', renderItemList);
    if (elements.addCustom) elements.addCustom.addEventListener('click', addCustomItem);
    elements.poolEditor.addEventListener('click', () => {
      renderPoolList();
      elements.poolDialog.showModal();
    });
    elements.poolSearch.addEventListener('input', renderPoolList);
    elements.restorePool.addEventListener('click', () => {
      eligiblePoolItems().forEach((item) => { item.status = 'available'; });
      renderPoolList();
      updatePoolSummary();
      markInputsChanged();
    });
    document.querySelectorAll('[data-close-dialog]').forEach((button) => {
      button.addEventListener('click', () => $(button.dataset.closeDialog).close());
    });
    [elements.itemDialog, elements.poolDialog].forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    });
    [elements.lucky, elements.golden, elements.cursed].forEach((input) => {
      input.addEventListener('input', () => { syncCloverTotals(); markInputsChanged(); });
    });
    elements.hero.addEventListener('change', () => {
      updatePoolSummary();
      markInputsChanged();
    });
    elements.form.addEventListener('input', (event) => {
      if ([elements.lucky, elements.golden, elements.cursed].includes(event.target)) return;
      markInputsChanged();
    });
    elements.form.addEventListener('change', markInputsChanged);
    elements.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!validateForm()) return;
      runCalculation(gatherInput());
    });
    elements.reset.addEventListener('click', resetAll);
  }

  populateStaticUi();
  restoreState();
  updateSelectedItemUi();
  renderRarityPreview();
  updatePoolSummary();
  updateActiveSettings();
  bindEvents();
})();
