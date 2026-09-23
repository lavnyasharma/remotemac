# Self-hosting on your own server (Google Cloud VM)

The shared backend runs on free servers, so it can be slow to wake up and may not connect on
every network (see [Known issues](../README.md#known-issues)). You can run your own backend
instead. It's a single VM with four containers:

| Container  | What it does                                                        |
| ---------- | ------------------------------------------------------------------- |
| `postgres` | Stores accounts, devices, and pairings                              |
| `backend`  | Handles sign-in, pairing, and WebRTC signaling (runs migrations on start) |
| `caddy`    | Gets a free HTTPS certificate and proxies HTTPS/WSS to the backend  |
| `coturn`   | TURN relay, so your iPhone can reach your Mac on any network        |

Your screen and keystrokes still go directly between your devices, encrypted by WebRTC. The
server only relays them (still encrypted) when a direct path isn't possible.

This guide uses Google Cloud, but any Ubuntu VPS works (DigitalOcean, Hetzner, AWS Lightsail).
Skip the `gcloud` steps and open the same ports in that provider's firewall.

## 1. Create the VM

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com) and enable
   billing. New accounts get free credit.
2. Go to **Compute Engine → VM instances → Create instance**:
   - **Machine type:** `e2-small` is plenty. `e2-micro` in `us-west1`, `us-central1`, or
     `us-east1` is in GCP's always-free tier, but it's tight on memory while building the image.
   - **Boot disk:** Ubuntu 24.04 LTS, 20 GB.
   - **Firewall:** tick *Allow HTTP* and *Allow HTTPS*.
   - **Network tags** (under *Advanced → Networking*): add `remotemac`.
3. Reserve a static IP so the address never changes: **VPC network → IP addresses → Reserve
   external static IP**, and attach it to the VM.
4. Note both IPs from the VM list: **External IP** (`PUBLIC_IP`) and **Internal IP**
   (`PRIVATE_IP`).

## 2. Open the TURN ports

HTTP and HTTPS are already open. TURN also needs port 3478 and a small UDP relay range. In
**Cloud Shell** (the `>_` icon in the console):

```bash
gcloud compute firewall-rules create remotemac-turn --target-tags=remotemac --allow=tcp:3478,udp:3478,udp:49160-49200
```

## 3. Pick a domain

Apple requires HTTPS, and HTTPS needs a hostname. You have two options:

- **Free, no setup:** use `<PUBLIC_IP>.sslip.io`, for example `34.123.45.67.sslip.io`. It
  already resolves to your IP.
- **Your own domain:** add a DNS `A` record, for example `remotemac.yourdomain.com`, pointing
  to `PUBLIC_IP`.

## 4. Install Docker and start everything

SSH into the VM (click **SSH** in the VM list), then install Docker:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
```

Clone the repo and create your config:

```bash
git clone https://github.com/lavnyasharma/remotemac.git
cd remotemac/infra/selfhost
cp .env.example .env
nano .env
```

Fill in `DOMAIN`, `PUBLIC_IP` and `PRIVATE_IP`. Then generate a separate value for each of
`POSTGRES_PASSWORD`, `JWT_SECRET` and `TURN_PASSWORD` with:

```bash
openssl rand -hex 32
```

Start the stack:

```bash
docker compose up -d --build
```

The first build takes a few minutes. Then check that it's up:

```bash
curl https://YOUR_DOMAIN/health
```

It should print `{"status":"ok",...}`. If HTTPS fails, give Caddy a minute to get the
certificate and check the logs with `docker compose logs caddy`.

## 5. Point the apps at your server

The backend URL is compiled into release builds. Replace
`remotemac-backend.onrender.com` with your domain in these two files:

- [`apps/mac/RemoteMac/Config/BackendEnvironment.swift`](../apps/mac/RemoteMac/Config/BackendEnvironment.swift) (`.production` case, both `https://` and `wss://`)
- [`apps/ios/src/config/backendEnvironment.ts`](../apps/ios/src/config/backendEnvironment.ts) (`PRODUCTION_API_BASE_URL` and `PRODUCTION_WS_BASE_URL`)

Then build both apps in the **Release** configuration, because Debug builds use `localhost`.
See [GETTING_STARTED.md](GETTING_STARTED.md).

Your server has its own database, so create a new account in the apps and pair again.

## 6. Test it

Turn off Wi-Fi on your iPhone so it's on mobile data, then open Screen Mode on your Mac. If
the screen appears, TURN and everything else are working.

## Maintenance

**Update to the latest version:**

```bash
cd ~/remotemac && git pull && cd infra/selfhost && docker compose up -d --build
```

Migrations run automatically on start.

**View logs:**

```bash
docker compose logs -f backend
```

**Back up the database:**

```bash
docker compose exec postgres pg_dump -U remotemac remotemac > backup.sql
```

**Cost:** an `e2-small` VM is roughly $12–15/month, or free on `e2-micro` within GCP's free tier
limits. TURN traffic only counts when a direct connection isn't possible.

## Troubleshooting

- **Apps can't sign in:** check that the URLs in step 5 match your domain exactly and that
  `curl https://YOUR_DOMAIN/health` works from your laptop.
- **Paired, but no screen on mobile data:** check the firewall rule from step 2, and check that
  `PUBLIC_IP`/`PRIVATE_IP` in `.env` are correct. Then restart coturn with
  `docker compose restart coturn`.
- **Build runs out of memory on `e2-micro`:** add swap with
  `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`.
