# Opening a menu homebase from OSS STW

Homebase Designer 1.7.1 accepts `--open-homebase <absolute local .sav path>`.
OSS STW finds the installed Viewer through Windows installation records and
checks `resources/homebase-open.json` for this capability before opening it.
In OSS STW, use Homebases, choose a saved homebase, then Open in viewer. The
launcher supplies a separate copy, preserving the in-game menu save.

Startup arguments open a new document. When Viewer is already running, Windows
forwards the arguments to its existing instance, which adds another document
without replacing unsaved edits. Requests wait while another document loads.
The native queue is bounded to eight entries and reads local GVAS saves up to
128 MiB. Renderer code receives file names and bytes through a fixed IPC method;
it cannot request arbitrary paths. Invalid and unreadable saves report an error.

The marker ships in both installer and folder packages. The installer verification
checks its bytes against the source and verifies the packaged runtime modules.
An older installed Viewer without this marker must be updated before the
launcher can open saves directly.

For a hidden integration check, set HOMEBASE_HANDOFF_FILE to a test save and run
`node tests/smoke/launcher-handoff.mjs`. Set VIEWER_EXE to test a packaged EXE.
This mode uses a separate temporary profile, disables updates, keeps the window
hidden and asserts that both startup and second-instance requests create tabs.
It never changes the source save. Normal launches show and focus the Viewer.
