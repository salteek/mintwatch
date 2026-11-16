#!/bin/sh
# Renders the three hand-in screenshots from a local server on :8090 serving out/ (headless Chrome),
# then converts them to JPEG near 300-350 KB each.
set -e
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
U=http://localhost:8090/dashboard/index.html
T=$(mktemp -d)
shot() { "$C" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$T/p$1" --window-size="$2" --virtual-time-budget=3000 --screenshot="$T/$1.png" "$U$3" >/dev/null 2>&1; }
shot 1-board 1440,1000 "?v=1"
shot 2-detail 1100,1440 "?open=galaxy-curation"
shot 3-filtered 1440,1000 "?list=watch&verdict=farm&sort=net"
for n in 1-board 2-detail 3-filtered; do
  sips -s format jpeg -s formatOptions "${Q:-90}" "$T/$n.png" --out "screenshots/$n.jpg" >/dev/null
done
rm -f screenshots/*.png
ls -l screenshots
