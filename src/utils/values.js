function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

module.exports = {
  firstDefined,
};
