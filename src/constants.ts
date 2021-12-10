export const FILE_SERVER =
  process.env.DEV_FILE_SERVER ||
  // NOTE: This is the real URL that is baked into the regulation texts
  // It should not be changed in production unless you're also going to
  // rewrite all regulation texts. Just don't touch this, please!
  'https://files.reglugerd.is';
