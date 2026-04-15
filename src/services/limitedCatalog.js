const LIMITED_SKIN_NAME_PATTERNS = [
  /^Arcane /,
  /^Champions 20\d{2} /,
  /^VCT LOCK\/\/IN /,
  /^VCT 20\d{2} /,
  /^VCT\d{2} x /,
  /^VCT x /,
  /^Ignite /,
  /^Blades of Imperium$/,
];

function isLimitedSkinName(name) {
  return LIMITED_SKIN_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

module.exports = {
  isLimitedSkinName,
};
