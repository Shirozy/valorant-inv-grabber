const VALORANT_INFO_URL = 'https://valorantinfo.com';
const WEAPON_SITEMAP_URL = `${VALORANT_INFO_URL}/sitemap.xml`;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CONCURRENCY_LIMIT = 8;

const FIXED_TIER_PRICES = {
  '12683d76-48d7-84a3-4e09-6985794f0445': 875,
  '0cebb8be-46d7-c12a-d306-e9907bfc5a25': 1275,
  '60bca009-4182-7998-dee7-b8a2558dc369': 1775,
};

const VARIABLE_TIER_LABELS = {
  'e046854e-406c-37f4-6607-19a9ba8426fc': 'Exclusive tier',
  '411e4a55-4e59-7757-41f0-86a53f101bb5': 'Ultra tier',
};

const VARIABLE_TIER_PRICE_ESTIMATES = {
  'e046854e-406c-37f4-6607-19a9ba8426fc': {
    melee: 4350,
    weapon: 2175,
  },
  '411e4a55-4e59-7757-41f0-86a53f101bb5': {
    melee: 4950,
    weapon: 2475,
  },
};

let cachedWeaponPageUrls = null;
let weaponPageUrlsExpireAt = 0;
let pendingWeaponPageUrlsPromise = null;

const pricingCache = new Map();
const pendingPricingPromises = new Map();

function getSkinCacheKey(skin) {
  return `${skin.weapon}::${skin.displayName}`;
}

async function fetchText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.text();
}

function slugify(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[''.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function formatVp(value) {
  return `${value.toLocaleString('en-US')} VP`;
}

function buildFallbackPricing(skin) {
  if (skin.isBattlepass) {
    return {
      acquisitionLabel: 'Battlepass reward',
      isPriceEstimated: false,
      priceLabel: 'Battlepass',
      priceVp: null,
    };
  }

  const fixedPrice = FIXED_TIER_PRICES[skin.contentTierUuid];
  if (fixedPrice) {
    return {
      acquisitionLabel: skin.isLimited ? 'Limited store skin' : 'Store skin',
      isPriceEstimated: true,
      priceLabel: formatVp(fixedPrice),
      priceVp: fixedPrice,
    };
  }

  const variableTierLabel = VARIABLE_TIER_LABELS[skin.contentTierUuid];
  if (variableTierLabel) {
    const estimatedPrice =
      VARIABLE_TIER_PRICE_ESTIMATES[skin.contentTierUuid]?.[
        skin.weapon === 'Melee' ? 'melee' : 'weapon'
      ] || null;

    return {
      acquisitionLabel: skin.isLimited ? 'Limited store skin' : 'Store skin',
      isPriceEstimated: true,
      priceLabel: estimatedPrice ? formatVp(estimatedPrice) : variableTierLabel,
      priceVp: estimatedPrice,
    };
  }

  return {
    acquisitionLabel: skin.isLimited ? 'Limited-time skin' : 'Price unavailable',
    isPriceEstimated: false,
    priceLabel: skin.isLimited ? 'Limited' : 'Unknown',
    priceVp: null,
  };
}

function extractSkinDescription(html) {
  const paragraphs = [
    ...html.matchAll(/<p[^>]*class="[^"]*text-justify[^"]*"[^>]*>([\s\S]*?)<\/p>/gi),
  ]
    .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return (
    paragraphs.find(
      (paragraph) =>
        paragraph.includes('Weapon Skin that can be obtained in Valorant') ||
        paragraph.includes('Skin that can be obtained in Valorant')
    ) || null
  );
}

function isValidDescriptionForSkin(description, skin) {
  return description.toLowerCase().includes(skin.displayName.toLowerCase());
}

function parsePricingFromDescription(description, skin) {
  const priceMatch = description.match(/store for (\d+) vp/i);
  const contractMatch = description.match(/Skin can be obtained from:\s*([^.]*)\./i);
  const sourceClaimsBattlepass = /could be obtained in the Battlepass/i.test(description);
  const cannotBePurchased = /cannot be purchased with in-game currency/i.test(description);
  const sourceClaimsNoContract = /not a reward in any contract/i.test(description);

  if (skin.isBattlepass) {
    return {
      acquisitionLabel: 'Battlepass reward',
      isPriceEstimated: false,
      priceLabel: 'Battlepass',
      priceVp: null,
    };
  }

  if (contractMatch) {
    return {
      acquisitionLabel: contractMatch[1].trim(),
      isPriceEstimated: false,
      priceLabel: 'Free',
      priceVp: null,
    };
  }

  if (priceMatch) {
    const priceVp = Number(priceMatch[1]);
    return {
      acquisitionLabel: skin.isLimited ? 'Limited store skin' : 'Store skin',
      isPriceEstimated: false,
      priceLabel: formatVp(priceVp),
      priceVp,
    };
  }

  // Some external item pages incorrectly mark newer store skins as battlepass/free.
  // Only trust "no store" style labels when we have a confirmed free source like a contract.
  if (sourceClaimsBattlepass || (cannotBePurchased && sourceClaimsNoContract)) {
    return buildFallbackPricing(skin);
  }

  if (cannotBePurchased) {
    return {
      acquisitionLabel: 'Free unlock',
      isPriceEstimated: false,
      priceLabel: 'Free',
      priceVp: null,
    };
  }

  return buildFallbackPricing(skin);
}

function buildCandidateSlugs(skin) {
  const candidates = [];
  const displayName = skin.displayName.trim();
  const weaponName = skin.weapon.trim();

  if (weaponName !== 'Melee') {
    const trailingWeaponPattern = new RegExp(`\\s+${weaponName}$`, 'i');
    const trimmedName = displayName.replace(trailingWeaponPattern, '').trim();
    if (trimmedName && trimmedName !== displayName) {
      candidates.push(slugify(trimmedName));
    }
  }

  candidates.push(slugify(displayName));

  const compactVariants = candidates
    .map((slug) => slug.replace(/(^|-)k-tac($|-)/g, '$1ktac$2'))
    .map((slug) => slug.replace(/(^|-)dot-exe($|-)/g, '$1dot-exe$2'));

  return [...new Set([...candidates, ...compactVariants].filter(Boolean))];
}

function buildCandidateUrls(skin, knownWeaponPageUrls) {
  const weaponSlug = skin.weapon === 'Melee' ? 'melee' : slugify(skin.weapon);
  const candidateUrls = buildCandidateSlugs(skin).map(
    (slug) => `${VALORANT_INFO_URL}/weapons/${weaponSlug}/${slug}`
  );

  const prioritized = [];
  const fallback = [];

  for (const url of candidateUrls) {
    if (knownWeaponPageUrls.has(url)) {
      prioritized.push(url);
    } else {
      fallback.push(url);
    }
  }

  return [...new Set([...prioritized, ...fallback])];
}

async function getWeaponPageUrls() {
  if (cachedWeaponPageUrls && Date.now() < weaponPageUrlsExpireAt) {
    return cachedWeaponPageUrls;
  }

  if (!pendingWeaponPageUrlsPromise) {
    pendingWeaponPageUrlsPromise = fetchText(WEAPON_SITEMAP_URL)
      .then((xml) => {
        const urls = new Set(
          [...xml.matchAll(/<loc>(https:\/\/valorantinfo\.com\/weapons\/[^<]+)<\/loc>/g)].map(
            (match) => match[1]
          )
        );
        cachedWeaponPageUrls = urls;
        weaponPageUrlsExpireAt = Date.now() + CACHE_TTL_MS;
        return urls;
      })
      .finally(() => {
        pendingWeaponPageUrlsPromise = null;
      });
  }

  return pendingWeaponPageUrlsPromise;
}

async function resolveSkinPricing(skin, knownWeaponPageUrls) {
  const cacheKey = getSkinCacheKey(skin);
  const cachedEntry = pricingCache.get(cacheKey);

  if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
    return cachedEntry.value;
  }

  if (!pendingPricingPromises.has(cacheKey)) {
    pendingPricingPromises.set(
      cacheKey,
      (async () => {
        try {
          for (const url of buildCandidateUrls(skin, knownWeaponPageUrls)) {
            try {
              const html = await fetchText(url);
              const description = extractSkinDescription(html);

              if (!description || !isValidDescriptionForSkin(description, skin)) {
                continue;
              }

              const pricing = parsePricingFromDescription(description, skin);
              pricingCache.set(cacheKey, {
                expiresAt: Date.now() + CACHE_TTL_MS,
                value: pricing,
              });
              return pricing;
            } catch {
              // Try the next candidate URL.
            }
          }

          const fallback = buildFallbackPricing(skin);
          pricingCache.set(cacheKey, {
            expiresAt: Date.now() + CACHE_TTL_MS,
            value: fallback,
          });
          return fallback;
        } finally {
          pendingPricingPromises.delete(cacheKey);
        }
      })()
    );
  }

  return pendingPricingPromises.get(cacheKey);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function enrichSkinsWithPricing(skins) {
  const uniqueSkins = [];
  const seen = new Set();

  for (const skin of skins) {
    if (!skin) {
      continue;
    }

    const cacheKey = getSkinCacheKey(skin);
    if (seen.has(cacheKey)) {
      continue;
    }

    seen.add(cacheKey);
    uniqueSkins.push(skin);
  }

  const knownWeaponPageUrls = await getWeaponPageUrls().catch(() => new Set());
  const pricingEntries = await mapWithConcurrency(uniqueSkins, CONCURRENCY_LIMIT, async (skin) => [
    getSkinCacheKey(skin),
    await resolveSkinPricing(skin, knownWeaponPageUrls),
  ]);

  const pricingMap = new Map(pricingEntries);

  return skins.map((skin) =>
    skin
      ? {
          ...skin,
          ...pricingMap.get(getSkinCacheKey(skin)),
        }
      : null
  );
}

module.exports = {
  enrichSkinsWithPricing,
};
