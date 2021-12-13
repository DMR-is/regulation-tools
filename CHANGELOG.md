# Change Log

## Upcoming...

- ... <!-- Add new lines here. -->

## 0.5.1 – 0.5.6, 0.5.67

_2021-12-10_

- feat: Rename all `ensure*` helpers - deprecate their old `assert*` names
- feat: Make all `ensure*` helpers accept `unknown` input values
- feat: Add helpers `ensureReasonableYear`, `ensureRegType`
- fix: Make `ensurePosInt` accept number typed input
- fix: Some modules were missing from build
- fix: Move cleanup-prettier's configs into a ts module
- fix: Inline htmldiff-js wrapper's type signature
- fix: Rename the private `_utils/*` folder to avoid accidental imports
- chore: Fix build target declaration and fix build globs
- chore: Set version-range on `htmldiff-js` git-dependency

## 0.5.0

_2021-12-10_

- **BREAKING** feat: Rename module to `@island.is/regulations-tools`
- feat: Add regulation API types — `Regulation`, `RegulationDiff`,
  `RegulationRedirect`, `Ministry`, `LawChapter`, etc...
- feat: Add lots of `/utils`
- feat: Add `/htmldiff-js` fork with bugfixes and size/speed improvements

## 0.4.8

_2021-10-11_

- feat: Support `.subchapter__title`s
- feat: Rename editor title/heading styles

## 0.4.6 – 0.4.7

_2021-10-11_

- feat: Block invalid image URLs
- feat: Warn about insecure (HTTP) links in regulation texts

## 0.4.3 – 0.4.5

_2021-10-01_

- feat: Add utility function `cleanupAllEditorOutputs()`
- feat: Export branded type `Year`
- fix: Clean `appendix.title`'s also along with other editor outputs

## 0.4.0 – 0.4.2

_2021-09-13_

- **BREAKING** feat: Remove prop `initialText` from `Editor` — Instead always
  read the initial value from `valueRef`
- **BREAKING** feat: `Editor` now requires `baseText` and `valueRef.current()`
  to be `HTMLText`
- fix: Retain Editor's `valueRef.current()` when component unmounts

## 0.3.6

_2021-09-08_

- fix: Trim extracted text and remove newlines from appendix titles

## 0.3.5

_2021-09-03_

- feat: Make `Editor`'s `baseText` prop optional - hide comparison if nully
- docs: Add some JSDoc texts for `EditorProps`

## 0.3.3 – 0.3.4

_2021-09-02_

- feat: Pass `aria-labelledBy`, `aria-describedBy` attributes to `Editor`
- feat: Add `onFocus`/`onBlur` props to `Editor`
- feat: Add idempotent `cleanTitle()` function
- feat: improvements to `dirtyClean`/`cleanupEditorOutput`

## 0.3.2

_2021-08-13_

- fix: Mismatch between `Editor`'s `valueRef.current()` and its internal
  "currentText"

## 0.3.1

_2021-08-12_

- fix: Huge lag when manualluy diffing large documents.

## 0.3.0

_2021-08-11_

- **BREAKING** feat: Add new `EditorClasses` prop `diffNowBtn`
- feat: Detect when htmldiff is super slow and switch to manual diffing
- feat: Support `.section__title` for "1. HLUTI" titles

## 0.2.5

_2021-08-09_

- feat: Support `.section__title` for "1. HLUTI" titles

## 0.2.2 – 0.2.4

_2021-07-09_

- feat: Add types `MinistrySlug`, `LawChapterSlug`, `RegluationType`
- chore: Update deps to fix lingering `qj` aliasing issue

## 0.2.1

_2021-07-08_

- chore: Cleanup dependencies: de-alias `qj` and drop `lodash`

## 0.2.0

_2021-07-05_

- chore: Remove `pkg.type` field
- feat: Add `comparisonpaneContainer` className prop to Editor component

## 0.1.5

_2021-06-24_

- feat: Add branded basic `types` module
- feat: Add `html` helpers module

## 0.1.2 – 0.1.4

_2021-06-22_

- feat: Add `editorBooting` to `EditorClasses`
- fix: Magical import paths
- fix: Load skin CSS from CDN for better portability
- fix: Use `React.Lazy` for dynamic importing `EditorFrame`
- fix: Add missing deps

## 0.1.0

_2021-06-21_

- feat: Refactor `regulations-editor` related tools into a standalone module
