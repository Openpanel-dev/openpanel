# Dashboard languages

The dashboard has 30 browser-local interface languages under **Account → Profile → Language**.
English is the default. Hindi (`hi`) is the Indian language included in this initial set.
Arabic, Persian, Hebrew and Urdu set the document and Radix component direction to RTL.

## Runtime behavior

- `languages.ts` is the locale allowlist. Cookie values are normalized and validated before choosing a local catalog.
- `messages.ts` creates an independent i18next instance for each provider/server request. English messages are the fallback; translation state is never shared between users.
- English is bundled with the application. Other JSON catalogs are loaded from the application's own assets, only when selected. No external translation service is called.
- The initial locale and catalog are resolved before server rendering. The selector waits for hydration, changes the live interface, and persists the validated locale through a same-origin server function in a one-year, SameSite=Lax preference cookie.
- A failed catalog load preserves the previous selection and shows an accessible error. `html[lang]`, `html[dir]`, Radix direction and number/interval formatting follow the selected language.
- This preference belongs to a browser, including signed-out pages. It is not an account field or an organization/project setting.

## Translating UI

Use `useTranslation().t('English source message')` for string props and `TranslationText` for JSX text. Keep English keys identical to `locales/en.json` and add every key to all catalogs.
Do not translate event/property names, project/report names, identifiers, error payloads, code snippets, or other user-supplied data. This is UI localization, not analytics data translation.

The initial catalogs are machine-assisted, generated locally using the MIT-licensed `facebook/m2m100_418M` model. Core navigation/settings labels were manually corrected. Native-speaker review is still needed, especially for longer analytics descriptions and less common languages. Some composed/dynamic copy and date-picker labels retain English; the catalog tests guarantee key completeness, not linguistic accuracy or complete extraction of all existing copy.

To review a language, update its JSON file without changing keys. Keep OpenPanel, API names, URLs and interpolation placeholders intact. Translations are rendered as React text, never HTML.

## Verification

`bun run --filter start test` checks all 30 catalogs, locale validation, English fallback, isolated SSR instances, direction, preference persistence, user-data preservation and the hydration guard.
`DASHBOARD_URL=<running dashboard> bun run --filter start e2e -- language-settings.spec.ts` exercises the real account settings for all 30 languages, navigation, reload, invalid cookies and failed catalog downloads. The existing `.seed.json` and auth setup supply the test account; no process is started by these tests.
Set `I18N_SCREENSHOT_DIR` to capture masked English, Russian, Arabic, Hindi and Chinese screenshots. Input values are masked. Do not commit authentication state, traces containing credentials, or `.seed.json`.

Self-hosters need a dashboard rebuild/redeploy. There are no database migrations, environment variables or backend API changes for this feature.
