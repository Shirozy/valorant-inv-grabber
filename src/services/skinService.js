const { getBattlepassCatalog } = require('./battlepassCatalog');
const { enrichSkinsWithPricing } = require('./pricingService');
const { getOwnedSkinIds, getSessionData, readLockfile } = require('./riotClient');
const {
  getWeaponMetadata,
  groupAndSortSkins,
  markSkinFlags,
} = require('./weaponCatalog');

async function buildSkinResponse() {
  const lockfile = readLockfile();
  const session = await getSessionData(lockfile);
  const [ownedSkinIds, skinMap, battlepassCatalog] = await Promise.all([
    getOwnedSkinIds(session),
    getWeaponMetadata(),
    getBattlepassCatalog(),
  ]);

  const markedSkins = markSkinFlags(ownedSkinIds, skinMap, battlepassCatalog);
  const ownedSkins = await enrichSkinsWithPricing(markedSkins);
  const groups = groupAndSortSkins(ownedSkins);
  const totalBattlepassSkins = groups.reduce(
    (sum, group) => sum + group.skins.filter((skin) => skin.isBattlepass).length,
    0
  );
  const totalLimitedSkins = groups.reduce(
    (sum, group) => sum + group.skins.filter((skin) => skin.isLimited).length,
    0
  );

  return {
    battlepass: {
      available: battlepassCatalog.available,
      partial: battlepassCatalog.partial,
      totalSkins: totalBattlepassSkins,
    },
    groups,
    limited: {
      available: true,
      totalSkins: totalLimitedSkins,
    },
    player: {
      gameName: session.gameName,
      tagLine: session.tagLine,
    },
    region: session.region,
    shard: session.shard,
    totalSkins: groups.reduce((sum, group) => sum + group.skins.length, 0),
  };
}

module.exports = {
  buildSkinResponse,
};
