const BATTLEPASS_TRACKER_URL = 'https://battlepass.valorantfan.net';
const VALORANT_INFO_URL = 'https://valorantinfo.com';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const LEGACY_BATTLEPASS_SLUGS = [
  'closed-beta-rewards',
  'play-to-unlock-free-agents',
  'ignition-act-1',
  'ignition-act-2',
  'ignition-act-3',
  'formation-act-1',
  'formation-act-2',
  'formation-act-3',
  'yr1-anniversary-pass',
  'reflection-act-1',
  'reflection-act-2',
  'reflection-act-3',
  'disruption-act-1',
  'disruption-act-2',
  'riotx-arcane-pass',
  'dimension-act-1',
  'dimension-act-2',
  'dimension-act-3',
  'lunar-celebration-event-pass',
  'revelation-act-1',
  'revelation-act-2',
  'revelation-act-3',
  'evolution-act-1',
  'evolution-act-2',
];

let cachedCatalog = null;
let cacheExpiresAt = 0;
let pendingCatalogPromise = null;

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.text();
}

function createEmptyCatalog() {
  return {
    available: false,
    names: new Set(),
    partial: false,
    sourceWarnings: [],
  };
}

function collectWeaponTitles(html) {
  const matches = html.matchAll(/<a href="\/weapons\/[^"]+" title="([^"]+)"/g);
  const names = new Set();

  for (const match of matches) {
    names.add(match[1]);
  }

  return names;
}

async function fetchLegacyBattlepassNames() {
  const pages = await Promise.all(
    LEGACY_BATTLEPASS_SLUGS.map((slug) => fetchText(`${VALORANT_INFO_URL}/battlepass/${slug}`))
  );

  const names = new Set();

  for (const page of pages) {
    for (const name of collectWeaponTitles(page)) {
      names.add(name);
    }
  }

  return names;
}

function buildTrackerBattlepassUrl(battlepass) {
  if (battlepass.season) {
    return `${BATTLEPASS_TRACKER_URL}/api/battlepass/v2/${encodeURIComponent(
      battlepass.season
    )}/${encodeURIComponent(battlepass.act_number)}`;
  }

  return `${BATTLEPASS_TRACKER_URL}/api/battlepass/${encodeURIComponent(
    battlepass.episode_number
  )}/${encodeURIComponent(battlepass.act_number)}`;
}

async function fetchTrackerBattlepassNames() {
  const battlepasses = await fetchJson(`${BATTLEPASS_TRACKER_URL}/api/battlepass`);
  const details = await Promise.all(
    battlepasses.map((battlepass) => fetchJson(buildTrackerBattlepassUrl(battlepass)))
  );

  const names = new Set();

  for (const battlepass of details) {
    for (const level of battlepass.levels || []) {
      if (level.type === 'skin' && level.name) {
        names.add(level.name);
      }
    }
  }

  return names;
}

function mergeNameSets(...sets) {
  const merged = new Set();

  for (const set of sets) {
    for (const name of set) {
      merged.add(name);
    }
  }

  return merged;
}

async function buildBattlepassCatalog() {
  const [trackerResult, legacyResult] = await Promise.allSettled([
    fetchTrackerBattlepassNames(),
    fetchLegacyBattlepassNames(),
  ]);

  const sourceWarnings = [];
  const nameSets = [];

  if (trackerResult.status === 'fulfilled') {
    nameSets.push(trackerResult.value);
  } else {
    sourceWarnings.push(`Recent battlepass data: ${trackerResult.reason.message}`);
  }

  if (legacyResult.status === 'fulfilled') {
    nameSets.push(legacyResult.value);
  } else {
    sourceWarnings.push(`Historical battlepass data: ${legacyResult.reason.message}`);
  }

  if (nameSets.length === 0) {
    return {
      available: false,
      names: new Set(),
      partial: false,
      sourceWarnings,
    };
  }

  return {
    available: true,
    names: mergeNameSets(...nameSets),
    partial: sourceWarnings.length > 0,
    sourceWarnings,
  };
}

async function getBattlepassCatalog() {
  if (cachedCatalog && Date.now() < cacheExpiresAt) {
    return cachedCatalog;
  }

  if (!pendingCatalogPromise) {
    pendingCatalogPromise = buildBattlepassCatalog()
      .then((catalog) => {
        if (catalog.available) {
          cachedCatalog = catalog;
          cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        } else if (!cachedCatalog) {
          cachedCatalog = createEmptyCatalog();
          cacheExpiresAt = Date.now() + 60 * 1000;
        }

        return catalog.available ? catalog : cachedCatalog;
      })
      .finally(() => {
        pendingCatalogPromise = null;
      });
  }

  return pendingCatalogPromise;
}

module.exports = {
  getBattlepassCatalog,
};
