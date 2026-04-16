const app = document.getElementById('app');
const message = document.getElementById('message');
const meta = document.getElementById('meta');
const refreshButton = document.getElementById('refreshBtn');
const downloadButton = document.getElementById('downloadBtn');
const searchInput = document.getElementById('searchInput');
const filterDropdown = document.getElementById('filterDropdown');
const filterDropdownButton = document.getElementById('filterDropdownButton');
const filterDropdownMenu = document.getElementById('filterDropdownMenu');
const filterDropdownSummary = document.getElementById('filterDropdownSummary');
const filterToggleInputs = [...document.querySelectorAll('.filter-toggle-input')];
const starContainer = document.getElementById('star-container');
const valueSummary = document.getElementById('valueSummary');
const valueSummaryGrid = document.getElementById('valueSummaryGrid');
const skinModal = document.getElementById('skinModal');
const skinModalBackdrop = document.getElementById('skinModalBackdrop');
const skinModalBody = document.getElementById('skinModalBody');
const skinModalClose = document.getElementById('skinModalClose');

let latestData = null;
let activeModalSkin = null;
let activeModalState = {
  selectedChromaIndex: null,
  selectedLevelIndex: null,
};

const CONTENT_TIER_TO_RARITY = {
  '12683d76-48d7-84a3-4e09-6985794f0445': 'select',
  '0cebb8be-46d7-c12a-d306-e9907bfc5a25': 'deluxe',
  '60bca009-4182-7998-dee7-b8a2558dc369': 'premium',
  'e046854e-406c-37f4-6607-19a9ba8426fc': 'exclusive',
  '411e4a55-4e59-7757-41f0-86a53f101bb5': 'ultra',
};
const FILTER_ALL = 'all';
const FILTER_SPECIFIC = ['battlepass', 'normal', 'limited', 'contract'];
const VP_PER_EUR = 100;
const FILTER_LABELS = {
  all: 'All Skins',
  battlepass: 'Battlepass',
  normal: 'Normal',
  limited: 'Limited',
  contract: 'Contract',
};
const CONTENT_TIER_LABELS = {
  '12683d76-48d7-84a3-4e09-6985794f0445': 'Select',
  '0cebb8be-46d7-c12a-d306-e9907bfc5a25': 'Deluxe',
  '60bca009-4182-7998-dee7-b8a2558dc369': 'Premium',
  'e046854e-406c-37f4-6607-19a9ba8426fc': 'Exclusive',
  '411e4a55-4e59-7757-41f0-86a53f101bb5': 'Ultra',
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setStatus(text) {
  message.innerHTML = `<div class="status">${escapeHtml(text)}</div>`;
}

function setError(text) {
  message.innerHTML = `<div class="error">${escapeHtml(text)}</div>`;
}

function clearMessage() {
  message.innerHTML = '';
}

function extractFilename(contentDisposition) {
  const encodedMatch = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      // Fall through to the ASCII filename.
    }
  }

  const match = contentDisposition?.match(/filename="([^"]+)"/i);
  return match ? match[1] : 'valorant-skins.xlsx';
}

function getPriceDisplay(skin) {
  if (!skin.priceLabel) {
    return 'Unknown';
  }

  if (skin.isPriceEstimated && skin.priceVp) {
    return `Approx. ${skin.priceLabel}`;
  }

  return skin.priceLabel;
}

function getRarityKey(skin) {
  return CONTENT_TIER_TO_RARITY[skin.contentTierUuid] || 'unknown';
}

function getContentTierLabel(contentTierUuid) {
  return CONTENT_TIER_LABELS[contentTierUuid] || 'Unknown';
}

function getSkinCategoryLabel(skin) {
  if (skin.isBattlepass) {
    return 'Battlepass';
  }

  if (skin.isContract) {
    return 'Contract';
  }

  if (skin.isLimited) {
    return 'Limited';
  }

  return 'Normal';
}

function getSelectedChroma(skin, state = activeModalState) {
  const chromas = skin.chromas || [];

  if (
    Number.isInteger(state.selectedChromaIndex)
    && state.selectedChromaIndex >= 0
    && state.selectedChromaIndex < chromas.length
  ) {
    return chromas[state.selectedChromaIndex];
  }

  return null;
}

function getSelectedLevel(skin, state = activeModalState) {
  const levels = skin.levels || [];

  if (
    Number.isInteger(state.selectedLevelIndex)
    && state.selectedLevelIndex >= 0
    && state.selectedLevelIndex < levels.length
  ) {
    return levels[state.selectedLevelIndex];
  }

  return null;
}

function getPreviewVideo(skin, state = activeModalState) {
  const selectedLevel = getSelectedLevel(skin, state);
  const selectedChroma = getSelectedChroma(skin, state);

  return (
    selectedLevel?.streamedVideo
    || selectedChroma?.streamedVideo
    || skin.levels?.find((level) => level.streamedVideo)?.streamedVideo
    || skin.chromas?.find((chroma) => chroma.streamedVideo)?.streamedVideo
    || ''
  );
}

function getPreviewImage(skin, state = activeModalState) {
  const selectedLevel = getSelectedLevel(skin, state);
  const selectedChroma = getSelectedChroma(skin, state);

  return (
    selectedChroma?.fullRender
    || selectedChroma?.displayIcon
    || selectedLevel?.displayIcon
    || skin.wallpaper
    || skin.chromas?.find((chroma) => chroma.fullRender)?.fullRender
    || skin.image
    || ''
  );
}

function renderSkinTag(label, value) {
  return `
    <div class="skin-detail-meta-item">
      <span class="skin-detail-meta-label">${escapeHtml(label)}</span>
      <strong class="skin-detail-meta-value">${escapeHtml(value)}</strong>
    </div>
  `;
}

function renderSkinDetailModal(skin, state = activeModalState) {
  const previewVideo = getPreviewVideo(skin, state);
  const previewImage = getPreviewImage(skin, state);
  const chromaItems = (skin.chromas || []).slice(0, 8);
  const levelItems = (skin.levels || []).slice(0, 8);
  const selectedChroma = getSelectedChroma(skin, state);
  const selectedLevel = getSelectedLevel(skin, state);
  const flags = [
    skin.isBattlepass ? 'Battlepass' : null,
    skin.isLimited ? 'Limited' : null,
    skin.isContract ? 'Contract' : null,
    skin.isPriceEstimated ? 'Estimated value' : null,
  ].filter(Boolean);

  skinModalBody.innerHTML = `
    <div class="skin-detail-hero" data-rarity="${escapeHtml(getRarityKey(skin))}">
      <div class="skin-detail-preview">
        ${
          previewVideo
            ? `<video class="skin-detail-video" src="${escapeHtml(previewVideo)}" autoplay muted loop playsinline controls></video>`
            : previewImage
              ? `<img class="skin-detail-image" src="${escapeHtml(previewImage)}" alt="${escapeHtml(skin.displayName)}" />`
              : '<div class="skin-detail-empty">No preview available</div>'
        }
        <div class="skin-detail-preview-status">
          <span>${escapeHtml(selectedChroma?.displayName || 'Default chroma')}</span>
          <span>${escapeHtml(selectedLevel?.displayName || 'Default level preview')}</span>
        </div>
      </div>
      <div class="skin-detail-copy">
        <div class="skin-detail-chip-row">
          <span class="card-chip">${escapeHtml(skin.weapon)}</span>
          <span class="card-chip card-chip-accent">${escapeHtml(getPriceDisplay(skin))}</span>
          <span class="card-chip">${escapeHtml(getContentTierLabel(skin.contentTierUuid))}</span>
        </div>
        <h2 id="skinModalTitle">${escapeHtml(skin.displayName)}</h2>
        <p class="skin-detail-subtitle">${escapeHtml(skin.acquisitionLabel || 'Price unavailable')}</p>
        ${
          flags.length
            ? `<div class="skin-detail-flag-row">${flags
                .map((flag) => `<span class="skin-detail-flag">${escapeHtml(flag)}</span>`)
                .join('')}</div>`
            : ''
        }
        <div class="skin-detail-actions">
          <button class="skin-detail-action" type="button" data-reset-preview="true">Reset preview</button>
        </div>
      </div>
    </div>

    <div class="skin-detail-grid">
      <section class="skin-detail-section">
        <h3>Skin Info</h3>
        <div class="skin-detail-meta-grid">
          ${renderSkinTag('Category', getSkinCategoryLabel(skin))}
          ${renderSkinTag('Tier', getContentTierLabel(skin.contentTierUuid))}
          ${renderSkinTag('Weapon', skin.weapon)}
          ${renderSkinTag('Price Type', skin.isPriceEstimated ? 'Estimated' : typeof skin.priceVp === 'number' ? 'Exact' : skin.priceLabel || 'Unknown')}
          ${renderSkinTag('VP Value', typeof skin.priceVp === 'number' ? `${formatNumber(skin.priceVp)} VP` : skin.priceLabel || 'Unknown')}
          ${renderSkinTag('EUR Value', typeof skin.priceVp === 'number' ? formatMoney(skin.priceVp / VP_PER_EUR, 'EUR') : 'N/A')}
          ${renderSkinTag('Chromas', formatNumber(skin.chromas?.length || 0))}
          ${renderSkinTag('Levels', formatNumber(skin.levels?.length || 0))}
        </div>
      </section>

      <section class="skin-detail-section">
        <h3>Identifiers</h3>
        <div class="skin-detail-code-list">
          <div>
            <span>Skin UUID</span>
            <code>${escapeHtml(skin.uuid || 'Unknown')}</code>
          </div>
          <div>
            <span>Theme UUID</span>
            <code>${escapeHtml(skin.theme || 'Unknown')}</code>
          </div>
          <div>
            <span>Asset Path</span>
            <code>${escapeHtml(skin.assetPath || 'Unknown')}</code>
          </div>
        </div>
      </section>
    </div>

    ${
      chromaItems.length
        ? `
          <section class="skin-detail-section">
            <h3>Chromas</h3>
            <div class="skin-detail-visual-grid">
              ${chromaItems
                .map(
                  (chroma, index) => `
                    <button
                      class="skin-detail-visual-card${index === state.selectedChromaIndex ? ' is-active' : ''}"
                      type="button"
                      data-chroma-index="${index}"
                    >
                      <div class="skin-detail-visual-preview">
                        ${
                          chroma.swatch
                            ? `<img src="${escapeHtml(chroma.swatch)}" alt="${escapeHtml(chroma.displayName)} swatch" />`
                          : chroma.displayIcon
                              ? `<img src="${escapeHtml(chroma.displayIcon)}" alt="${escapeHtml(chroma.displayName)} icon" />`
                              : '<div class="skin-detail-empty">No swatch</div>'
                        }
                      </div>
                      <strong>${escapeHtml(chroma.displayName || skin.displayName)}</strong>
                    </button>
                  `
                )
                .join('')}
            </div>
          </section>
        `
        : ''
    }

    ${
      levelItems.length
        ? `
          <section class="skin-detail-section">
            <h3>Levels</h3>
            <div class="skin-detail-level-list">
              ${levelItems
                .map(
                  (level, index) => `
                    <button
                      class="skin-detail-level-item${index === state.selectedLevelIndex ? ' is-active' : ''}"
                      type="button"
                      data-level-index="${index}"
                    >
                      <div>
                        <strong>Level ${index + 1}</strong>
                        <p>${escapeHtml(level.displayName || skin.displayName)}</p>
                      </div>
                      <span>${escapeHtml(level.levelItem || (level.streamedVideo ? 'Includes preview video' : 'Base level'))}</span>
                    </button>
                  `
                )
                .join('')}
            </div>
          </section>
        `
        : ''
    }
  `;
}

function openSkinModal(skin) {
  activeModalSkin = skin;
  activeModalState = {
    selectedChromaIndex: null,
    selectedLevelIndex: null,
  };
  renderSkinDetailModal(skin, activeModalState);
  skinModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeSkinModal() {
  skinModal.hidden = true;
  skinModalBody.innerHTML = '';
  document.body.classList.remove('modal-open');
  activeModalSkin = null;
  activeModalState = {
    selectedChromaIndex: null,
    selectedLevelIndex: null,
  };
}

function formatNumber(value) {
  return value.toLocaleString('en-US');
}

function formatMoney(value, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function getVisibleSkins(groups) {
  return groups.flatMap((group) => group.skins);
}

function buildValueSummaryData(groups) {
  const skins = getVisibleSkins(groups);
  const exactVp = skins.reduce(
    (sum, skin) => (typeof skin.priceVp === 'number' && !skin.isPriceEstimated ? sum + skin.priceVp : sum),
    0
  );
  const estimatedVp = skins.reduce(
    (sum, skin) => (typeof skin.priceVp === 'number' && skin.isPriceEstimated ? sum + skin.priceVp : sum),
    0
  );
  const combinedVp = exactVp + estimatedVp;
  const exactEur = exactVp / VP_PER_EUR;
  const estimatedEur = estimatedVp / VP_PER_EUR;
  const combinedEur = combinedVp / VP_PER_EUR;

  return {
    exactEur,
    exactVp,
    estimatedEur,
    estimatedVp,
    combinedEur,
    combinedVp,
    visibleSkinCount: skins.length,
  };
}

function renderValueSummary(groups) {
  if (!valueSummary || !valueSummaryGrid) {
    return;
  }

  const summary = buildValueSummaryData(groups);

  valueSummaryGrid.innerHTML = [
    {
      title: 'Visible Skins',
      value: formatNumber(summary.visibleSkinCount),
      detail: 'Current search and filters',
    },
    {
      title: 'Exact VP',
      value: `${formatNumber(summary.exactVp)} VP`,
      detail: 'Confirmed exact prices',
    },
    {
      title: 'Estimated VP',
      value: `${formatNumber(summary.estimatedVp)} VP`,
      detail: 'Tier-based approximations',
    },
    {
      title: 'Total VP',
      value: `${formatNumber(summary.combinedVp)} VP`,
      detail: 'Exact + estimated combined',
    },
    {
      title: 'Exact EUR',
      value: formatMoney(summary.exactEur, 'EUR'),
      detail: 'Using 1000 VP = EUR 10',
    },
    {
      title: 'Estimated EUR',
      value: formatMoney(summary.estimatedEur, 'EUR'),
      detail: 'Approximate euro value',
    },
    {
      title: 'Total EUR',
      value: formatMoney(summary.combinedEur, 'EUR'),
      detail: 'Exact + estimated combined',
    },
  ]
    .map(
      (item) => `
        <article class="value-card">
          <span class="value-card-label">${escapeHtml(item.title)}</span>
          <strong class="value-card-value">${escapeHtml(item.value)}</strong>
          <span class="value-card-detail">${escapeHtml(item.detail)}</span>
        </article>
      `
    )
    .join('');
}

function getActiveFilters() {
  const activeFilters = filterToggleInputs.filter((input) => input.checked).map((input) => input.value);
  return activeFilters.length ? activeFilters : [FILTER_ALL];
}

function setActiveFilters(values) {
  const activeValues = new Set(values);

  filterToggleInputs.forEach((input) => {
    input.checked = activeValues.has(input.value);
  });
}

function getSkinCategoryCounts(data) {
  const counts = {
    all: data.totalSkins ?? 0,
    battlepass: data.battlepass?.totalSkins ?? 0,
    contract: data.contract?.totalSkins ?? 0,
    limited: data.limited?.totalSkins ?? 0,
    normal: data.normal?.totalSkins ?? 0,
  };

  return counts;
}

function updateFilterSummary() {
  const activeFilters = getActiveFilters();

  if (activeFilters.includes(FILTER_ALL)) {
    filterDropdownSummary.textContent = FILTER_LABELS.all;
    return;
  }

  filterDropdownSummary.textContent = activeFilters.map((value) => FILTER_LABELS[value]).join(', ');
}

function syncFilterAvailability(data) {
  const counts = getSkinCategoryCounts(data);

  filterToggleInputs.forEach((input) => {
    const label = document.querySelector(`label[for="${input.id}"] .filter-option-text`);
    const baseText = label?.dataset.baseText || label?.textContent || '';

    if (label && !label.dataset.baseText) {
      label.dataset.baseText = baseText;
    }

    if (label) {
      label.textContent = `${label.dataset.baseText} (${counts[input.value] ?? 0})`;
    }

    if (input.value !== FILTER_ALL) {
      input.disabled = (counts[input.value] ?? 0) === 0;
    }
  });

  const activeSpecificFilters = getActiveFilters().filter((value) => value !== FILTER_ALL);
  const availableSpecificFilters = FILTER_SPECIFIC.filter((value) => counts[value] > 0);

  if (!availableSpecificFilters.length) {
    setActiveFilters([FILTER_ALL]);
    return;
  }

  if (!activeSpecificFilters.length && !document.getElementById('filter-all').checked) {
    setActiveFilters([FILTER_ALL]);
    return;
  }

  const hasUnavailableActiveFilter = activeSpecificFilters.some((value) => counts[value] === 0);
  if (hasUnavailableActiveFilter) {
    const remainingFilters = activeSpecificFilters.filter((value) => counts[value] > 0);
    setActiveFilters(remainingFilters.length ? remainingFilters : [FILTER_ALL]);
  }

  updateFilterSummary();
}

function handleFilterToggleChange(changedInput) {
  const changedValue = changedInput.value;

  if (changedValue === FILTER_ALL) {
    if (changedInput.checked) {
      setActiveFilters([FILTER_ALL]);
      updateFilterSummary();
      return;
    }

    changedInput.checked = true;
    updateFilterSummary();
    return;
  }

  const allInput = document.getElementById('filter-all');
  const activeSpecificFilters = FILTER_SPECIFIC.filter((value) => {
    const input = document.getElementById(`filter-${value}`);
    return input?.checked;
  });

  if (changedInput.checked) {
    allInput.checked = false;
  }

  if (!activeSpecificFilters.length) {
    setActiveFilters([FILTER_ALL]);
    updateFilterSummary();
    return;
  }

  setActiveFilters(activeSpecificFilters);
  updateFilterSummary();
}

function matchesSelectedFilters(skin, activeFilters) {
  if (activeFilters.includes(FILTER_ALL)) {
    return true;
  }

  return activeFilters.some((filter) => {
    if (filter === 'battlepass') {
      return skin.isBattlepass;
    }

    if (filter === 'limited') {
      return skin.isLimited;
    }

    if (filter === 'contract') {
      return skin.isContract;
    }

    if (filter === 'normal') {
      return !skin.isBattlepass && !skin.isLimited && !skin.isContract;
    }

    return false;
  });
}

function getEmptyStateText(activeFilters) {
  if (activeFilters.includes(FILTER_ALL)) {
    return 'No skins matched your filter.';
  }

  const filterLabels = {
    battlepass: 'battlepass',
    contract: 'contract',
    limited: 'limited',
    normal: 'normal',
  };
  const selectedLabels = activeFilters.map((value) => filterLabels[value]).filter(Boolean);

  if (selectedLabels.length === 1) {
    return `No ${selectedLabels[0]} skins matched your filter.`;
  }

  return 'No skins matched your selected filters.';
}

function setDropdownOpen(isOpen) {
  filterDropdownButton.setAttribute('aria-expanded', String(isOpen));
  filterDropdownMenu.hidden = !isOpen;
  filterDropdown.classList.toggle('is-open', isOpen);
}

function initializeFilterDropdown() {
  updateFilterSummary();

  filterDropdownButton.addEventListener('click', () => {
    const isOpen = filterDropdownButton.getAttribute('aria-expanded') === 'true';
    setDropdownOpen(!isOpen);
  });

  document.addEventListener('click', (event) => {
    if (!filterDropdown.contains(event.target)) {
      setDropdownOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setDropdownOpen(false);
      filterDropdownButton.focus();
    }
  });
}

function initializeCardSpotlight() {
  app.addEventListener('pointermove', (event) => {
    const grid = event.target.closest('.skins');
    if (!grid) {
      return;
    }

    for (const card of grid.querySelectorAll('.card')) {
      const rect = card.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    }
  });
}

function initializeSkinModal() {
  app.addEventListener('click', (event) => {
    const card = event.target.closest('.card');

    if (!card) {
      return;
    }

    const serializedSkin = card.getAttribute('data-skin');
    if (!serializedSkin) {
      return;
    }

    try {
      openSkinModal(JSON.parse(serializedSkin));
    } catch {
      setError('Could not open that skin preview.');
    }
  });

  app.addEventListener('keydown', (event) => {
    const card = event.target.closest('.card');

    if (!card || !['Enter', ' '].includes(event.key)) {
      return;
    }

    event.preventDefault();
    card.click();
  });

  skinModalBody.addEventListener('click', (event) => {
    if (!activeModalSkin) {
      return;
    }

    const resetButton = event.target.closest('[data-reset-preview]');
    if (resetButton) {
      activeModalState = {
        selectedChromaIndex: null,
        selectedLevelIndex: null,
      };
      renderSkinDetailModal(activeModalSkin, activeModalState);
      return;
    }

    const chromaButton = event.target.closest('[data-chroma-index]');
    if (chromaButton) {
      const nextIndex = Number(chromaButton.getAttribute('data-chroma-index'));
      activeModalState = {
        ...activeModalState,
        selectedChromaIndex: Number.isFinite(nextIndex) ? nextIndex : null,
      };
      renderSkinDetailModal(activeModalSkin, activeModalState);
      return;
    }

    const levelButton = event.target.closest('[data-level-index]');
    if (levelButton) {
      const nextIndex = Number(levelButton.getAttribute('data-level-index'));
      activeModalState = {
        ...activeModalState,
        selectedLevelIndex: Number.isFinite(nextIndex) ? nextIndex : null,
      };
      renderSkinDetailModal(activeModalSkin, activeModalState);
    }
  });

  skinModalClose.addEventListener('click', closeSkinModal);
  skinModalBackdrop.addEventListener('click', closeSkinModal);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !skinModal.hidden) {
      closeSkinModal();
    }
  });
}

function initializeStarField() {
  if (!starContainer) {
    return;
  }

  starContainer.innerHTML = '';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = reducedMotion ? 36 : 80;
  const stars = [];

  for (let index = 0; index < count; index += 1) {
    const star = document.createElement('div');
    star.className = 'star';

    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const isStatic = reducedMotion || Math.random() < 0.3;
    const speed = isStatic ? 0 : 0.2 + Math.random() * 0.6;
    const size = isStatic ? 1 + Math.random() : 1 + Math.random() * 2;

    star.style.left = `${x}%`;
    star.style.top = `${y}%`;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.setProperty('--duration', `${2 + Math.random() * 4}s`);
    star.style.setProperty('--delay', `${Math.random() * 5}s`);

    starContainer.appendChild(star);
    stars.push({ el: star, initialY: y, speed });
  }

  if (reducedMotion) {
    return;
  }

  let targetScroll = window.scrollY;
  let smoothScroll = targetScroll;
  let previousSmoothScroll = smoothScroll;

  const updateScrollTarget = () => {
    targetScroll = window.scrollY;
  };

  const renderStars = () => {
    smoothScroll += (targetScroll - smoothScroll) * 0.08;
    const velocity = smoothScroll - previousSmoothScroll;
    previousSmoothScroll = smoothScroll;

    const stretch = Math.max(1, Math.min(1 + Math.abs(velocity) * 0.025, 4));

    stars.forEach((star) => {
      if (star.speed === 0) {
        star.el.style.transform = 'translate3d(0, 0, 0) scaleY(1)';
        return;
      }

      let position = (star.initialY - smoothScroll * star.speed * 0.05) % 100;
      if (position < 0) {
        position += 100;
      }

      star.el.style.top = `${position}%`;
      star.el.style.transform = `translate3d(0, 0, 0) scaleY(${stretch})`;
    });

    window.requestAnimationFrame(renderStars);
  };

  window.addEventListener('scroll', updateScrollTarget, { passive: true });
  window.addEventListener('resize', updateScrollTarget);
  window.requestAnimationFrame(renderStars);
}

function render(data) {
  latestData = data;
  const filter = searchInput.value.trim().toLowerCase();
  syncFilterAvailability(data);
  const activeFilters = getActiveFilters();

  meta.innerHTML = [
    `<div><strong>Player:</strong> ${escapeHtml(`${data.player.gameName}#${data.player.tagLine}`)}</div>`,
    `<div><strong>Region:</strong> ${escapeHtml(data.region)}</div>`,
    `<div><strong>Shard:</strong> ${escapeHtml(data.shard)}</div>`,
    `<div><strong>Total skins:</strong> ${escapeHtml(data.totalSkins)}</div>`,
    `<div><strong>Battlepass skins:</strong> ${escapeHtml(data.battlepass?.totalSkins ?? 0)}</div>`,
    `<div><strong>Limited skins:</strong> ${escapeHtml(data.limited?.totalSkins ?? 0)}</div>`,
    `<div><strong>Contract skins:</strong> ${escapeHtml(data.contract?.totalSkins ?? 0)}</div>`,
  ].join('');

  const groups = data.groups
    .map((group) => ({
      ...group,
      skins: group.skins.filter((skin) => {
        if (!matchesSelectedFilters(skin, activeFilters)) {
          return false;
        }

        if (!filter) {
          return true;
        }

        return (
          skin.displayName.toLowerCase().includes(filter) ||
          group.weapon.toLowerCase().includes(filter)
        );
      }),
    }))
    .filter((group) => group.skins.length > 0);

  renderValueSummary(groups);

  if (!groups.length) {
    app.innerHTML = `<div class="empty">${getEmptyStateText(activeFilters)}</div>`;
    return;
  }

  app.innerHTML = groups
    .map(
      (group) => `
        <section class="group">
          <div class="group-header">
            <strong>${escapeHtml(group.weapon)}</strong>
            <span>${group.skins.length} skin(s)</span>
          </div>
          <div class="skins">
            ${group.skins
              .map(
                (skin) => `
                  <article
                    class="card"
                    data-rarity="${escapeHtml(getRarityKey(skin))}"
                    data-skin="${escapeHtml(JSON.stringify(skin))}"
                    tabindex="0"
                    role="button"
                    aria-label="Open details for ${escapeHtml(skin.displayName)}"
                  >
                    <div class="card-content">
                      <div class="card-image">
                        <img src="${escapeHtml(skin.image || '')}" alt="${escapeHtml(skin.displayName)}" loading="lazy" />
                      </div>
                      <div class="card-info-wrapper">
                        <div class="card-info">
                          <div class="card-info-title">
                            <div class="card-chip-row">
                              <span class="card-chip">${escapeHtml(group.weapon)}</span>
                              <span class="card-chip card-chip-accent">${escapeHtml(getPriceDisplay(skin))}</span>
                            </div>
                            <h3>${escapeHtml(skin.displayName)}</h3>
                            <h4>${escapeHtml(skin.acquisitionLabel || 'Price unavailable')}</h4>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                `
              )
              .join('')}
          </div>
        </section>
      `
    )
    .join('');
}

async function loadSkins() {
  setStatus('Loading skins from your local VALORANT session...');
  app.innerHTML = '';
  meta.innerHTML = '';

  try {
    const response = await fetch('/api/skins');
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load skins');
    }

    clearMessage();
    render(data);
  } catch (error) {
    setError(error.message);
  }
}

refreshButton.addEventListener('click', loadSkins);
downloadButton.addEventListener('click', async () => {
  const originalText = downloadButton.textContent;
  downloadButton.disabled = true;
  downloadButton.textContent = 'Preparing...';

  try {
    const response = await fetch('/api/skins/export.xlsx');

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to build export');
    }

    const blob = await response.blob();
    const filename = extractFilename(response.headers.get('content-disposition'));
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    setError(error.message);
  } finally {
    downloadButton.disabled = false;
    downloadButton.textContent = originalText;
  }
});
searchInput.addEventListener('input', () => {
  if (latestData) {
    render(latestData);
  }
});
filterToggleInputs.forEach((input) => {
  input.addEventListener('change', () => {
    handleFilterToggleChange(input);

    if (latestData) {
      render(latestData);
    }
  });
});

initializeStarField();
initializeCardSpotlight();
initializeFilterDropdown();
initializeSkinModal();
loadSkins();
