const app = document.getElementById('app');
const message = document.getElementById('message');
const meta = document.getElementById('meta');
const refreshButton = document.getElementById('refreshBtn');
const downloadButton = document.getElementById('downloadBtn');
const searchInput = document.getElementById('searchInput');
const collectionFilterInput = document.getElementById('collectionFilterInput');
const starContainer = document.getElementById('star-container');

let latestData = null;

const CONTENT_TIER_TO_RARITY = {
  '12683d76-48d7-84a3-4e09-6985794f0445': 'select',
  '0cebb8be-46d7-c12a-d306-e9907bfc5a25': 'deluxe',
  '60bca009-4182-7998-dee7-b8a2558dc369': 'premium',
  'e046854e-406c-37f4-6607-19a9ba8426fc': 'exclusive',
  '411e4a55-4e59-7757-41f0-86a53f101bb5': 'ultra',
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

function syncFilterAvailability(data) {
  const battlepassAvailable = Boolean(data.battlepass?.available);
  const battlepassOption = collectionFilterInput.querySelector('option[value="battlepass"]');
  const nonBattlepassOption = collectionFilterInput.querySelector(
    'option[value="non-battlepass"]'
  );

  battlepassOption.disabled = !battlepassAvailable;
  nonBattlepassOption.disabled = !battlepassAvailable;

  if (!battlepassAvailable && ['battlepass', 'non-battlepass'].includes(collectionFilterInput.value)) {
    collectionFilterInput.value = 'all';
  }
}

function render(data) {
  latestData = data;
  const filter = searchInput.value.trim().toLowerCase();
  syncFilterAvailability(data);
  const filterMode = collectionFilterInput.value;

  meta.innerHTML = [
    `<div><strong>Player:</strong> ${escapeHtml(`${data.player.gameName}#${data.player.tagLine}`)}</div>`,
    `<div><strong>Region:</strong> ${escapeHtml(data.region)}</div>`,
    `<div><strong>Shard:</strong> ${escapeHtml(data.shard)}</div>`,
    `<div><strong>Total skins:</strong> ${escapeHtml(data.totalSkins)}</div>`,
    `<div><strong>Battlepass skins:</strong> ${escapeHtml(data.battlepass?.totalSkins ?? 0)}</div>`,
    `<div><strong>Limited skins:</strong> ${escapeHtml(data.limited?.totalSkins ?? 0)}</div>`,
  ].join('');

  const groups = data.groups
    .map((group) => ({
      ...group,
      skins: group.skins.filter((skin) => {
        if (filterMode === 'limited' && !skin.isLimited) {
          return false;
        }

        if (filterMode === 'battlepass' && !skin.isBattlepass) {
          return false;
        }

        if (filterMode === 'non-battlepass' && skin.isBattlepass) {
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

  if (!groups.length) {
    const emptyTextByMode = {
      all: 'No skins matched your filter.',
      limited: 'No limited skins matched your filter.',
      battlepass: 'No battlepass skins matched your filter.',
      'non-battlepass': 'No non-battlepass skins matched your filter.',
    };
    const emptyText = emptyTextByMode[filterMode] || emptyTextByMode.all;
    app.innerHTML = `<div class="empty">${emptyText}</div>`;
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
                  <article class="card" data-rarity="${escapeHtml(getRarityKey(skin))}">
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
collectionFilterInput.addEventListener('input', () => {
  if (latestData) {
    render(latestData);
  }
});

initializeStarField();
initializeCardSpotlight();
loadSkins();
