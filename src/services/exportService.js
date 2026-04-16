const XLSX = require('xlsx');
const VP_PER_EUR = 100;
const CONTENT_TIER_LABELS = {
  '12683d76-48d7-84a3-4e09-6985794f0445': 'Select',
  '0cebb8be-46d7-c12a-d306-e9907bfc5a25': 'Deluxe',
  '60bca009-4182-7998-dee7-b8a2558dc369': 'Premium',
  'e046854e-406c-37f4-6607-19a9ba8426fc': 'Exclusive',
  '411e4a55-4e59-7757-41f0-86a53f101bb5': 'Ultra',
};

function sanitizeFilenamePart(value) {
  return String(value)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function toAsciiFilename(value) {
  return sanitizeFilenamePart(
    String(value)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, '-')
  );
}

function encodeContentDispositionFilename(value) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function flattenSkins(groups) {
  return groups.flatMap((group) =>
    group.skins.map((skin) => ({
      ...skin,
      weapon: group.weapon,
    }))
  );
}

function getPriceType(skin) {
  if (skin.priceLabel === 'Free') {
    return 'Free';
  }

  if (skin.priceLabel === 'Battlepass') {
    return 'Battlepass';
  }

  if (typeof skin.priceVp === 'number') {
    return skin.isPriceEstimated ? 'Estimated' : 'Exact';
  }

  return 'Unavailable';
}

function getContentTierLabel(contentTierUuid) {
  return CONTENT_TIER_LABELS[contentTierUuid] || 'Unknown';
}

function formatNumber(value) {
  return value.toLocaleString('en-US');
}

function getSkinCategory(skin) {
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

function getAcquisitionTypeLabel(skin) {
  if (skin.acquisitionType === 'battlepass') {
    return 'Battlepass';
  }

  if (skin.acquisitionType === 'contract') {
    return 'Contract';
  }

  if (skin.acquisitionType === 'limited') {
    return 'Limited store';
  }

  if (skin.acquisitionType === 'store') {
    return 'Store';
  }

  if (skin.acquisitionType === 'free') {
    return 'Free unlock';
  }

  return 'Unknown';
}

function buildSummary(skinResponse) {
  const skins = flattenSkins(skinResponse.groups);
  const summary = {
    skins,
    battlepassSkins: 0,
    contractSkins: 0,
    limitedSkins: 0,
    meleeSkins: 0,
    normalSkins: 0,
    paidPricedSkins: 0,
    exactPricedSkins: 0,
    freeSkins: 0,
    pricedSkins: 0,
    uniqueWeapons: new Set(),
    unavailablePricedSkins: 0,
    estimatedPricedSkins: 0,
    exactVpTotal: 0,
    estimatedVpTotal: 0,
  };

  for (const skin of skins) {
    summary.uniqueWeapons.add(skin.weapon);

    if (skin.weapon === 'Melee') {
      summary.meleeSkins += 1;
    }

    if (skin.isBattlepass) {
      summary.battlepassSkins += 1;
    } else if (skin.isContract) {
      summary.contractSkins += 1;
    } else if (skin.isLimited) {
      summary.limitedSkins += 1;
    } else {
      summary.normalSkins += 1;
    }

    if (skin.priceLabel === 'Free') {
      summary.freeSkins += 1;
    }

    if (typeof skin.priceVp === 'number') {
      summary.pricedSkins += 1;

      if (skin.isPriceEstimated) {
        summary.estimatedPricedSkins += 1;
        summary.estimatedVpTotal += skin.priceVp;
      } else {
        summary.exactPricedSkins += 1;
        summary.exactVpTotal += skin.priceVp;
      }

      if (skin.priceLabel !== 'Free' && skin.priceLabel !== 'Battlepass') {
        summary.paidPricedSkins += 1;
      }
    } else if (skin.priceLabel !== 'Free' && skin.priceLabel !== 'Battlepass') {
      summary.unavailablePricedSkins += 1;
    }
  }

  summary.combinedVpTotal = summary.exactVpTotal + summary.estimatedVpTotal;
  summary.exactEurTotal = summary.exactVpTotal / VP_PER_EUR;
  summary.estimatedEurTotal = summary.estimatedVpTotal / VP_PER_EUR;
  summary.combinedEurTotal = summary.combinedVpTotal / VP_PER_EUR;
  summary.uniqueWeapons = summary.uniqueWeapons.size;
  return summary;
}

function createOverviewSheetData(skinResponse, summary) {
  return [
    ['VALORANT Skin Export'],
    [],
    ['Player', `${skinResponse.player.gameName}#${skinResponse.player.tagLine}`],
    ['Region', skinResponse.region],
    ['Shard', skinResponse.shard],
    ['Exported at', new Date().toISOString()],
    ['Exported skins', summary.skins.length],
    ['Unique weapons', summary.uniqueWeapons],
    ['Melee skins', summary.meleeSkins],
    [],
    ['Normal skins', skinResponse.normal?.totalSkins ?? summary.normalSkins],
    ['Battlepass skins', skinResponse.battlepass.totalSkins],
    ['Limited skins', skinResponse.limited.totalSkins],
    ['Contract skins', skinResponse.contract?.totalSkins ?? summary.contractSkins],
    [],
    ['Battlepass catalog available', skinResponse.battlepass.available ? 'Yes' : 'No'],
    ['Battlepass catalog partial', skinResponse.battlepass.partial ? 'Yes' : 'No'],
    [],
    ['Exact-priced skins', summary.exactPricedSkins],
    ['Estimated-priced skins', summary.estimatedPricedSkins],
    ['Paid priced skins', summary.paidPricedSkins],
    ['Free skins', summary.freeSkins],
    ['Priced skins total', summary.pricedSkins],
    ['Unavailable-price skins', summary.unavailablePricedSkins],
    [],
    ['Exact VP total', formatNumber(summary.exactVpTotal)],
    ['Estimated VP total', formatNumber(summary.estimatedVpTotal)],
    ['Combined VP total', formatNumber(summary.combinedVpTotal)],
    ['Exact EUR total', summary.exactEurTotal.toFixed(2)],
    ['Estimated EUR total', summary.estimatedEurTotal.toFixed(2)],
    ['Combined EUR total', summary.combinedEurTotal.toFixed(2)],
    [],
    ['Note', 'Estimated totals include tier-based approximations when exact store pricing was unavailable.'],
  ];
}

function createDetailedSkinsSheetData(summary) {
  return [
    [
      'Weapon',
      'Skin',
      'Category',
      'Acquisition type',
      'Acquisition detail',
      'Content tier',
      'Content tier UUID',
      'Price label',
      'VP value',
      'EUR value',
      'Price type',
      'Price estimated',
      'Battlepass',
      'Limited',
      'Contract',
      'Skin UUID',
      'Theme UUID',
      'Image URL',
    ],
    ...summary.skins.map((skin) => [
      skin.weapon,
      skin.displayName,
      getSkinCategory(skin),
      getAcquisitionTypeLabel(skin),
      skin.acquisitionLabel || 'Price unavailable',
      getContentTierLabel(skin.contentTierUuid),
      skin.contentTierUuid || '',
      skin.priceLabel || 'Unknown',
      typeof skin.priceVp === 'number' ? skin.priceVp : '',
      typeof skin.priceVp === 'number' ? Number((skin.priceVp / VP_PER_EUR).toFixed(2)) : '',
      getPriceType(skin),
      skin.isPriceEstimated ? 'Yes' : 'No',
      skin.isBattlepass ? 'Yes' : 'No',
      skin.isLimited ? 'Yes' : 'No',
      skin.isContract ? 'Yes' : 'No',
      skin.uuid || '',
      skin.theme || '',
      skin.image || '',
    ]),
  ];
}

function createWeaponBreakdownSheetData(summary) {
  const weaponMap = new Map();

  for (const skin of summary.skins) {
    if (!weaponMap.has(skin.weapon)) {
      weaponMap.set(skin.weapon, {
        weapon: skin.weapon,
        totalSkins: 0,
        exactVp: 0,
        estimatedVp: 0,
        battlepassSkins: 0,
        limitedSkins: 0,
        contractSkins: 0,
      });
    }

    const entry = weaponMap.get(skin.weapon);
    entry.totalSkins += 1;
    entry.battlepassSkins += skin.isBattlepass ? 1 : 0;
    entry.limitedSkins += skin.isLimited ? 1 : 0;
    entry.contractSkins += skin.isContract ? 1 : 0;

    if (typeof skin.priceVp === 'number') {
      if (skin.isPriceEstimated) {
        entry.estimatedVp += skin.priceVp;
      } else {
        entry.exactVp += skin.priceVp;
      }
    }
  }

  const rows = [...weaponMap.values()].sort((left, right) => left.weapon.localeCompare(right.weapon));

  return [
    [
      'Weapon',
      'Total skins',
      'Battlepass skins',
      'Limited skins',
      'Contract skins',
      'Exact VP',
      'Estimated VP',
      'Total VP',
      'Total EUR',
    ],
    ...rows.map((entry) => [
      entry.weapon,
      entry.totalSkins,
      entry.battlepassSkins,
      entry.limitedSkins,
      entry.contractSkins,
      entry.exactVp,
      entry.estimatedVp,
      entry.exactVp + entry.estimatedVp,
      Number(((entry.exactVp + entry.estimatedVp) / VP_PER_EUR).toFixed(2)),
    ]),
  ];
}

function createCategoryBreakdownSheetData(summary) {
  const categories = [
    {
      name: 'Normal',
      skins: summary.skins.filter((skin) => !skin.isBattlepass && !skin.isLimited && !skin.isContract),
    },
    {
      name: 'Battlepass',
      skins: summary.skins.filter((skin) => skin.isBattlepass),
    },
    {
      name: 'Limited',
      skins: summary.skins.filter((skin) => skin.isLimited),
    },
    {
      name: 'Contract',
      skins: summary.skins.filter((skin) => skin.isContract),
    },
  ];

  return [
    [
      'Category',
      'Skin count',
      'Exact priced skins',
      'Estimated priced skins',
      'Free skins',
      'Exact VP',
      'Estimated VP',
      'Total VP',
      'Total EUR',
    ],
    ...categories.map(({ name, skins }) => {
      const exactVp = skins.reduce(
        (sum, skin) => (typeof skin.priceVp === 'number' && !skin.isPriceEstimated ? sum + skin.priceVp : sum),
        0
      );
      const estimatedVp = skins.reduce(
        (sum, skin) => (typeof skin.priceVp === 'number' && skin.isPriceEstimated ? sum + skin.priceVp : sum),
        0
      );

      return [
        name,
        skins.length,
        skins.filter((skin) => typeof skin.priceVp === 'number' && !skin.isPriceEstimated).length,
        skins.filter((skin) => typeof skin.priceVp === 'number' && skin.isPriceEstimated).length,
        skins.filter((skin) => skin.priceLabel === 'Free').length,
        exactVp,
        estimatedVp,
        exactVp + estimatedVp,
        Number(((exactVp + estimatedVp) / VP_PER_EUR).toFixed(2)),
      ];
    }),
  ];
}

function addAutoFilter(sheet, endColumnLetter, endRowNumber) {
  sheet['!autofilter'] = {
    ref: `A1:${endColumnLetter}${endRowNumber}`,
  };
}

function createSkinNotesSheetData() {
  return [
    ['Field', 'Meaning'],
    ['Category', 'High-level bucket used by the app: Normal, Battlepass, Limited, or Contract.'],
    ['Acquisition type', 'Pricing source classification such as Store, Limited store, Contract, Battlepass, or Free unlock.'],
    ['Price label', 'Human-readable price text shown in the app.'],
    ['VP value', 'Numeric VP amount when available.'],
    ['EUR value', 'Calculated using the simple assumption that 1000 VP = EUR 10.'],
    ['Price type', 'Exact, Estimated, Free, Battlepass, or Unavailable.'],
    ['Price estimated', 'Yes when the VP value is based on tier estimates instead of exact public pricing.'],
    ['Content tier', 'VALORANT content tier bucket inferred from the content tier UUID.'],
    ['Theme UUID', 'Theme identifier returned by VALORANT metadata.'],
    ['Image URL', 'Skin image used by the app at export time.'],
    ['Battlepass catalog partial', 'Yes means the battlepass lookup source may not be fully complete.'],
  ];
}

function createAcquisitionBreakdownSheetData(summary) {
  const acquisitionMap = new Map();

  for (const skin of summary.skins) {
    const acquisitionType = getAcquisitionTypeLabel(skin);

    if (!acquisitionMap.has(acquisitionType)) {
      acquisitionMap.set(acquisitionType, {
        acquisitionType,
        skinCount: 0,
        exactVp: 0,
        estimatedVp: 0,
        exactCount: 0,
        estimatedCount: 0,
      });
    }

    const entry = acquisitionMap.get(acquisitionType);
    entry.skinCount += 1;

    if (typeof skin.priceVp === 'number') {
      if (skin.isPriceEstimated) {
        entry.estimatedVp += skin.priceVp;
        entry.estimatedCount += 1;
      } else {
        entry.exactVp += skin.priceVp;
        entry.exactCount += 1;
      }
    }
  }

  return [
    [
      'Acquisition type',
      'Skin count',
      'Exact priced skins',
      'Estimated priced skins',
      'Exact VP',
      'Estimated VP',
      'Total VP',
      'Total EUR',
    ],
    ...[...acquisitionMap.values()]
      .sort((left, right) => left.acquisitionType.localeCompare(right.acquisitionType))
      .map((entry) => [
        entry.acquisitionType,
        entry.skinCount,
        entry.exactCount,
        entry.estimatedCount,
        entry.exactVp,
        entry.estimatedVp,
        entry.exactVp + entry.estimatedVp,
        Number(((entry.exactVp + entry.estimatedVp) / VP_PER_EUR).toFixed(2)),
      ]),
  ];
}

function createSkinsSheetData(summary) {
  return [
    [
      'Weapon',
      'Skin',
      'Category',
      'Price label',
      'VP value',
      'EUR value',
      'Price type',
      'Acquisition type',
      'Battlepass',
      'Limited',
      'Contract',
    ],
    ...summary.skins.map((skin) => [
      skin.weapon,
      skin.displayName,
      getSkinCategory(skin),
      skin.priceLabel || 'Unknown',
      typeof skin.priceVp === 'number' ? skin.priceVp : '',
      typeof skin.priceVp === 'number' ? Number((skin.priceVp / VP_PER_EUR).toFixed(2)) : '',
      getPriceType(skin),
      getAcquisitionTypeLabel(skin),
      skin.isBattlepass ? 'Yes' : 'No',
      skin.isLimited ? 'Yes' : 'No',
      skin.isContract ? 'Yes' : 'No',
    ]),
  ];
}

function applyColumnWidths(sheet, widths) {
  sheet['!cols'] = widths.map((width) => ({ wch: width }));
}

function buildSkinWorkbook(skinResponse) {
  const summary = buildSummary(skinResponse);
  const workbook = XLSX.utils.book_new();

  const overviewSheet = XLSX.utils.aoa_to_sheet(createOverviewSheetData(skinResponse, summary));
  applyColumnWidths(overviewSheet, [30, 42]);
  XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Overview');

  const skinsSheet = XLSX.utils.aoa_to_sheet(createSkinsSheetData(summary));
  applyColumnWidths(skinsSheet, [14, 30, 14, 18, 12, 12, 16, 18, 12, 12, 12]);
  addAutoFilter(skinsSheet, 'K', createSkinsSheetData(summary).length);
  XLSX.utils.book_append_sheet(workbook, skinsSheet, 'Skins');

  const detailedSkinsSheet = XLSX.utils.aoa_to_sheet(createDetailedSkinsSheetData(summary));
  applyColumnWidths(detailedSkinsSheet, [14, 30, 14, 18, 34, 14, 38, 18, 12, 12, 14, 12, 12, 12, 38, 38, 68]);
  addAutoFilter(detailedSkinsSheet, 'Q', createDetailedSkinsSheetData(summary).length);
  XLSX.utils.book_append_sheet(workbook, detailedSkinsSheet, 'Detailed Skins');

  const weaponBreakdownSheet = XLSX.utils.aoa_to_sheet(createWeaponBreakdownSheetData(summary));
  applyColumnWidths(weaponBreakdownSheet, [14, 12, 16, 14, 14, 12, 14, 12, 12]);
  addAutoFilter(weaponBreakdownSheet, 'I', createWeaponBreakdownSheetData(summary).length);
  XLSX.utils.book_append_sheet(workbook, weaponBreakdownSheet, 'By Weapon');

  const categoryBreakdownSheet = XLSX.utils.aoa_to_sheet(createCategoryBreakdownSheetData(summary));
  applyColumnWidths(categoryBreakdownSheet, [14, 12, 18, 18, 12, 12, 14, 12, 12]);
  addAutoFilter(categoryBreakdownSheet, 'I', createCategoryBreakdownSheetData(summary).length);
  XLSX.utils.book_append_sheet(workbook, categoryBreakdownSheet, 'By Category');

  const acquisitionBreakdownSheet = XLSX.utils.aoa_to_sheet(createAcquisitionBreakdownSheetData(summary));
  applyColumnWidths(acquisitionBreakdownSheet, [18, 12, 18, 18, 12, 14, 12, 12]);
  addAutoFilter(acquisitionBreakdownSheet, 'H', createAcquisitionBreakdownSheetData(summary).length);
  XLSX.utils.book_append_sheet(workbook, acquisitionBreakdownSheet, 'By Acquisition');

  const notesSheet = XLSX.utils.aoa_to_sheet(createSkinNotesSheetData());
  applyColumnWidths(notesSheet, [28, 90]);
  XLSX.utils.book_append_sheet(workbook, notesSheet, 'Notes');

  const safePlayer = sanitizeFilenamePart(
    `${skinResponse.player.gameName}-${skinResponse.player.tagLine}`
  );
  const filename = `${safePlayer || 'valorant-skins'}-skins.xlsx`;
  const asciiFilename = `${toAsciiFilename(safePlayer || 'valorant-skins') || 'valorant-skins'}-skins.xlsx`;

  return {
    buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    filename,
    contentDisposition: `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeContentDispositionFilename(
      filename
    )}`,
  };
}

module.exports = {
  buildSkinWorkbook,
};
