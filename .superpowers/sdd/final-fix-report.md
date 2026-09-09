# Final Fix Report

## Red Evidence

Added a regression test in `packages/app/src/i18n/parity.test.ts` before changing locale data.

Command:

`bun test --conditions=solid --preload ./happydom.ts ./src/i18n/parity.test.ts`

Result: failed as expected with `Received: "OpenCode Desktop"` for `app.name.desktop`.

## Green Evidence

- `bun test --conditions=solid --preload ./happydom.ts ./src/i18n/parity.test.ts`: 6 passed, 0 failed, 1101 expectations.
- `bun test --conditions=solid --preload ./happydom.ts ./src/i18n/desktop-native.test.ts`: 9 passed, 0 failed, 519 expectations.
- `bun typecheck` from `packages/app`: passed (`tsgo -b`).
- `git diff --check`: passed.
- Locale audit: all supported locale identity labels contain `OpenCode+`.

## Changed Files

- `packages/app/src/i18n/parity.test.ts`: verifies both identity labels in every supported locale.
- `packages/app/src/i18n/desktop-native.ts`: updates the English accessibility label.
- `packages/app/src/i18n/en.ts` and `packages/app/src/i18n/{am,ar,az,bg,bn,br,bs,ca,cs,da,de,dv,dz,el,es,et,fa,fi,fo,fr,hi,hy,id,it,ja,ka,km,ko,lo,lt,lv,mk,mn,ms,my,ne,nl,no,pa,pl,ro,ru,si,sk,sl,sq,sr,sv,tg,th,tk,tr,uk,ur,uz,vi,zh,zht}.ts`: add `+` to the existing translated desktop app-name and menu accessibility labels.
- `packages/app/src/i18n/{hr,hu,is,lt}.ts`: make the same change in their array-backed native menu translations and app-name labels.

No component changes were needed because both settings dialogs already use `language.t("app.name.desktop")`.

## Commit

`085599dbee fix(app): complete localized fork branding`

## Self-Review

- Product marker is exactly `OpenCode+` in both settings labels and menu accessibility labels.
- Existing translated wording, punctuation, ordering, API/CLI identifiers, URLs, app IDs, schemes, and sub-brands were not changed.
- Native-menu translation behavior remains locale-aware; only the identity token changed.
- The regression test covers all supported app locales and the existing native bundle test remains green.

## Concerns

- Locale wording is preserved rather than linguistically re-reviewed; only the required product marker was changed.
- The requested package-app verification passed; no desktop package typecheck was needed for this app-only follow-up.
