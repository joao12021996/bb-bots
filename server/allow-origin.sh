#!/usr/bin/env bash
# Lets another of our sites (e.g. Hidabout) use the relay: adds its domain(s) to the relay's ALLOWED_ORIGINS.
# Run as root on the droplet:
#   curl -fsSL https://raw.githubusercontent.com/joao12021996/bb-bots/master/server/allow-origin.sh | bash -s example.com
# The setting goes in a systemd drop-in, so re-running bb-bots' droplet-setup.sh doesn't undo it.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <domain> [domain ...]   e.g. $0 example.com" >&2
  exit 1
fi

DEFAULTS=".spotlegame.co.uk,.github.io,localhost,127.0.0.1" # relay.js's built-in list
DROPIN_DIR=/etc/systemd/system/bb-relay.service.d
DROPIN="$DROPIN_DIR/allowed-origins.conf"

# what the relay allows now: an ALLOWED_ORIGINS already set, or its built-in defaults
current=$(systemctl show bb-relay -p Environment --value | tr ' ' '\n' | sed -n 's/^ALLOWED_ORIGINS=//p' | tail -1)
origins=${current:-$DEFAULTS}

domains=()
for raw in "$@"; do
  # "https://www.Hidabout.com/friend" -> "hidabout.com"
  d=$(echo "$raw" | tr 'A-Z' 'a-z' | sed -E 's#^[a-z]+://##; s#[/:].*$##; s#^www\.##; s#^\.##')
  domains+=("$d")
  entry=".$d" # the domain itself and every subdomain (www. included)
  case ",$origins," in
    *",$entry,"*) echo "$entry is already allowed" ;;
    *) origins="$origins,$entry"; echo "Adding $entry" ;;
  esac
done

mkdir -p "$DROPIN_DIR"
cat > "$DROPIN" <<EOF
[Service]
Environment=ALLOWED_ORIGINS=$origins
EOF

systemctl daemon-reload
systemctl restart bb-relay # connected players reconnect on their own
sleep 2
systemctl is-active --quiet bb-relay || { echo "bb-relay didn't start: journalctl -u bb-relay -n 50" >&2; exit 1; }
echo "Allowed origins: $origins"

# check: a WebSocket handshake from each site should get 101 (403 means it's still refused)
for d in "${domains[@]}"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 \
    -H "Origin: https://$d" -H "Connection: Upgrade" -H "Upgrade: websocket" \
    -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    http://127.0.0.1:8787/bb-relay || true)
  echo "https://$d -> $code"
done
