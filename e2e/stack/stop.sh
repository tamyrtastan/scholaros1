#!/bin/bash
# Stops the local stack (best effort) and anything left on its ports.
ROOT=${STACK_DIR:-/tmp/scholaros-stack}
[ -f "$ROOT/stack.pid" ] && kill "$(cat "$ROOT/stack.pid")" 2>/dev/null
sleep 2
for pid in $(pgrep -x gotrue); do kill "$pid" 2>/dev/null; done
pkill -f "next-serve[r]" 2>/dev/null
PGB=${PG_BIN:-/usr/lib/postgresql/16/bin}
if [ -d "$ROOT/pg" ]; then
  if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$PGB/pg_ctl -D $ROOT/pg -m immediate stop" >/dev/null 2>&1
  else "$PGB/pg_ctl" -D "$ROOT/pg" -m immediate stop >/dev/null 2>&1; fi
fi
exit 0
