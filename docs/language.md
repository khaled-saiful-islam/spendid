# Language (English and Bahasa Melayu)

The member app and Ask Spendid work in English and Bahasa Melayu. The admin console, API error
messages and emails are English for now.

## How people switch

- **Me → Language**, the sign-in/sign-up pages, or the onboarding first step.
- The choice is saved to the profile (`PUT /api/me/locale`), so it follows the person to every
  device. The page reloads once in the new language.
- Ask Spendid answers in Malay when the profile language is `ms`.
- Dates and weekday names use the language too (`dateLocale()`).

## How it works

- `apps/web/src/i18n/index.ts` — `t("English text", { vars })`, `tn(one, many, n)`, `getLang()`,
  `setLang()`, `dateLocale()`, `useT()`.
- The English sentence **is** the key. Malay lives in `apps/web/src/i18n/ms/*.ts` (split into a–d
  to keep files small); `ms.ts` merges them.
- Missing Malay falls back to English, so nothing ever shows blank.
- Values go in placeholders, never string concatenation: `t("{amount} left for today", { amount })`.
  Word order differs between languages.

## Adding text

1. Wrap new UI text in `t()` (module-level lists can call `t()` too; the language is fixed per page load).
2. Add the Malay line to one of `src/i18n/ms/*.ts`.
3. Check the screen at 390 px in both languages — Malay runs ~20% longer and must wrap, not cut.
