const mappify = (
  list: Array<string> | string,
): Record<string, true | undefined> => {
  list = typeof list === 'string' ? list.split(/\s*,\s*/) : list;
  return list.reduce<Record<string, true>>((map, key) => {
    map[key] = true;
    return map;
  }, {});
};

export default mappify;
