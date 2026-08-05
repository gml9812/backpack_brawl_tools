(function () {
  'use strict';

  const data = globalThis.BB_DATA;
  const catalogEngine = globalThis.BBCatalogCalculator;
  const STORAGE_KEY = 'backpack-brawl-shop-odds:v1';
  const $ = (id) => document.getElementById(id);
  const form = $('calculatorForm');
  const calculateButton = $('calculateButton');
  const calculateStatus = $('calculateStatus');
  const catalog = $('shopCatalog');
  const catalogList = $('catalogList');
  const catalogSummary = $('catalogSummary');
  const catalogSearch = $('catalogSearchInput');
  const catalogStale = $('catalogStaleNotice');
  const emptyResults = $('emptyResults');
  const resultContent = $('resultContent');
  const detailHeading = $('detailHeading');
  const detailItemName = $('detailItemName');
  const methodBadge = $('resultMethod');
  let catalogResult = null;
  let catalogInput = null;
  let allowLegacySubmit = false;
  let catalogWorker = null;

  function number(id, min, max) {
    const value = Number($(id).value);
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
  }

  function storedStatuses() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return saved && saved.statuses ? saved.statuses : {};
    } catch (_) {
      return {};
    }
  }

  function currentItems() {
    const statuses = storedStatuses();
    const items = data.items.map((item) => ({ ...item, status: statuses[item.id] || item.status || 'available' }));
    document.querySelectorAll('#poolList .pool-row').forEach((row) => {
      const name = row.querySelector('strong')?.textContent;
      const status = row.querySelector('select')?.value;
      const item = items.find((candidate) => candidate.name === name);
      if (item && status) item.status = status;
    });
    return items;
  }

  function gatherCatalogInput() {
    return {
      items: currentItems(),
      hero: $('heroSelect').value,
      round: number('roundInput', 1, data.roundOdds.length),
      openSlots: data.mechanics.shopSlots - number('lockedSlotsInput', 0, 4),
      upgradeChance: number('upgradeChanceInput', 0, 500),
      downgradeChance: number('downgradeChanceInput', 0, 500),
      bagPity: number('bagPityInput', 0, 10),
      saleOnly: $('saleOnlyInput').checked,
      saleChance: number('saleChanceInput', 0, 100)
    };
  }

  function validateCatalogInput() {
    $('formError').textContent = '';
    for (const input of form.querySelectorAll('input[type="number"]')) {
      if (!input.checkValidity() || input.value === '') {
        $('formError').textContent = '입력 범위를 확인하세요.';
        input.focus();
        return false;
      }
    }
    return true;
  }

  function needsSimulation(input) {
    return input.upgradeChance > 0 || input.downgradeChance > 0
      || input.bagPity + input.openSlots >= data.mechanics.bagPityAt;
  }

  function runCatalog(input) {
    calculateButton.disabled = true;
    calculateStatus.textContent = needsSimulation(input) ? '100,000 simulations…' : 'Calculating…';
    if (needsSimulation(input) && globalThis.Worker) {
      try {
        catalogWorker = new Worker('catalog-worker.js');
        catalogWorker.onmessage = (event) => {
          if (event.data.ok) finishCatalog(event.data.result, input);
          else failCatalog(event.data.error);
          catalogWorker.terminate();
          catalogWorker = null;
        };
        catalogWorker.onerror = () => {
          catalogWorker.terminate();
          catalogWorker = null;
          runCatalogOnMain(input);
        };
        catalogWorker.postMessage(input);
        return;
      } catch (_) {
        catalogWorker = null;
      }
    }
    runCatalogOnMain(input);
  }

  function runCatalogOnMain(input) {
    setTimeout(() => {
      try {
        finishCatalog(catalogEngine.calculate(input, data), input);
      } catch (error) {
        failCatalog(error instanceof Error ? error.message : String(error));
      }
    }, 30);
  }

  function failCatalog(message) {
    calculateButton.disabled = false;
    calculateStatus.textContent = '';
    $('formError').textContent = `목록 계산 중 오류가 발생했습니다: ${message}`;
  }

  function finishCatalog(result, input) {
    calculateButton.disabled = false;
    calculateStatus.textContent = '';
    catalogResult = result;
    catalogInput = input;
    emptyResults.hidden = true;
    catalog.hidden = false;
    catalogStale.hidden = true;
    resultContent.hidden = true;
    detailHeading.hidden = true;
    methodBadge.textContent = result.method === 'exact' ? 'EXACT' : result.method === 'unavailable' ? 'UNAVAILABLE' : 'ESTIMATED';
    methodBadge.className = `method-badge ${result.method === 'exact' ? 'exact' : 'estimated'}`;
    renderCatalog();
  }

  function formatPercent(probability) {
    const percent = probability * 100;
    if (!Number.isFinite(percent) || percent === 0) return '0%';
    if (percent < .01) return `${Number(percent.toPrecision(2))}%`;
    return `${percent.toFixed(2)}%`;
  }

  function rarityClass(rarity) {
    return `rarity-${rarity.toLowerCase()}`;
  }

  function renderCatalog() {
    if (!catalogResult) return;
    const query = catalogSearch.value.trim().toLowerCase();
    const rows = catalogResult.items
      .map((chance) => ({ chance, item: data.items.find((item) => item.id === chance.id) }))
      .filter(({ chance, item }) => item && chance.shopProbability > 0 && item.name.toLowerCase().includes(query))
      .sort((a, b) => b.chance.shopProbability - a.chance.shopProbability || a.item.name.localeCompare(b.item.name));
    const simulationLabel = catalogResult.runs ? ` · ${catalogResult.runs.toLocaleString('ko-KR')}회 시뮬레이션` : '';
    catalogSummary.textContent = catalogResult.diagnostics?.length
      ? catalogResult.diagnostics.join(' ')
      : `${rows.length}개 아이템 · 다음 상점에서 한 번 이상 등장할 확률${simulationLabel}`;
    catalogList.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = query ? '검색 결과가 없습니다.' : '현재 조건에서 등장 가능한 아이템이 없습니다.';
      catalogList.append(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const { item, chance } of rows) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'catalog-row';
      button.dataset.itemId = item.id;
      const image = document.createElement('img');
      image.src = item.image;
      image.alt = '';
      const copy = document.createElement('span');
      copy.className = 'catalog-item-copy';
      const name = document.createElement('strong');
      name.textContent = item.name;
      const rarity = document.createElement('small');
      rarity.className = rarityClass(item.rarity);
      rarity.textContent = `${item.rarity} · 슬롯당 ${formatPercent(chance.slotProbability)}`;
      copy.append(name, rarity);
      const probability = document.createElement('span');
      probability.className = 'catalog-probability';
      probability.innerHTML = `<strong>${formatPercent(chance.shopProbability)}</strong><small>다음 상점</small>`;
      button.append(image, copy, probability);
      button.addEventListener('click', () => showDetail(item));
      fragment.append(button);
    }
    catalogList.append(fragment);
  }

  function showDetail(item) {
    $('itemSearchInput').value = item.name;
    $('rarityFilter').value = 'all';
    $('itemPickerButton').click();
    const row = Array.from(document.querySelectorAll('#itemList .item-row')).find((candidate) =>
      candidate.querySelector('strong')?.textContent === item.name);
    if (!row) {
      $('itemDialog').close();
      $('formError').textContent = `${item.name}을(를) 상세 분석 대상으로 선택할 수 없습니다.`;
      return;
    }
    row.click();
    detailItemName.textContent = `${item.name} · ${item.rarity}`;
    detailHeading.hidden = false;
    allowLegacySubmit = true;
    form.requestSubmit();
    setTimeout(() => {
      detailHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }

  form.addEventListener('submit', (event) => {
    if (allowLegacySubmit) {
      allowLegacySubmit = false;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!validateCatalogInput()) return;
    runCatalog(gatherCatalogInput());
  }, true);

  catalogSearch.addEventListener('input', renderCatalog);
  form.addEventListener('input', () => {
    if (!catalog.hidden && catalogInput) catalogStale.hidden = false;
  });
  form.addEventListener('change', () => {
    if (!catalog.hidden && catalogInput) catalogStale.hidden = false;
  });
  $('resetButton').addEventListener('click', () => {
    setTimeout(() => {
      calculateButton.disabled = false;
      catalogResult = null;
      catalogInput = null;
      catalog.hidden = true;
      detailHeading.hidden = true;
    }, 0);
  });

  calculateButton.disabled = false;
})();
