#!/usr/bin/env bash
# Adds the bb-bots online relay to the droplet that already runs the CoSpotle server:
#   - the relay (server/relay.js) on localhost:8787, kept running by systemd
#   - Caddy: wss://api.spotlegame.co.uk/bb-relay -> the relay (next to CoSpotle's /api)
#
# Run as root on the droplet:
#   curl -fsSL https://raw.githubusercontent.com/joao12021996/bb-bots/master/server/droplet-setup.sh | bash
# Run it again any time to update the relay to the latest code.
# It works the same on the home PC set up by CoSpotle's home-setup.sh (Caddy there sits behind a Cloudflare Tunnel).
set -euo pipefail

DOMAIN="api.spotlegame.co.uk"
RAW="https://raw.githubusercontent.com/joao12021996/bb-bots/master/server"
APP_DIR="/opt/bb-relay"
SNIPPETS="/etc/caddy/sites.d"

# --- Node (the CoSpotle setup normally installed it already) ----------------
if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  echo "Caddy isn't installed. Run the CoSpotle droplet-setup.sh (or home-setup.sh) first." >&2
  exit 1
fi

# --- the relay ---------------------------------------------------------------
mkdir -p "$APP_DIR"
curl -fsSL "$RAW/relay.js" -o "$APP_DIR/relay.js"
curl -fsSL "$RAW/package.json" -o "$APP_DIR/package.json"
(cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund)

cat > /etc/systemd/system/bb-relay.service <<EOF
[Unit]
Description=bb-bots online relay
After=network.target

[Service]
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node relay.js
Environment=PORT=8787
Restart=always
DynamicUser=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable bb-relay
systemctl restart bb-relay

# --- Caddy: route /bb-relay to it --------------------------------------------
# The route lives in its own file, imported by the $DOMAIN site block, so other setups can share the domain.
mkdir -p "$SNIPPETS"
cat > "$SNIPPETS/bb-relay.caddy" <<EOF
handle /bb-relay* {
  reverse_proxy localhost:8787
}
EOF
if ! grep -q "import $SNIPPETS/\*.caddy" /etc/caddy/Caddyfile; then
  sed -i "s|^$DOMAIN {\$|$DOMAIN {\n  import $SNIPPETS/*.caddy|" /etc/caddy/Caddyfile
fi
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy || systemctl restart caddy

echo
echo "Done. Check from your PC: npx wscat -c wss://$DOMAIN/bb-relay"
echo "then send {\"op\":\"join\",\"room\":\"test\",\"id\":\"me\"}. The reply should be {\"op\":\"welcome\",\"peers\":[]}"
