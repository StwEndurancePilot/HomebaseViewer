# Source layout

| Folder                 | Responsibility                                                                    |
| ---------------------- | --------------------------------------------------------------------------------- |
| `src/app`              | Application startup, document state and command wiring                            |
| `src/core`             | Save parsing, exact transforms, editing rules, requirements and export validation |
| `src/cloud`            | Epic archive decoding and conversion into the capture schema                      |
| `src/scene`            | Three.js viewer, picking, camera controls and trap handles                        |
| `src/ui`               | Theme, DOM helpers, artwork and thumbnails                                        |
| `src/ui/panels`        | Structure editor, requirements and account panels                                 |
| `src/styles`           | Application, building and requirements styles                                     |
| `src/types`            | Account data and Electron bridge declarations                                     |
| `src/data`             | Generated edit patterns and perk definitions                                      |
| `src/penny`            | Adapted Penny rendering modules and zone definitions                              |
| `electron`             | Desktop entry point and sandboxed preload bridge                                  |
| `electron/updates`     | Background checks, downloads and guarded installer handoff                        |
| `scripts/release`      | Version selection, installer verification and GitHub publication                  |
| `electron/accounts`    | Epic session, account errors and read-only Penny account import                   |
| `tests`                | Unit and integration checks                                                       |
| `tests/smoke`          | Electron UI checks                                                                |
| `tests/fixtures`       | Fixture generators                                                                |
| `tests/native-checks`  | Container, attachment and replay validation against menu source                   |
| `tests/menu-runtime`   | Emitted menu loader checks with mocked engine natives                             |
| `scripts/build`        | Packaging and asset/catalog generators                                            |
| `scripts/checks`       | Source conventions                                                                |
| `scripts/audit`        | Read-only research and fidelity audits                                            |
| `scripts/maintenance`  | Explicit save repair tools                                                        |
| `scripts/preview`      | Development scene previews                                                        |
| `tools/asset-recovery` | Optional read-only CUE4Parse extraction helper                                    |
| `assets`               | Local geometry, textures, inventory art and provenance                            |
| `notices`              | Third-party license and provenance copies                                         |

Each class lives in a matching kebab-case file. Shared functions and types stay in modules named for their responsibility. `npm run check:structure` enforces class separation; Prettier and EditorConfig define formatting. Explanatory notes live in this folder instead of inline source comments.

The renderer imports and edits capture records. `EditorDocument` owns selection, history and revision tracking; core editing functions handle placement and support rules. `Viewer` renders those records without rewriting saved transforms. Export validation runs before either SAV or JSON download.

The renderer has no general network access. The main-process updater uses a separate network session and a narrow state/check/restart bridge. The preload exposes only account/download operations and download completion events. Epic sessions stay in the main process; Penny account files are read without modification.

The portable build includes compiled renderer files, Electron modules, user documentation, licenses and notices. Source, tests, recovery tools, local saves, private fixtures and build caches are excluded. Packaging verifies the compiled files byte-for-byte against `app.asar`.

## Native checks

```sh
dotnet run --project tests/native-checks/NativeChecks.csproj -- exported.sav
dotnet run --project tests/menu-runtime/MenuRuntime.csproj -- exported.sav
```

These require a sibling `RDW-source` checkout. The native checks accept an alternate `RdwSource` MSBuild property. The runtime harness mocks engine calls and does not establish live Fortnite placement acceptance.

## Asset generation

The CUE4Parse helper in `tools/asset-recovery` reads installed game archives. The generators in `scripts/build` consume its output and write local catalogs or meshes. Generated JSON and binary assets are excluded from formatting. Their provenance stays with the assets and is copied into the portable notices folder.
