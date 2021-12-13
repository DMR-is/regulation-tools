const esbuild = require('esbuild');
const pkg = require('./package.json');
const glob = require('glob').sync;
const { writeFileSync } = require('fs');
const { dtsPlugin } = require('esbuild-plugin-d.ts');
const exec = require('child_process').execSync;

// ---------------------------------------------------------------------------

const makePackageJson = (outdir) => {
  const { dist_package_json } = pkg;

  delete pkg.scripts;
  delete pkg.engines;
  delete pkg.private;
  delete pkg.devDependencies;
  delete pkg.dist_package_json;

  Object.assign(pkg, dist_package_json);

  writeFileSync(outdir + 'package.json', JSON.stringify(pkg, null, '\t'));
};

// ===========================================================================

const opts = process.argv.slice(2).reduce((map, arg) => {
  const [key, value] = arg.replace(/^-+/, '').split('=');
  map[key] = value == null ? true : value;
  return map;
}, {});

// ---------------------------------------------------------------------------

const srcdir = './src/';
const outdir = './dist/';
const entryPoints = glob(srcdir + '**/*.{ts,tsx}', {
  ignore: ['**/*.d.ts', '__test__'],
});

// ---------------------------------------------------------------------------

exec('rm -rf ' + outdir + ' && mkdir ' + outdir);
exec('cp README.md CHANGELOG.md ' + outdir);
makePackageJson(outdir);

esbuild
  .build({
    entryPoints,
    outdir,
    bundle: false,
    format: 'cjs',
    chunkNames: `chunks/[name]-[hash]`,

    define: {
      'process.env.DEV_FILE_SERVER': JSON.stringify(
        process.env.DEV_FILE_SERVER,
      ),
    },

    // external: [
    //   ...Object.keys(pkg.dependencies || {}),
    //   ...Object.keys(pkg.peerDependencies || {}),
    // ],

    watch: opts.watch,
    // minify: true,

    plugins: opts.watch ? undefined : [dtsPlugin({ outDir: outdir })],
  })
  .catch(() => process.exit(1));
