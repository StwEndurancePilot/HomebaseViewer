# Setup and automatic releases

The update repository is [StwEndurancePilot/HomebaseViewer](https://github.com/StwEndurancePilot/HomebaseViewer). It must stay public for updates without a GitHub login. No GitHub token is included in the app.

## First release

Push the project to the repository's default branch, currently `main`. Include `.github/workflows`; the existing `.gitignore` excludes local builds, saves and dependencies.

The **Release** workflow then:

1. Installs the locked dependencies and runs formatting, structure, TypeScript and unit checks.
2. Chooses the next patch version above both `package.json` and existing GitHub tags/releases, including unfinished drafts.
3. Builds the Windows x64 installer, updater configuration and download manifest.
4. Tests the packaged viewer, including a real local updater download and corrupt-download rejection.
5. Uploads the release assets to a draft, verifies their SHA-256 digests, then publishes the release as latest.

The initial source baseline is `1.7.0`, so the first automatic release will be `1.7.1` unless a higher version already exists. Versions and tags use plain `X.Y.Z`. The workflow updates the build's package files without making a bot commit; subsequent versions come from GitHub's release/tag history. For a minor or major release, raise the source baseline before pushing.

Push again to release another version, or use **Actions → Release → Run workflow** on the default branch. Pull requests and other branches run the read-only Check workflow. Release builds are serialized; GitHub may replace an older queued run with the latest push while another run is still building. A failed build never changes the published update feed. A failed upload leaves an unpublished draft for inspection.

GitHub Actions uses its built-in `GITHUB_TOKEN` with release-write permission. No personal token is needed. If the repository or organization disables Actions or restricts token permissions, enable them before the first run. The checkout, Node setup and artifact actions are pinned to verified commits.

## What users install

Download `Homebase-Viewer-Setup-X.Y.Z.exe` from Releases. Setup installs for the current Windows user, creates shortcuts and upgrades the existing installation in place. It preserves app data and does not modify saved blueprints. Users switching from the old portable folder should install Setup once and use the new shortcut.

The installed app checks GitHub three seconds after each launch. New stable releases download in the background. A dot on the Updates button indicates that an update is ready. It installs on a normal close, or immediately after **Restart & update** closes the window. The existing unsaved-edit prompt can cancel that close. Installation is deferred if Windows reports session shutdown. Offline or failed checks leave the editor usable; **Check for updates** retries.

Downloads use electron-updater's SHA-512 verification and its Windows publisher verification when signing is configured. Prereleases and downgrades are disabled. Development and portable builds do not auto-update.

Each GitHub release contains three assets:

- `Homebase-Viewer-Setup-X.Y.Z.exe`
- `Homebase-Viewer-Setup-X.Y.Z.exe.blockmap`
- `latest.yml`

Keep all three together. `latest.yml` contains the installer version, size and checksum. The build verification report stays in the Actions artifacts instead of the public release assets.

## Windows signing

The setup works unsigned, but Windows may show an unknown-publisher or SmartScreen prompt. To sign future releases, configure:

| Setting                    | Location         | Value                                                            |
| -------------------------- | ---------------- | ---------------------------------------------------------------- |
| `WINDOWS_CSC_LINK`         | Actions secret   | Base64-encoded signing certificate supported by electron-builder |
| `WINDOWS_CSC_KEY_PASSWORD` | Actions secret   | Certificate password                                             |
| `WINDOWS_PUBLISHER_NAME`   | Actions variable | Exact certificate publisher name                                 |

Use the same publisher identity for subsequent updates. Signature verification is not disabled in code.

## Local builds

```sh
npm ci
npm run check
npm run setup
```

The setup and verification report are written under `artifacts/releases/<version>/`. `npm run release:build` requires a GitHub repository and produces update metadata without publishing. Repository selection is `HOMEBASE_REPOSITORY`, then GitHub Actions' `GITHUB_REPOSITORY`, then the Git origin, then `package.json`.

For another output disk, set `HOMEBASE_BUILD_OUTPUT` to an absolute output directory. Electron's download cache can be moved with `ELECTRON_CACHE`, and installer tools with `ELECTRON_BUILDER_CACHE`. Standard `TEMP`/`TMP` control build scratch space.

Run the packaged smoke checks by setting `VIEWER_EXE` to the output folder's `win-unpacked/Homebase Viewer.exe` and running `npm run test:smoke`. The updater smoke uses a local fixture feed and never executes the downloaded installer.

The installer uses electron-builder NSIS and electron-updater. Their [update documentation](https://www.electron.build/docs/features/auto-update/) describes the release metadata and supported installer target. This project pins its dependencies in `package-lock.json`.
