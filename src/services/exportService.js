const XLSX = require('xlsx');

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

function buildSummary(skinResponse) {
  const skins = flattenSkins(skinResponse.groups);
  const summary = {
    skins,
    exactPricedSkins: 0,
    estimatedPricedSkins: 0,
    unavailablePricedSkins: 0,
    freeSkins: 0,
    battlepassSkins: 0,
    exactVpTotal: 0,
    estimatedVpTotal: 0,
  };

  for (const skin of skins) {
    if (skin.priceLabel === 'Free') {
      summary.freeSkins += 1;
    }

    if (skin.priceLabel === 'Battlepass') {
      summary.battlepassSkins += 1;
    }

    if (typeof skin.priceVp === 'number') {
      if (skin.isPriceEstimated) {
        summary.estimatedPricedSkins += 1;
        summary.estimatedVpTotal += skin.priceVp;
      } else {
        summary.exactPricedSkins += 1;
        summary.exactVpTotal += skin.priceVp;
      }
    } else if (skin.priceLabel !== 'Free' && skin.priceLabel !== 'Battlepass') {
      summary.unavailablePricedSkins += 1;
    }
  }

  summary.combinedVpTotal = summary.exactVpTotal + summary.estimatedVpTotal;
  return summary;
}

function createSummarySheetData(skinResponse, summary) {
  return [
    ['VALORANT Skin Export'],
    [],
    ['Player', `${skinResponse.player.gameName}#${skinResponse.player.tagLine}`],
    ['Region', skinResponse.region],
    ['Shard', skinResponse.shard],
    ['Exported skins', skinResponse.totalSkins],
    ['Battlepass skins', skinResponse.battlepass.totalSkins],
    ['Limited skins', skinResponse.limited.totalSkins],
    [],
    ['Exact-priced skins', summary.exactPricedSkins],
    ['Estimated-priced skins', summary.estimatedPricedSkins],
    ['Free skins', summary.freeSkins],
    ['Battlepass skins', summary.battlepassSkins],
    ['Unavailable-price skins', summary.unavailablePricedSkins],
    [],
    ['Exact VP total', summary.exactVpTotal],
    ['Estimated VP total', summary.estimatedVpTotal],
    ['Combined VP total', summary.combinedVpTotal],
    [],
    ['Note', 'Estimated totals include tier-based approximations when exact store pricing was unavailable.'],
  ];
}

function createSkinsSheetData(summary) {
  return [
    [
      'Weapon',
      'Skin',
      'Price label',
      'VP value',
      'Price type',
      'Acquisition',
      'Battlepass',
      'Limited',
    ],
    ...summary.skins.map((skin) => [
      skin.weapon,
      skin.displayName,
      skin.priceLabel || 'Unknown',
      typeof skin.priceVp === 'number' ? skin.priceVp : '',
      getPriceType(skin),
      skin.acquisitionLabel || 'Price unavailable',
      skin.isBattlepass ? 'Yes' : 'No',
      skin.isLimited ? 'Yes' : 'No',
    ]),
  ];
}

function applyColumnWidths(sheet, widths) {
  sheet['!cols'] = widths.map((width) => ({ wch: width }));
}

function buildSkinWorkbook(skinResponse) {
  const summary = buildSummary(skinResponse);
  const workbook = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet(createSummarySheetData(skinResponse, summary));
  applyColumnWidths(summarySheet, [28, 42]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  const skinsSheet = XLSX.utils.aoa_to_sheet(createSkinsSheetData(summary));
  applyColumnWidths(skinsSheet, [14, 30, 18, 12, 16, 32, 12, 12]);
  XLSX.utils.book_append_sheet(workbook, skinsSheet, 'Skins');

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
