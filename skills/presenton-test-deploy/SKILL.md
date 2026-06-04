---
name: presenton-test-deploy
description: Use when deploying, patch-layering, backing up, verifying, smoke testing, or debugging the Pear Presenton test instance at presenton-test.intern.pearcommerce.com / EC2 i-030ec83d92fe974e5, especially backend-only FastAPI fixes for QBR strict-contract rendering while preserving SQLite and /opt/presenton/app_data.
---

# Presenton Test Deploy

Use this for Pear's hosted Presenton test box:

- Host: `https://presenton-test.intern.pearcommerce.com`
- EC2: `i-030ec83d92fe974e5`
- Service: `presenton.service`
- Env file: `/etc/presenton/presenton.env`
- Persistent data: `/opt/presenton/app_data:/app_data`

## Hard Rules

- Never wipe, recreate, replace, or reinitialize `/opt/presenton/app_data`.
- Never set `RESET_AUTH` or `AUTH_OVERRIDE_FROM_ENV`.
- Do not print auth secrets. Source `/etc/presenton/presenton.env` when a remote curl needs credentials.
- Always back up service/env/config and SQLite before restarting.
- Use `docker exec -i` when feeding Python through stdin.
- Rollback is image-only unless the user explicitly approves restoring DB/config files.

## Fast Backend Patch Lane

Use this only for narrowly scoped backend Python changes where the currently running image is otherwise acceptable.

1. Commit the Presenton change and push it to `Pear-Commerce/presenton main`.
2. On the instance, clone or update the pushed SHA under `/opt/presenton/builds/presenton-$SHORT_SHA`.
3. Build a derivative image from the currently running image:
   - tag: `ghcr.io/pear-commerce/presenton:contract-preserving-$SHORT_SHA`
   - set `PRESENTON_BUILD_SHA`, `PRESENTON_BUILD_REF=main`, `PRESENTON_SOURCE_REPO=Pear-Commerce/presenton`
   - copy only the changed backend files, e.g. `/app/servers/fastapi/utils/generation_contract.py`
4. Run the backup block before service restart.
5. Replace only the old image tag in `/etc/systemd/system/presenton.service`.
6. `systemctl daemon-reload && systemctl restart presenton.service`.
7. Verify image, mount, data files, row counts, `/api/v1/version`, and a deterministic contract smoke.

If frontend, Dockerfile, runtime dependency, export runtime, OS package, or Node build output changes, use the full image lane instead of a patch layer.

## Backup Block

Before restart, create a host backup directory and SQLite backups through the running container:

```bash
TS="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/opt/presenton/deploy-backups/${TS}"
sudo install -d -m 700 "${BACKUP_DIR}"
sudo cp /etc/presenton/presenton.env "${BACKUP_DIR}/presenton.env"
sudo cp /etc/systemd/system/presenton.service "${BACKUP_DIR}/presenton.service"
sudo docker inspect presenton --format '{{.Config.Image}}' | sudo tee "${BACKUP_DIR}/current-image.txt"
sudo cp /opt/presenton/app_data/userConfig.json "${BACKUP_DIR}/userConfig.json"
sudo cp /opt/presenton/app_data/userConfig.json.bak "${BACKUP_DIR}/userConfig.json.bak"
```

Then use `docker exec -i presenton python` to run SQLite `source.backup(dest)` for:

- `/app_data/fastapi.db`
- `/app_data/mem0/history.db`

Capture table row counts before and after restart.

## Bundled Checks

Run these from any local shell with AWS CLI access:

```bash
skills/presenton-test-deploy/scripts/status.sh
skills/presenton-test-deploy/scripts/date_contract_smoke.sh
```

`status.sh` is read-only: service state, image/mount, no unsafe auth reset vars, data files, row counts, and version.

`date_contract_smoke.sh` is read-only: imports the deployed FastAPI contract code inside the container and asserts prose-only ISO dates do not become strict exact terms.

