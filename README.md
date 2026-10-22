# Offcuts

Offcuts is a self-hosted code snippet manager. One person owns it. Visitors can see the snippets that the owner makes public.

## Features

- **Snippets with fragments.** A snippet has a title, a source, a description, tags and one language. It holds one or more fragments. Each fragment has its own title and code.
  Example: the snippet "REST API Patches" holds the fragments "Lookup", "People Picker" and "Choice".
- **Syntax highlighting** for Power Query M, DAX, Power Fx, Power Automate, PySpark, Python, SQL, JSON, YAML, PowerShell, JavaScript, TypeScript, HTML, CSS, Bash, C# and Markdown.
- **Language detection.** When you paste code, Offcuts guesses the language. A dropdown lets you change it.
- **Search, filter and sort.** Search looks in titles, fragment titles, code, descriptions, sources and tags. Filter by tag, language and visibility. Sort by title or date.
- **Card view and list view.** Both views show a highlighted preview of the code.
- **Public snippets.** The home page shows public snippets to everyone. A login button gives access to the rest.
- **Two-factor login.** Password plus a TOTP code from an authenticator app. (TOTP = time-based one-time password, the 6-digit code that changes every 30 seconds.)
- **Light and dark themes**, and a layout that works on a phone.
- **One SQLite database file.** Back up one file to back up everything.

## Install with Docker

```bash
git clone https://github.com/FrivenSolutions/offcuts.git
cd offcuts
docker compose up -d --build
docker logs offcuts      # find the first-run setup code
```

Open `http://<server>:3000`. Enter the setup code, then create your account. Scan the QR code with your authenticator app.

The data is in the Docker volume `offcuts-data`.

## Install in a Proxmox LXC container

Run these commands as root on the Proxmox host. The script creates an unprivileged Debian 12 container and installs Offcuts in it as a systemd service. It does not use Docker.

```bash
apt install -y git
git clone https://github.com/FrivenSolutions/offcuts.git
cd offcuts
bash deploy/proxmox/create-lxc.sh
```

The script prints the address and the first-run setup code.

Change the defaults with environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `CTID` | next free ID | Container ID |
| `CT_HOSTNAME` | `offcuts` | Container host name |
| `STORAGE` | `local-lvm` | Storage for the container disk |
| `TEMPLATE_STORAGE` | `local` | Storage that holds container templates |
| `BRIDGE` | `vmbr0` | Network bridge |
| `IP` | `dhcp` | `dhcp`, or a static address such as `192.168.1.50/24` |
| `GW` | none | Gateway. Set it with a static IP. |
| `VLAN` | none | VLAN tag |
| `CORES` | `1` | CPU cores |
| `MEMORY` | `1024` | Memory in MB. The build step needs about 1 GB. |
| `DISK` | `4` | Disk size in GB |

Example:

```bash
CTID=120 IP=192.168.1.50/24 GW=192.168.1.1 STORAGE=local-zfs bash deploy/proxmox/create-lxc.sh
```

**Update the container:**

```bash
cd offcuts
git pull
bash deploy/proxmox/update-lxc.sh <CTID>
```

**Install in an existing Debian or Ubuntu LXC or VM:** copy the repository into it, then run `bash deploy/proxmox/install.sh` as root.

In the LXC:

- The app is in `/opt/offcuts/app`.
- The data is in `/var/lib/offcuts`.
- The settings are in `/etc/offcuts.env`.
- Read the log with `journalctl -u offcuts`.

## Reverse proxy

Offcuts works behind Nginx Proxy Manager, Traefik, Caddy or another reverse proxy. The proxy must send the `X-Forwarded-For` and `X-Forwarded-Proto` headers. Most proxies send them by default.

By default, Offcuts trusts proxies on private networks (`10.x`, `172.16–31.x`, `192.168.x` and loopback). To trust only one proxy, set `TRUST_PROXY` to its IP address.

When the proxy uses HTTPS, Offcuts marks the login cookie as `Secure`. If you only use HTTPS, set `COOKIE_SECURE=true`.

## Settings

Set these as environment variables. Docker: in `docker-compose.yml`. LXC: in `/etc/offcuts.env`.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Listen address |
| `DATA_DIR` | `./data` (`/data` in Docker) | Folder for the database |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | Proxies to trust. Also accepts `true`, `false`, a number of hops, or IP addresses. |
| `COOKIE_SECURE` | `auto` | `auto`, `true` or `false` |
| `SESSION_DAYS` | `30` | How long a login lasts |
| `APP_NAME` | `Offcuts` | Name shown in the authenticator app |

## Recovery

If you lose your phone, reset two-factor login. Then log in with your password and scan a new QR code.

```bash
docker exec offcuts npm run cli -- reset-totp    # Docker
offcuts-cli reset-totp                           # LXC
```

Other commands:

- `reset-password <new password>` sets a new password.
- `reset-all` removes the account but keeps the snippets. Restart the app to get a new setup code.

All three commands log out every session.

## Backup

- **Full backup:** copy `offcuts.db` from the data folder. Stop the app first, or copy the `-wal` and `-shm` files too.
- **Export:** Settings → Export snippets downloads all snippets as JSON.

## Security

- Passwords are hashed with scrypt.
- A login needs the password and a TOTP code. The app refuses a TOTP code that was already used.
- After 5 failed attempts, the app locks that IP address out for 15 minutes.
- The login cookie is `HttpOnly` and `SameSite=Lax`. The app stores only a hash of the session token.
- Every request that changes data must carry a custom header. Other web sites cannot add that header, so they cannot make changes for you (this blocks CSRF, cross-site request forgery).
- On first run, the setup page needs a code from the server log. A stranger who finds a new install cannot claim it.

## Language detection

Detection uses pattern rules. It is a best guess, not a certainty. These signals have the most weight:

| Language | Main signals |
|---|---|
| Power Automate | `@{...}`, `triggerBody()`, `outputs('...')`, `?['field']`, flow JSON such as `"runAfter"` |
| Power Query M | `let ... in`, `#"Step name"`, `Table.SelectRows(`, `each [Column]` |
| DAX | `CALCULATE(`, `'Table'[Column]`, `VAR` / `RETURN`, `EVALUATE` |
| Power Fx | `Patch(`, `LookUp(`, `ThisItem.`, `Set(`, `Notify(` |
| PySpark | `from pyspark`, `spark.read`, `.withColumn(`, `F.col(` |

To change a rule, edit `shared/detect.ts`. Add a sample to `shared/samples.ts`, then run `npm test`.

## Development

You need Node.js 22 or later.

```bash
npm install
npm run dev        # server on :3000, Vite dev server on :5173
npm test           # unit and API tests
npm run typecheck
npm run build      # build into ./build
npm start          # run the built app
```

Project layout:

- `server/` is the Express API and the SQLite database.
- `client/` is the React web app.
- `shared/` holds the language list and the detection rules. Both sides use them.
- `deploy/proxmox/` holds the LXC scripts.
