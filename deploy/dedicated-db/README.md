# Dedicated Postgres for one Operyx customer

One customer, one VPS, one database. The full onboarding recipe lives in
[docs/DEDICATED-ENVIRONMENTS.md](../../docs/DEDICATED-ENVIRONMENTS.md) — this folder is the part
that runs on the customer's server.

## Install (on a fresh Ubuntu VPS)

```bash
# 1. Docker
curl -fsSL https://get.docker.com | sh

# 2. This folder
mkdir -p /opt/operyx-db && cd /opt/operyx-db
# copy docker-compose.yml, .env.example, backup-now.sh, restore.sh here (scp or paste)

# 3. Password
cp .env.example .env
openssl rand -base64 24   # put the output in .env as POSTGRES_PASSWORD
chmod +x backup-now.sh restore.sh

# 4. Up
docker compose up -d
docker compose ps          # both containers healthy?
```

## Firewall — do this, it is not optional

The database must be reachable by Vercel and by the Operyx platform admin's connection test, and by
nobody else. On the VPS:

```bash
ufw allow OpenSSH
ufw enable
ufw allow 5432/tcp   # Postgres is password-protected, but see below
```

Vercel functions have no fixed IPs, so port 5432 stays open to the internet and the password is the
fence. That makes two things mandatory: the password is long and random (the openssl command above,
never a word), and Postgres 16's default `scram-sha-256` auth stays on (it is on in this image).
If the customer's droplet supports DigitalOcean Cloud Firewalls, add one allowing 5432 with the
same rule - defence in depth costs nothing.

## The connection strings

```
postgresql://operyx:<PASSWORD>@<VPS_IP>:5432/operyx
```

The same value goes in the customer's Vercel project as both `DATABASE_URL` and `DIRECT_URL` —
there is no pooler on a dedicated VPS, and at one salon's load none is needed.

## Day-2 operations

| Task | Command |
|---|---|
| Backup right now (before anything risky) | `./backup-now.sh` |
| Restore a backup | `./restore.sh backups/<file>.dump` |
| See backup history | `ls -lt backups/` |
| Logs | `docker compose logs --tail 100 db` |
| Slow queries (salon says "billing is slow") | `docker compose logs db \| grep duration` |
| Update Postgres minor version | `docker compose pull && docker compose up -d` |

Nightly dumps run at 02:30 IST inside the `backup` container, keeping the last 14. **Once a month,
copy the newest dump off the VPS** (to DO Spaces, Drive, anywhere not this disk) — a backup on the
same disk as the database protects against mistakes, not against the disk.

## Restore rehearsal — once, during onboarding

Run `./backup-now.sh`, then `./restore.sh` with that file, on day one while the database is nearly
empty. Ten minutes, and it converts "we have backups" from a belief into a fact. A backup that has
never been restored is a hope, not a backup.
