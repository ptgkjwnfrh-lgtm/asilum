# Backup and restore

**Status: REHEARSED.** The procedure below was run end to end against the live
database on **August 14, 2026** — a real dump was taken, restored into a
throwaway database, and checked table by table. Result: **59 tables, 99,074
rows, schema v28, every table matched, 17.9 seconds.** The throwaway was
dropped and nothing in production was written to.

That sentence is the point of this document. A backup nobody has restored is a
hope, not a backup.

---

## The two scripts

```bash
node scripts/backup-database.mjs            # take a verified backup
node scripts/restore-drill.mjs              # prove the newest backup restores
```

Both read `.env.local` themselves. Both require **`DATABASE_ADMIN_URL`** (the
owner connection), and the backup script *refuses* to run without it.

### Why owner-only, and not `DATABASE_URL`

`DATABASE_URL` connects as `asilum_app`, the least-privilege application role.
`pg_dump` run as that role **does not fail** on tables it cannot read — it dumps
what it can see and exits `0`. The result is a backup that looks healthy and is
silently missing tables, which is worse than having no backup at all, because
you stop worrying about it.

So `backup-database.mjs` refuses to run as `asilum_app`, and then **proves**
completeness: it lists the live tables from `information_schema`, lists what is
actually inside the archive with `pg_restore -l`, and fails loudly if any table
is missing. It does not take the dump's word for it.

---

## Taking a backup

```bash
node scripts/backup-database.mjs --out /path/to/backups
```

Writes two files:

- `asilum-<timestamp>.dump` — custom format (`-Fc`): compressed, and
  `pg_restore` can read it selectively, which is what you want at 3am.
- `asilum-<timestamp>.manifest.json` — schema version, table count, **per-table
  row counts**, byte size, and the `pg_dump` version that wrote it.

The manifest is not decoration. It is the yardstick the drill measures the
restore against; without it a restore can only be checked against a guess.

**Where to keep them.** The `backups/` directory is git-ignored — a database
dump must never be committed. Copy them somewhere that survives this laptop.

---

## Rehearsing the restore

```bash
node scripts/restore-drill.mjs                     # newest dump in BACKUP_DIR
node scripts/restore-drill.mjs path/to/one.dump    # or a specific one
```

The drill:

1. Creates a throwaway database (`asilum_restore_drill_<random>`).
2. Restores the dump into it.
3. Compares **every table's row count** against the manifest, and checks the
   restored schema version matches.
4. Drops the throwaway — always, even if the restore failed.

Exit code `0` means restorable; `1` means the dump did not restore faithfully
and should not be trusted.

### The safety guards

This script drops a database, so it is deliberately hard to point at the wrong
one:

- The target name is generated here and must match
  `^asilum_restore_drill_[0-9a-z]{6,}$`. **The drop refuses any name that does
  not match**, so there is no argument you can pass that makes it drop
  production.
- It refuses to run if the generated target equals the source database.
- The only statements it issues against the source are `CREATE DATABASE` and
  `DROP DATABASE` for its own scratch target. Production rows are never read for
  modification, never written, never deleted.

---

## What the drill proved, and what it did not

**Proved:** every application table restores with exactly the row count it had
when the dump was taken, and the schema version comes back intact.

**Honest caveat, found during the rehearsal:** `pg_restore` reported one error
it could not apply —

```
permission denied to set parameter "log_min_messages"
CREATE FUNCTION realtime.list_changes(...)
```

That is a **Supabase-managed internal object** (the `realtime` schema), not
ASILUM data. Recreating it requires superuser, which no connection string we
hold has. This matters for how a real recovery works:

- Restoring into **a fresh Supabase project** is the supported path: Supabase
  provisions its own `realtime`/`auth`/`storage` internals, and this dump
  supplies the application data on top.
- Restoring into a **plain Postgres** server will restore all ASILUM data and
  skip those Supabase internals. Fine for forensics or a local investigation;
  not a drop-in production replacement.

Anything not verified above is not claimed here.

---

## Real recovery: the order to do it in

1. **Stop writing.** Take the app down or put it in maintenance — restoring
   under live traffic gives you a mix of two eras.
2. **Take a backup of the broken state first.** Whatever went wrong, the
   evidence is in there, and you only get one chance to keep it.
3. **Provision the target** — a fresh Supabase project is the supported path
   (see the caveat above).
4. **Restore**:
   ```bash
   pg_restore -d "$TARGET_ADMIN_URL" --no-owner --no-privileges -j 4 asilum-<timestamp>.dump
   ```
5. **Re-apply the role setup.** The dump is taken `--no-owner --no-privileges`,
   so the `asilum_app` role and its grants are *not* in it. Run:
   ```bash
   node scripts/configure-database-role.mjs
   node scripts/apply-schema.mjs --all --verify-idempotent
   ```
   The migrations are idempotent by design, and `--verify-idempotent` is what CI
   runs.
6. **Check the row counts** against the manifest of the dump you restored, the
   same comparison the drill makes.
7. **Point the app at it**: update `DATABASE_URL` / `DATABASE_ADMIN_URL` /
   `NEXT_PUBLIC_SUPABASE_*` and redeploy.
8. **Walk the site** before reopening writes — `/`, `/hotlist`, `/discover`,
   `/profile`, and `/stats` (its operating dashboards read the substrate
   directly and will show whether the data really landed).

---

## Cadence

Nothing here is automatic yet — these are scripts an operator runs. Suggested
until scheduled backups exist:

- **Before every schema migration.** A migration is the most likely reason to
  need this.
- **Weekly**, while the wire has real posts in it.
- **Re-run the drill after any change to the schema or the role setup**, and
  update the "Status: REHEARSED" line at the top with the new date and numbers.
  A stale rehearsal date is a warning, not a formality.

Supabase's own daily backups still exist and are the first thing to reach for on
the free tier; these scripts give a copy that is **ours**, verified, and
restorable somewhere Supabase is not.

---

## Tooling note

`pg_dump` / `psql` / `pg_restore` (PostgreSQL 18.4) live in
`~/.local/libpq/18.4/` on this machine — extracted there rather than installed
system-wide, matching the convention already used for `node` and `gh`. Both
scripts find them automatically and fall back to whatever is on `PATH`.
Override with `PG_BIN` if they live elsewhere.
