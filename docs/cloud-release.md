# Shop Keeper Cloud Release

GitHub is the release source of truth for Shop Keeper. A version tag now builds the desktop updater files and the signed Android artifacts from the same commit.

## What Gets Published

- Windows desktop updater assets:
  - `latest.yml`
  - `Shop-Keeper-Setup-<version>.exe`
  - `Shop-Keeper-Setup-<version>.exe.blockmap`
- Android artifacts:
  - `ShopKeeper-<version>-<versionCode>.aab`
  - `ShopKeeper-<version>-<versionCode>.apk`
- Optional Google Play upload from a manual workflow run.

## Required GitHub Secrets

- `ANDROID_KEYSTORE_BASE64`: Base64 copy of `android/app/shop-keeper-upload.jks`.
- `ANDROID_KEYSTORE_PROPERTIES_BASE64`: Base64 copy of `android/keystore.properties`.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: Google Play Developer API service-account JSON. This is only needed for Play Store upload.

Do not commit local signing files. They are intentionally ignored by Git.

## Release Steps

1. Bump these versions together:
   - `package.json`
   - `package-lock.json`
   - `android/app/build.gradle` `versionCode`
   - `android/app/build.gradle` `versionName`
2. Commit the release code.
3. Tag the exact commit:
   - `git tag v<version>`
4. Push the branch and tag:
   - `git push`
   - `git push origin v<version>`
5. Let the `Cloud Release` GitHub Actions workflow build and publish the release assets.

The desktop app updater reads `latest.yml` from the latest GitHub release. If `latest.yml`, the installer, or the blockmap are missing from a release, desktop auto-update will fail.

Windows desktop releases are built as one-click, per-machine NSIS installers so they match the existing `C:\Program Files\Shop Keeper` install. App-driven updates run the downloaded installer silently; the manual setup file may still request Windows elevation. The custom NSIS include closes only the real `Shop Keeper.exe` app process before installing so updater/helper processes do not trigger the stale "cannot be closed" loop.

## Google Play

Google Play upload requires a Play Console service account with permission to release the app. The workflow is ready for that secret, but it will skip the Play upload until `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` exists.

Useful setup pages:

- Google Play Developer API getting started: https://developers.google.com/android-publisher/getting_started
- Play Console release tracks: https://support.google.com/googleplay/android-developer/answer/9859348

Manual Play upload:

1. Go to GitHub Actions.
2. Run `Cloud Release`.
3. Set `publish_play` to `true`.
4. Choose the track, usually `internal` while we are still testing.

The Android package name is `com.shopkeeper.app`.
