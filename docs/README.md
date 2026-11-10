# TrueLook documentation

Start with the repository [README](../README.md) for installation, features and test commands.

| Guide | Purpose |
|---|---|
| [Local environment](LOCAL_ENVIRONMENT.md) | Canonical `truelook` project, ports, service commands and recovery volumes |
| [Migration notes](MIGRATION_NOTES.md) | Schema history, upgrades and destructive rollback limits |
| [Backup and restore](DEMO_BACKUP.md) | SQL snapshots, restore checks and separate image backups |
| [Payment setup](PAYMENT_SETUP.md) | Receiving-bank settings and the remaining provider integration work |
| [Demo payments](DEMO_PAYMENTS.md) | Simulated VietQR callbacks and manual confirmation |
| [Virtual try-on](VTON.md) | Architecture, mock vs. CatVTON engine, GPU setup, privacy and limits |
| [Design references](design-review/README.md) | Storefront and admin design direction |

The main environment uses frontend 3000, API 8000, MariaDB 3307, Redis 6381 and MinIO 9000/9001. Use the test commands in the repository README to collect current evidence; historical test totals do not establish the state of the current source.
