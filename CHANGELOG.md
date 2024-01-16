# Change Log

## Upcoming...

## 0.7.13

_2024-01-16_

- fix: enable custom config in `EditorFrame`

## 0.7.12

_2023-11-06_

- fix: broken toolbar selector after react 18 upgrade

## 0.7.10 - 0.7.11

_2023-05-11_

- feat: load `htmldiff-js` from npm
- fix: rollback esbuild to 0.14 because of causing build errors with jsx

## 0.7.9

_2022-06-13_

- feat: add `lawChapters` to `RegulationOption`
- feat: add presigned file upload route
- fix: incorrect `repealed` prop in `RegulationOption`
- fix: more aggressive Title cleanup
- fix: update pdf css to better match old regulations

## 0.7.8

_2022-04-20_

- feat: Add `status` prop to `RegulationHistoryItem`

## 0.7.7

_2022-03-11_

- feat: Add props `readOnly`, `disabled` and `hideWarnings` to `Editor`
- feat: Add optional `wrapperDisabled`, `wrapperReadonly` to `EditorClasses`

## 0.7.5 – 0.7.6

_2022-01-31_

- feat: Export browser-safe `combineTextAppendixesComments` from `utils`
- fix: Bad/limited `_stripEmpty` html method

## 0.7.4

_2022-01-27_

- feat: Add `type` filed to `RegulationOption` type
- fix: Make all `TextWarning`-related methods require `HTMLText` as input

## 0.7.1 – 0.7.3

_2022-01-24_

- feat: Make `WarningList`'s `angst` values required
- feat: Add `setStrictMode()` toggler for the TextWarnings generator
- feat: Add prop `EditorProps.warningsAbove` (and change default to `false`)

## 0.7.0

_2022-01-23_

- **BREAKING** feat: Change signature of `EditorProps.fileUploader` to match
  TinyMCE
- **BREAKING** feat: Drop `EditorProps.name` …in favour of `fileUploader`
  handling it

## 0.6.0 – 0.6.1

_2022-01-22_

- **BREAKING** feat: Add `fileUploader` prop to `<Editor />`
- **BREAKING** feat: `replaceImageUrls()` now requires a `regName` as parameter
- feat(ts): Explicitly allow `PlainText` to be the empty string
- fix: `replaceImageUrls` now also collects linked resources that were uploaded
  to a temporary folder on the file-server while drafting a regulation

## 0.5.80 – 0.5.81

_2022-01-14_

- fix: `Editor` initialization edgecases missed some early change events.
- fix: Make `Editor` collapse empty HTML to `""` on export

## 0.5.79

_2022-01-13_

- fix: Prevent `ensureISODate` from throwing on bogus calendar dates

## 0.5.78

_2022-01-11_

- feat: Add types `RegulationOption`, `RegulationOptionList`
- refactor: Make `Editor` slimmer by decoupling from client-side dirtyClean
- fix: Tighten up `ensureNameSlug` and `ensureRegName` — to require 20th or 21st
  century years
- fix: `cleanupEditorOutput` wasn't idempotent on `data-legacy-indenter` spacers

## 0.5.76 – 0.5.77

_2021-12-28_

- feat: `Editor` now expects API to return "de-prettified" regulation texts
- fix: `Editor` showing false positive diff on initialization — (Caused by a
  breaking change in upstream TinyMCE MINOR-version update)

## 0.5.75

_2021-12-27_

- fix: Update `tinymce`, add workaround for a plugin-init regression

## 0.5.74

_2021-12-20_

- feat: `Editor` normalizes empty, single-element HTMLText to literal `''`
- fix: Make `Editor`'s `name` prop safer and document its purpose better

## 0.5.73

_2021-12-17_

- fix: Remove stray plugin reference in `Editor`

## 0.5.72

_2021-12-16_

- feat: Add branded string type `URLString` and helper `ensureURLString()`

## 0.5.70 – 0.5.71

_2021-12-15_

- feat: Move `combine`-/`extractAppendixesAndComments` and `eliminateComments`
  to `textHelpers` — deprecate importing them from `cleanupEditorOutputs`
- feat: Add type `RegulationTextProps`
- fix(ts): Import `globals.d.ts` where `htmldiff-js` typings are required —
  (helps local monorepo builds run)

## 0.5.68 – 0.5.69

_2021-12-14_

- feat: Remove non-sensical mapper functions from `utils`
- fix: Remove unused "dirty/original HTML" features from `<Editor/>`
- fix: Reclassify `@types/jest` as devDependency
- fix: Annoying import issue with htmldiff-js fork

## 0.5.1 – 0.5.6, 0.5.67

_2021-12-13_

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
