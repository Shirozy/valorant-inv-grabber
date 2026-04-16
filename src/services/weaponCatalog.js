const { WEAPON_ORDER } = require('../config/constants');
const { isLimitedSkinName } = require('./limitedCatalog');
const { firstDefined } = require('../utils/values');

async function httpFetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

function normalizeWeaponName(name) {
  if (!name) {
    return 'Unknown';
  }

  if (name.toLowerCase().includes('knife') || name.toLowerCase().includes('melee')) {
    return 'Melee';
  }

  return name;
}

function buildWeaponSortIndex(name) {
  const normalized = normalizeWeaponName(name);
  const index = WEAPON_ORDER.indexOf(normalized);
  return index === -1 ? WEAPON_ORDER.length + 1 : index;
}

async function getWeaponMetadata() {
  const data = await httpFetchJson('https://valorant-api.com/v1/weapons?language=en-US');
  const weapons = Array.isArray(data?.data) ? data.data : [];
  const skinMap = new Map();

  for (const weapon of weapons) {
    const weaponName = normalizeWeaponName(weapon.displayName);

    for (const skin of weapon.skins || []) {
      const image = firstDefined(
        skin.displayIcon,
        skin.chromas?.[0]?.displayIcon,
        skin.levels?.[0]?.displayIcon,
        weapon.displayIcon
      );

      const skinDetails = {
        assetPath: skin.assetPath || '',
        chromas: (skin.chromas || []).map((chroma) => ({
          displayIcon: chroma.displayIcon || '',
          displayName: chroma.displayName || skin.displayName,
          fullRender: chroma.fullRender || '',
          streamedVideo: chroma.streamedVideo || '',
          swatch: chroma.swatch || '',
          uuid: chroma.uuid,
        })),
        contentTierUuid: skin.contentTierUuid,
        displayName: skin.displayName,
        image,
        levels: (skin.levels || []).map((level) => ({
          displayIcon: level.displayIcon || '',
          displayName: level.displayName || skin.displayName,
          levelItem: level.levelItem || '',
          streamedVideo: level.streamedVideo || '',
          uuid: level.uuid,
        })),
        wallpaper: skin.wallpaper || '',
        theme: skin.themeUuid || 'Theme',
        uuid: skin.uuid,
        weapon: weaponName,
      };

      skinMap.set(skin.uuid, skinDetails);

      for (const level of skin.levels || []) {
        skinMap.set(level.uuid, {
          ...skinDetails,
          uuid: level.uuid,
        });
      }
    }
  }

  return skinMap;
}

function markSkinFlags(ownedSkinIds, skinMap, battlepassCatalog) {
  const battlepassNames = battlepassCatalog?.names || new Set();

  return ownedSkinIds.map((id) => {
    const skin = skinMap.get(id);

    if (!skin) {
      return null;
    }

    return {
      ...skin,
      isBattlepass: battlepassCatalog?.available ? battlepassNames.has(skin.displayName) : false,
      isLimited: isLimitedSkinName(skin.displayName),
    };
  });
}

function groupAndSortSkins(skins) {
  const seen = new Set();
  const resolved = [];

  for (const skin of skins) {
    if (!skin) {
      continue;
    }

    const dedupeKey = `${skin.weapon}::${skin.displayName}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    resolved.push(skin);
  }

  resolved.sort((left, right) => {
    const weaponDiff = buildWeaponSortIndex(left.weapon) - buildWeaponSortIndex(right.weapon);

    if (weaponDiff !== 0) {
      return weaponDiff;
    }

    return left.displayName.localeCompare(right.displayName);
  });

  const grouped = new Map();

  for (const skin of resolved) {
    if (!grouped.has(skin.weapon)) {
      grouped.set(skin.weapon, []);
    }

    grouped.get(skin.weapon).push(skin);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => buildWeaponSortIndex(left[0]) - buildWeaponSortIndex(right[0]))
    .map(([weapon, skins]) => ({ skins, weapon }));
}

module.exports = {
  getWeaponMetadata,
  groupAndSortSkins,
  markSkinFlags,
};
