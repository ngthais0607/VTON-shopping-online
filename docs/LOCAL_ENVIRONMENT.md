# Main local TrueLook environment

The canonical Docker Compose project is `truelook`. Run commands from `D:\fastapi-founder`; `.env` selects the project and port bindings. The retired `fastapi-founder` and `truelook-demo` projects must not be started alongside it.

| Service | Address |
|---|---|
| Store | http://localhost:3000/store |
| Admin | http://localhost:3000/login |
| API documentation | http://localhost:8000/docs |
| API health | http://localhost:8000/api/v1/health |
| MariaDB | 127.0.0.1:3307 |
| Redis | 127.0.0.1:6381 (container port 6379) |
| MinIO API | http://localhost:9000 |
| MinIO console | http://localhost:9001 |

```powershell
docker compose ps
docker compose up -d --wait
docker compose logs --tail 100 api arq_worker frontend
docker compose stop
```

After changing browser-facing API or image addresses, rebuild the frontend: its `NEXT_PUBLIC_*` settings are compiled into JavaScript.

```powershell
docker compose build frontend
docker compose up -d --no-deps frontend
```

The main database retains the name `fastapi_founder` for compatibility. Docker services and their canonical data volumes belong to the `truelook` project; the database name does not create an additional Docker project.

The independent Windows `Redis` service keeps port 6379. TrueLook publishes Redis on 6381; its API and worker continue using `redis:6379` inside the Compose network.

The 2026-11-01 promotion preserves the existing TrueLook catalog, accounts, orders, sessions and image storage. It does not merge data from the older shop. Private SQL/configuration/volume backups are under `demo-backups/promotion-20261101T063524Z/`, which is ignored by Git. These files include credentials and customer data; keep them private. Superseded demo verification reports were moved to `demo-backups/docs-cleanup-20261101/`; their old ports are not startup instructions for the main environment.

The retired containers and networks have been removed. Their original `fastapi-founder_*_data` and `truelook-demo_*_data` volumes are detached and retained for recovery; the running environment mounts only `truelook_*_data` volumes. Do not attach recovery and canonical database volumes to the same database process.

The cleaned application code has been built and deployed to the main environment. Post-deployment checks cover storefront navigation, product variants and the local cart, authentication, dashboard endpoints, catalog queries and image delivery. Business table row counts were preserved; authentication checks create normal session audit records.

The verified release backup is under `demo-backups/release-20261101T155221Z/`. Its SQL dump was restored into an isolated MariaDB instance: all 12 tables matched the saved row counts, data checksums and schema hashes. The temporary restore container and volume have been removed. SQL, image-storage and configuration backups remain private, along with the `truelook-rollback-{api,frontend,arq_worker,migrate}:20261101t155221z` images for recovery. These backups contain credentials and application data; do not publish them.

Do not run `docker compose down -v` unless you intend to delete the main database, cache and image volumes.
