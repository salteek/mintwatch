# mintwatch

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/salteek/mintwatch/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/salteek/mintwatch/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

**Mintwatch** is a token launch radar: it reads a sealed DefiLlama snapshot, finds the 198 protocols that record no token, prices each launch off the 128 tokens that already trade, and gives every one a costed farm plan with a farm, thin or skip verdict.

- One model, `dashboard/model.js`, prices both `board.json` (main.ts runs it in Node) and the page (which re-runs it and checks every row against the board).
- `fitComps`: ridge regression of log market cap on log TVL, time on record and a shrunk sector offset. `looTest` leaves each traded token out: median miss x3.28 against x5.07 for a flat multiple.
- Momentum carries the 7-day TVL change four weeks forward at half pace; a name that shares its first word with a token that trades is halved.
- `farm`: cheapest of the three largest chains, a play by sector, every step with its gas and minutes, net of gas, bridge, swaps and the yield given up against a 4% T-bill, plus a break-even ticket.
- The radar view plots every protocol by sector and implied value. Static page, no framework, no network.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
python3 -m http.server 8090 --directory out   # then open http://localhost:8090/dashboard/
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
