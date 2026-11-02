# Backup and restore

Run from the repository root against the canonical `truelook` Compose project described in [LOCAL_ENVIRONMENT.md](LOCAL_ENVIRONMENT.md). Back up before schema changes or mutating acceptance tests. Do not seed the main database to recreate an old demo.

## SQL snapshot

Choose a new filename for each snapshot:

```powershell
python .github/scripts/demo_backup.py backup demo-backups/truelook-before-change.sql
```

The script uses a transaction snapshot and writes the dump as raw UTF-8 bytes, including schema, migrations, accounts, variants, inventory and orders. It refuses to overwrite an existing file. A command failure can leave an incomplete file: only use a snapshot after the command exits successfully, then verify it with a restore into a new database.

```powershell
python .github/scripts/demo_backup.py restore demo-backups/truelook-before-change.sql --database truelook_restore_check
```

Restore refuses an existing database name and leaves the source database intact. Validate the restored schema and expected row counts before relying on it. To use the restored database, grant the application user access and deliberately update `DATABASE_URL` in the root `.env` to the new database at `mariadb:3306`, then recreate the API and worker. Keep the original database available for recovery.

## Images and recovery data

SQL dumps do not contain MinIO objects. Back up product images separately, especially admin uploads; preserve object keys and the configured bucket. There are no bundled seed images. Restore product photographs from your object-storage backup.

The ignored `demo-backups/` directory can contain credentials, customer data, SQL snapshots, volume archives and historical demo videos. Preserve these files and keep them private when copying to another machine. Historical videos document past runs and do not replace current acceptance testing.

The main environment's promotion backups and detached recovery volumes are described in [LOCAL_ENVIRONMENT.md](LOCAL_ENVIRONMENT.md). Do not start retired Compose stacks or attach recovery volumes to the running database. `docker compose down --volumes` deletes the current project's data volumes.
