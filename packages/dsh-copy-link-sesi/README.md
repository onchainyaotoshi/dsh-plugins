# dsh-copy-link-sesi

Copy session deep links in the DeepSeek Harness Web UI and open sessions from
`?session=` URLs.

- A **"Salin link"** menu item in every session row (right under "Archive
  session") copies `<origin><path>?session=<sessionId>` to the clipboard.
- Opening a URL with `?session=<id>` opens that session automatically; the
  parameter is stripped from the URL afterwards, so a reload stays on the
  current session.

## Why a patch?

In dsh 0.1.0-rc.6 the session row menu (rename/fork/archive) is hardcoded in
`dsh-client-ui-workspace` with no slot seam, so this package ships:

1. a **browser bundle** (the deep-link opener, plain `sessions` service use),
2. a **host bundle** (verifies the menu patch is still present, warns in the
   log if a dsh upgrade removed it),
3. `scripts/apply-patch.mjs` — idempotently installs/checks the menu item
   patch in the global dsh install's `dsh-client-ui-workspace/lib/client.js`.

## Install

```sh
dsh plugin --profile web add ./packages/dsh-copy-link-sesi
node packages/dsh-copy-link-sesi/scripts/apply-patch.mjs
# restart dsh once, then hard-refresh the browser
```

After a `dsh` upgrade, re-run `scripts/apply-patch.mjs` (and restart).

## License

MIT
