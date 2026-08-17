# dsh-session-archive

Manage archived sessions in the DeepSeek Harness Web UI: a Settings section
listing archived sessions per workspace, with one-click **unarchive** (with a
confirmation dialog).

- **Archiving** is built into dsh (session row menu → "Archive session");
  archived sessions are hidden from the sidebar automatically.
- **v1 scope**: list + unarchive. Permanent delete is intentionally absent
  (append-only session logs are the source of truth).
- Unarchive restores the session to its original position in its workspace.

## Install

```sh
dsh plugin --profile web add dsh-session-archive
# restart dsh, then hard-refresh the browser
```

## How it works

- Host half subclasses `WorkspaceRegistry` to add `unarchiveSession` (there is
  no official unarchive seam in dsh 0.1.0-rc.6) and registers
  `POST /plugins/dsh-session-archive/api/unarchive`.
- Browser half registers a `settings.section` ("Archived Sessions", after
  Plugins) that reads `archivedSessionIds` from the workspace store and renders
  groups per workspace with Unarchive buttons.
- Unarchive is idempotent and reversible; sessions can be re-archived anytime
  from the row menu.

## License

Apache License 2.0. Derived from
[MichengAI/dsh-archive-manager](https://github.com/MichengAI/dsh-archive-manager)
(Apache-2.0) — a lightweight rewrite scoped to unarchive + the manage page,
without its WorkspaceBrowser fork or permanent-delete surgery.
