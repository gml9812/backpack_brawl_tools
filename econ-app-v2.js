(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const heroLabels = { shared: 'Shared', hob: 'Hob Gang', nymphedora: 'Nymphedora' };
  const state = { query: '', hero: 'all', category: 'all', sort: 'expected-desc' };
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const assumptions = () => ({ starCount: $('econStarCount').value, emptySlots: $('econEmptySlots').value, winRate: $('econWinRate').value });
  const formatGold = (value) => Number.isFinite(value) ? value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '?';
  const qualityLabel = (quality) => ({ exact: '명시값', 'lower-bound': '최저 등급 기준', unknown: '계산 불가' }[quality] || quality);
  const categoryLabel = (category) => ({ gold: 'Gold 생성', item: '아이템 생성', hybrid: '혼합 생성' }[category] || category);
  function candidateHtml(candidate, lowestRarity) {
    return `<li class="econ-candidate${candidate.rarity === lowestRarity ? ' is-lowest' : ''}">${candidate.image ? `<img src="${escapeHtml(candidate.image)}" alt="" width="34" height="34" loading="lazy">` : '<span class="candidate-placeholder"></span>'}<span class="candidate-name">${escapeHtml(candidate.name)}${candidate.missing ? ' <em>로컬 데이터 없음</em>' : ''}</span><span class="rarity-badge rarity-${escapeHtml(candidate.rarity.toLowerCase())}">${escapeHtml(candidate.rarity)}</span><span class="candidate-price">구매 ${formatGold(candidate.price)} · 판매 ${formatGold(candidate.salePrice)}</span></li>`;
  }
  function poolHtml(pool, index) {
    return `<section class="econ-pool"><div class="econ-pool-heading"><strong>${escapeHtml(pool.label)}</strong><span>${pool.candidates.length}개 후보</span></div><p class="econ-pool-baseline">최저 등급 <b>${escapeHtml(pool.lowestRarity || '?')}</b> · 해당 등급 평균 판매가 <b>${formatGold(pool.lowestAverageSale)} Gold</b> · 발동 반영 기초값 <b>${formatGold(pool.baseGold)} Gold</b></p><ul class="econ-candidates" data-pool="${index}">${pool.candidates.map((candidate) => candidateHtml(candidate, pool.lowestRarity)).join('')}</ul><p class="econ-pool-source">구성 기준: ${escapeHtml(pool.source)}</p></section>`;
  }
  function renderCard(item) {
    const details = item.pools.length ? `<details class="econ-pool-details"><summary>생성 후보 자세히 보기 <span>${item.pools.reduce((sum, pool) => sum + pool.candidates.length, 0)}개 항목</span></summary>${item.pools.map(poolHtml).join('')}</details>` : '';
    return `<article class="econ-card" data-id="${item.id}"><div class="econ-card-top"><img src="${escapeHtml(item.image)}" alt="" width="72" height="72" loading="lazy"><div class="econ-card-title"><div class="econ-badges"><span class="rarity-badge rarity-${item.rarity.toLowerCase()}">${escapeHtml(item.rarity)}</span><span>${escapeHtml(heroLabels[item.hero] || item.hero)}</span><span>${categoryLabel(item.category)}</span></div><h2>${escapeHtml(item.name)}</h2><p>구매 ${formatGold(item.price)} Gold · 판매 ${formatGold(item.salePrice)} Gold</p></div><div class="econ-yield"><span>라운드당 기준값</span><strong>${escapeHtml(item.displayGold)}</strong><small>Gold 가치</small></div></div><p class="econ-effect">${escapeHtml(item.effect)}</p><div class="econ-card-bottom"><div><span class="econ-quality econ-quality-${item.quality}">${qualityLabel(item.quality)}</span><span class="econ-formula">${escapeHtml(item.formula)}</span></div><div class="econ-payback">${item.pools.length ? 'a = 상위 등급의 미확정 추가 가치' : item.paybackRounds ? `회수 ${item.paybackRounds}라운드` : '회수 기간 —'}</div></div>${details}</article>`;
  }
  const getItems = () => BB_ECON_CORE.buildEconomyItems(BB_OPTIMIZER_CATALOG, BB_OPTIMIZER_COMBAT_STATS, assumptions());
  function render() {
    const allItems = getItems(); const query = state.query.trim().toLowerCase();
    let items = allItems.filter((item) => (!query || `${item.name} ${item.effect} ${item.pools.flatMap((pool) => pool.candidates.map((candidate) => candidate.name)).join(' ')}`.toLowerCase().includes(query)) && (state.hero === 'all' || item.hero === state.hero) && (state.category === 'all' || item.category === state.category));
    items.sort((a, b) => state.sort === 'name' ? a.name.localeCompare(b.name) : state.sort === 'price-asc' ? (a.price ?? Infinity) - (b.price ?? Infinity) : state.sort === 'expected-asc' ? (a.baseGold ?? Infinity) - (b.baseGold ?? Infinity) : (b.baseGold ?? -1) - (a.baseGold ?? -1));
    $('econResults').innerHTML = items.map(renderCard).join(''); $('econEmpty').hidden = items.length > 0; $('econResultCount').textContent = `${items.length} / ${allItems.length}개`;
    const known = allItems.filter((item) => Number.isFinite(item.baseGold)); $('econKnownCount').textContent = known.length; $('econAverageYield').textContent = known.length ? `${formatGold(known.reduce((sum, item) => sum + item.baseGold, 0) / known.length)}+a` : '?';
  }
  function populateHeroes() { const heroes = [...new Set(getItems().map((item) => item.hero))].sort(); $('econHero').innerHTML = '<option value="all">모든 영웅</option>' + heroes.map((hero) => `<option value="${hero}">${escapeHtml(heroLabels[hero] || hero)}</option>`).join(''); }
  function bind() {
    $('econSearch').addEventListener('input', (e) => { state.query = e.target.value; render(); }); $('econHero').addEventListener('change', (e) => { state.hero = e.target.value; render(); }); $('econCategory').addEventListener('change', (e) => { state.category = e.target.value; render(); }); $('econSort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });
    ['econStarCount', 'econEmptySlots', 'econWinRate'].forEach((id) => $(id).addEventListener('input', render));
    $('econReset').addEventListener('click', () => { $('econSearch').value = ''; $('econHero').value = 'all'; $('econCategory').value = 'all'; $('econSort').value = 'expected-desc'; $('econStarCount').value = 1; $('econEmptySlots').value = 1; $('econWinRate').value = 50; Object.assign(state, { query: '', hero: 'all', category: 'all', sort: 'expected-desc' }); render(); });
  }
  $('econDataVersion').textContent = BB_OPTIMIZER_CATALOG.version; $('econVerifiedOn').textContent = BB_OPTIMIZER_CATALOG.verifiedOn; populateHeroes(); bind(); render();
})();
