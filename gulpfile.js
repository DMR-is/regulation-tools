const { parallel, series, src, dest } = require('gulp');
const rollupTaskFactory = require('@hugsmidjan/gulp-rollup');
const del = require('del');
const writeFile = require('fs').writeFileSync;

// ===========================================================================

const { srcFolder, scriptsBundleMap, distFolder } = (() => {
  const glob = require('glob');

  const srcFolder = 'src/';
  const distFolder = 'dist/';

  const ignoreGlobs = {
    tests: '__test__/**/*',
    declarations: '**/*.d.ts',
    dummyPartials: '**/_*.{js,ts,tsx}', // No entry points should start with "_"
    privates: '**/*.privates.{js,ts,tsx}', // `*.privates.js` contain private bits that need testing
    wip: '**/*.WIP.{js,ts,tsx}', // Scripts that should not be bundled/published yet
  };

  const getEntrypoints = () =>
    glob.sync(srcFolder + '*.{ts,tsx}', {
      ignore: Object.values(ignoreGlobs).map((glob) => srcFolder + glob),
    });

  const stripExt = (path) => path.replace(/\.[^.]+$/, '');
  const makeInputMap = (
    files /*: Array<string> */,
  ) /*: { [fileName:string]: string } */ =>
    Object.fromEntries(
      files.map((fileName) => {
        const outToken = stripExt(fileName).slice(srcFolder.length);
        return [outToken, fileName];
      }),
    );

  return {
    srcFolder,
    distFolder,
    scriptsBundleMap: makeInputMap(getEntrypoints()),
  };
})();

// ===========================================================================

// Returns true for local module ids (treats node_modules/*  as external)
const isNonLocalModule = (id) =>
  !/^(?:\0|\.|\/|tslib|@hugsmidjan\/react)/.test(id);

// ===========================================================================

const [scriptsBundle] = rollupTaskFactory({
  src: srcFolder,
  format: 'cjs',
  minify: false,
  sourcemaps: false,
  NODE_ENV: undefined, // disable replacement during build
  name: 'scripts',
  entryPoints: scriptsBundleMap,
  dist: distFolder,
  replaceOpts: {
    'process.env.DEV_FILE_SERVER': JSON.stringify(''), // Always unset when building for production
  },
  inputOpts: {
    external: isNonLocalModule,
  },
  outputOpts: {
    chunkFileNames: '_chunks/[name]-[hash].js',
    exports: 'auto',
  },
  typescriptOpts: {
    // TODO: Remove as soon as https://github.com/rollup/plugins/issues/286 is fixed
    tsconfig: './tsconfig-editor.json',
    declaration: true,
  },
});

// ===========================================================================

const cleanup = () => del([distFolder]);

const purgeExtraDTSFiles = () => {
  const dtsRoot = distFolder + '__types/';
  return del([dtsRoot + '*'], {
    ignore: [dtsRoot + '{lib,types,utils}'],
  }).then(() => del(dtsRoot + 'lib/{__test__,utils}'));
};

const makePackageJson = (done) => {
  // TODO: Rename back to package.json as soon as https://github.com/rollup/plugins/issues/286 is fixed
  const pkg = require('./_package.json');
  const { dist_package_json } = pkg;

  delete pkg.scripts;
  delete pkg.engines;
  delete pkg.private;
  delete pkg.devDependencies;
  delete pkg.dist_package_json;

  Object.assign(pkg, dist_package_json);
  writeFile(distFolder + 'package.json', JSON.stringify(pkg, null, '\t'));
  done();
};

const copyDocs = () =>
  src(['README.md', 'CHANGELOG.md'], {
    // TODO: Remove as soon as https://github.com/rollup/plugins/issues/286 is fixed
    cwd: 'regulations-editor/',
  }).pipe(dest(distFolder));

// ===========================================================================

const publishPrep = parallel(purgeExtraDTSFiles, makePackageJson, copyDocs);

exports.build = series(cleanup, scriptsBundle, publishPrep);
exports.default = scriptsBundle;
