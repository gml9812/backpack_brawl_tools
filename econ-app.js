(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const heroLabels = { shared: 'Shared', hob: 'Hob Gang', nymphedora: 'Nymphedora' };
  const state = { query: '', hero: 'all', category: 'all', sort: 'expected-desc' };

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  }

  function assumptions() {
    return { starCount: $('econStarCount').value, emptySlots: $('econEmptySlots').value, winRate: $('econWinRate').value };
  }

  function formatGold(value) {
    return Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—';
  }

  function qualityLabel(quality) {
    return { exact: '명시값', estimated: '풀 평균 추정', partial: '부분 계산', unknown: '계산 불가' }[quality] || quality;
  }

  function categoryLabel(category) {
    return { gold: 'Gold 생성', item: '아이템 생성', hybrid: '혼합 생성' }[category] || category;
  }

  function renderCard(item) {
    return `<article class="econ-card" data-id="${item.id}">
      <div class="econ-card-top">
        <img src="${escapeHtml(item.image)}" alt="" width="72" height="72" loading="lazy">
        <div class="econ-card-title">
          <div class="econ-badges"><span class="rarity-badge rarity-${item.rarity.toLowerCase()}">${escapeHtml(item.rarity)}</span><span>${escapeHtml(heroLabels[item.hero] || item.hero)}</span><span>${categoryLabel(item.category)}</span></div>
          <h2>${escapeHtml(item.name)}</h2>
          <p>구매 ${formatGold(item.price)} Gold · 판매 ${formatGold(item.salePrice)} Gold</p>
        </div>
        <div class="econ-yield"><span>라운드당 평균</span><strong>${formatGold(item.expectedGold)}</strong><small>Gold 가치</small></div>
      </div>
      <p class="econ-effect">${escapeHtml(item.effect)}</p>
      <div class="econ-card-bottom">
        <div><span class="econ-quality econ-quality-${item.quality}">${qualityLabel(item.quality)}</span><span class="econ-formula">${escapeHtml(item.formula)}</span></div>
        <div class="econ-payback">${item.paybackRounds ? `회수 ${item.paybackRounds}라운드` : '회수 기간 —'}</div>
      </div>
    </article>`;
  }

  function getItems() {
    return BB_ECON_CORE.buildEconomyItems(BB_OPTIMIZER_CATALOG, BB_OPTIMIZER_COMBAT_STATS, assumptions());
  }

  function render() {
    const allItems = getItems();
    const query = state.query.trim().toLowerCase();
    let items = allItems.filter((item) => (!query || `${item.name} ${item.effect}`.toLowerCase().includes(query))
      && (state.hero === 'all' || item.hero === state.hero)
      && (state.category === 'all' || item.category === state.category));
    items.sort((a, b) => {
      if (state.sort === 'name') return a.name.localeCompare(b.name);
      if (state.sort === 'price-asc') return (a.price ?? Infinity) - (b.price ?? Infinity);
      const aValue = a.expectedGold ?? -1;
      const bValue = b.expectedGold ?? -1;
      return state.sort === 'expected-asc' ? aValue - bValue : bValue - aValue;
    });

    $('econResults').innerHTML = items.map(renderCard).join('');
    $('econEmpty').hidden = items.length > 0;
    $('econResultCount').textContent = `${items.length} / ${allItems.length}개`;
    const known = allItems.filter((item) => Number.isFinite(item.expectedGold));
    $('econKnownCount').textContent = known.length;
    $('econAverageYield').textContent = formatGold(known.length ? known.reduce((sum, item) => sum + item.expectedGold, 0) / known.length : null);
  }

  function populateHeroes() {
    const heroes = [...new Set(BB_ECON_CORE.buildEconomyItems(BB_OPTIMIZER_CATALOG, BB_OPTIMIZER_COMBAT_STATS).map((item) => item.hero))].sort();
    $('econHero').innerHTML = '<option value="all">모든 영웅</option>' + heroes.map((hero) => `<option value="${hero}">${escapeHtml(heroLabels[hero] || hero)}</option>`).join('');
  }

  function bind() {
    $('econSearch').addEventListener('input', (event) => { state.query = event.target.value; render(); });
    $('econHero').addEventListener('change', (event) => { state.hero = event.target.value; render(); });
    $('econCategory').addEventListener('change', (event) => { state.category = event.target.value; render(); });
    $('econSort').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
    ['econStarCount', 'econEmptySlots', 'econWinRate'].forEach((id) => $(id).addEventListener('input', render));
    $('econReset').addEventListener('click', () => {
      $('econSearch').value = ''; $('econHero').value = 'all'; $('econCategory').value = 'all'; $('econSort').value = 'expected-desc';
      $('econStarCount').value = 1; $('econEmptySlots').value = 1; $('econWinRate').value = 50;
      Object.assign(state, { query: '', hero: 'all', category: 'all', sort: 'expected-desc' }); render();
    });
  }

  $('econDataVersion').textContent = BB_OPTIMIZER_CATALOG.version;
  $('econVerifiedOn').textContent = BB_OPTIMIZER_CATALOG.verifiedOn;
  populateHeroes(); bind(); render();
})();
