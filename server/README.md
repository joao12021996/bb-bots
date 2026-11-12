# bb-bots online relay

A small WebSocket server that forwards messages between devices in the same online room.
The game connects to `wss://api.spotlegame.co.uk/bb-relay` (see `RELAY_URL` in `src/playerMode/net/room.ts`).

## Run locally

```sh
cd server && npm install && node relay.js          # listens on 127.0.0.1:8787
# in the repo root, another terminal (PowerShell: $env:REACT_APP_RELAY_URL="ws://localhost:8787"; npm start)
REACT_APP_RELAY_URL=ws://localhost:8787 npm start
```

## Droplet setup: one command

On the droplet that already runs CoSpotle, as root:

```sh
curl -fsSL https://raw.githubusercontent.com/joao12021996/bb-bots/master/server/droplet-setup.sh | bash
```

Run it again to update the relay. The manual steps below show what it does.

## Droplet setup (manual)

1. **DNS**: point `api.spotlegame.co.uk` (an A record) at the droplet's IP. Skip this if it already points there.
2. **Node 20 + Caddy**
   ```sh
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install -y caddy
   ```
3. **Copy the relay** (from your PC, in the repo root):
   ```sh
   scp server/relay.js server/package.json root@<droplet-ip>:/opt/bb-relay/
   ```
   Then on the droplet:
   ```sh
   sudo useradd --system --no-create-home bbrelay || true
   cd /opt/bb-relay && sudo npm install --omit=dev
   ```
4. **systemd**: create `/etc/systemd/system/bb-relay.service`:
   ```ini
   [Unit]
   Description=bb-bots online relay
   After=network.target

   [Service]
   User=bbrelay
   WorkingDirectory=/opt/bb-relay
   ExecStart=/usr/bin/node /opt/bb-relay/relay.js
   Restart=always
   Environment=PORT=8787

   [Install]
   WantedBy=multi-user.target
   ```
   ```sh
   sudo systemctl daemon-reload && sudo systemctl enable --now bb-relay
   journalctl -u bb-relay -f      # should say "listening on 127.0.0.1:8787"
   ```
5. **Caddy** (TLS + WebSocket proxy). In `/etc/caddy/Caddyfile`:
   ```
   api.spotlegame.co.uk {
       handle /bb-relay* {
           reverse_proxy 127.0.0.1:8787
       }
       # ...anything else api.spotlegame.co.uk already serves goes here
   }
   ```
   ```sh
   sudo systemctl reload caddy
   ```
   If nginx (or something else) already serves `api.spotlegame.co.uk` on 443, don't install Caddy. Add this
   to that site's nginx config instead:
   ```nginx
   location /bb-relay {
       proxy_pass http://127.0.0.1:8787;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";
       proxy_read_timeout 1h;
   }
   ```
6. **Firewall**: `sudo ufw allow 80,443/tcp` (and in the DigitalOcean cloud firewall, if you use one). Keep 8787 closed.
7. **Check from your PC**: `npx wscat -c wss://api.spotlegame.co.uk/bb-relay`, then type
   `{"op":"join","room":"test","id":"me"}`. The reply should be `{"op":"welcome","peers":[]}`.

## Updating

Copy the new `relay.js` over, then run `sudo systemctl restart bb-relay`. Connected players reconnect automatically.
