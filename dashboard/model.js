/* Mintwatch model: one function prices board.json (main.ts runs this file in Node) and this page.
   Every number comes from the snapshot: no protocol name is special-cased anywhere below. */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const LOG = Math.log10;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const round = (x, d = 0) => { const k = 10 ** d; return Math.round(x * k) / k; };

  // The house's watchlist rule, applied to the whole snapshot to set aside what is not a launch of its own.
  const SET_ASIDE = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
  const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  const WRAPPED = /\b(wrapped|staked|staking)\b/i;
  const EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

  // DefiLlama's ~70 categories fold into seven sectors, so each sector has enough traded comps to fit.
  const SECTORS = {
    vault: ['Risk Curators', 'Onchain Capital Allocator', 'Yield', 'Yield Aggregator', 'Liquidity Manager', 'Farm', 'Leveraged Farming', 'Basis Trading', 'Indexes', 'Stablecoin Wrapper'],
    lend: ['Lending', 'CDP', 'Collateral Markets', 'RWA Lending', 'Uncollateralized Lending', 'NFT Lending'],
    trade: ['Dexs', 'Derivatives', 'Prediction Market', 'Options', 'Launchpad', 'Perpetuals', 'Synthetics', 'DEX Aggregator', 'Bridge Aggregator', 'Cross Chain Bridge', 'OTC Marketplace'],
    rwa: ['RWA', 'Treasury Manager'],
    stake: ['Restaking', 'Staking Pool', 'Governance Incentives', 'Anchor BTC', 'Decentralized BTC', 'CeDeFi', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC'],
    infra: ['Chain', 'Payments', 'Insurance', 'Privacy', 'Services', 'Oracle', 'SoFi', 'Gaming'],
  };
  const SECTOR_NAME = { vault: 'Vaults & curators', lend: 'Lending & CDP', trade: 'Trading', rwa: 'Real-world assets', stake: 'Staking & BTC', infra: 'Chains & infra', other: 'Other' };
  const sectorOf = (cat) => { for (const k in SECTORS) if (SECTORS[k].includes(cat)) return k; return 'other'; };
  const firstWord = (name) => name.toLowerCase().split(/[\s\-:.]+/)[0];

  const ageDays = (asOf, listed) => (listed ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(listed)) / DAY)) : null);

  // Features of one protocol for the comps fit: size, sector and time on record.
  function features(p, asOf) {
    const age = ageDays(asOf, p.listed_at);
    return { size: LOG(p.tvl_usd), sector: sectorOf(p.category), age: LOG((age ?? 365) + 30) - 2.5 };
  }

  // Momentum moves TVL, and TVL moves value: the last 7 days' change, carried 4 more weeks at half pace.
  const forwardTvl = (p) => (1 + clamp(p.change_7d ?? 0, -30, 30) / 200) ** 4;

  // Ridge least squares on [1, size, age] plus shrunk sector offsets, solved by Gauss-Jordan.
  function fitComps(rows, lambda = 2) {
    const sec = Object.keys(SECTOR_NAME);
    const k = 3 + sec.length;
    const A = Array.from({ length: k }, () => new Array(k).fill(0));
    const b = new Array(k).fill(0);
    for (const r of rows) {
      const x = [1, r.f.size, r.f.age, ...sec.map((s) => (r.f.sector === s ? 1 : 0))];
      for (let i = 0; i < k; i++) { b[i] += x[i] * r.y; for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j]; }
    }
    for (let i = 2; i < k; i++) A[i][i] += i < 3 ? 0.5 : lambda; // sectors shrink toward the overall curve
    for (let c = 0; c < k; c++) {
      let piv = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      for (let r = 0; r < k; r++) if (r !== c) { const m = A[r][c] / A[c][c]; for (let j = c; j < k; j++) A[r][j] -= m * A[c][j]; b[r] -= m * b[c]; }
    }
    const w = b.map((v, i) => v / A[i][i]);
    const offsets = Object.fromEntries(sec.map((s, i) => [s, w[3 + i]]));
    return { a: w[0], size: w[1], age: w[2], offsets };
  }

  const predict = (m, f) => m.a + m.size * f.size + m.age * f.age + (m.offsets[f.sector] ?? 0);

  // Each traded token left out in turn, priced by the fit on the rest: the model's honest error.
  function looTest(comps) {
    const flatMult = comps.map((c) => c.y - c.f.size);
    const miss = [], flat = [], resid = [];
    comps.forEach((c, i) => {
      const rest = comps.filter((_, j) => j !== i);
      const e = c.y - predict(fitComps(rest), c.f);
      const fm = median(flatMult.filter((_, j) => j !== i));
      resid.push(e); miss.push(10 ** Math.abs(e)); flat.push(10 ** Math.abs(c.y - (c.f.size + fm)));
    });
    const within = (arr, x) => arr.filter((v) => v <= x).length / arr.length;
    return { n: comps.length, median_miss: round(median(miss), 2), flat_miss: round(median(flat), 2), within3: round(within(miss, 3), 2), flat_within3: round(within(flat, 3), 2), resid };
  }

  function median(a) { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
  function quantile(a, q) { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); }

  // ---- Farm economics: what a ticket costs, how long it takes, and what slice of the launch it could earn.
  const GAS = { Ethereum: 2.5, Bitcoin: 3, Tron: 1.2, Solana: 0.01, Sui: 0.01, Aptos: 0.01, Hyperliquid: 0, 'Hyperliquid L1': 0, Binance: 0.08, BSC: 0.08, Polygon: 0.02, Avalanche: 0.06 };
  const L2 = /^(Arbitrum|Base|Optimism|OP Mainnet|Ink|Unichain|Linea|Scroll|Blast|Mode|Mantle|Sonic|Plasma|Katana|Monad|Berachain|zkSync Era|Starknet|Plume Mainnet|Pharos|Flare)$/;
  const gasOn = (chain) => GAS[chain] ?? (L2.test(chain) ? 0.04 : 0.15);
  // Chains come largest first; farm on the cheapest of the top three.
  function cheapestChain(chains) { return chains.slice(0, 3).sort((a, b) => gasOn(a) - gasOn(b) || a.localeCompare(b))[0] ?? 'Ethereum'; }

  // Archetypes: the play a reader makes, with steps (action, tx count, minutes) and the native yield it earns.
  const PLAYS = {
    vault: { play: 'Curated vault', yield: 0.045, swap: 0, steps: [
      ['Bridge or move USDC to {chain}; keep $5 of native gas there', 2, 8],
      ['Open {name}\'s app, pick its largest USDC vault on {chain} and read its curator fee and withdrawal queue', 0, 10],
      ['Approve and deposit the ticket into that vault', 2, 3],
      ['Check the position and any points page every two weeks; note the vault\'s share price', 0, 5],
      ['Withdraw after {hold} days or at the snapshot, whichever comes first, and bridge back', 3, 8]] },
    lend: { play: 'Supply & borrow', yield: 0.035, swap: 0, steps: [
      ['Move USDC and $5 of gas to {chain}', 2, 8],
      ['Supply the ticket to {name}\'s main market on {chain}; keep health factor above 2 if you borrow', 2, 6],
      ['Borrow 30% back in a different stablecoin and resupply it once, a light loop that counts as both supply and borrow', 4, 8],
      ['Watch the health factor weekly; unwind the loop if rates flip negative', 0, 4],
      ['Repay, withdraw and bridge back after {hold} days', 4, 10]] },
    trade: { play: 'Volume & liquidity', yield: 0.02, swap: 0.0025, steps: [
      ['Fund a wallet on {chain} with USDC and $5 of gas', 2, 8],
      ['Provide half the ticket as liquidity in {name}\'s deepest stable pair', 2, 6],
      ['Trade the other half in four round trips a month at small size, the volume points programs count', 8, 20],
      ['Rebalance the pool position monthly and log fees earned against impermanent loss', 2, 10],
      ['Close the position and withdraw after {hold} days', 3, 8]] },
    rwa: { play: 'Tokenised asset', yield: 0.045, swap: 0.001, steps: [
      ['Check {name}\'s onboarding: many issuers need KYC or a non-US attestation; budget a day for approval', 0, 30],
      ['Move USDC and $5 of gas to {chain}', 2, 8],
      ['Mint or buy {name}\'s tokenised product with the ticket', 2, 5],
      ['Hold; yield accrues in price or as a rebase, no action needed', 0, 3],
      ['Redeem after {hold} days; read the redemption window first, it can be T+1 to T+5', 2, 8]] },
    stake: { play: 'Stake & restake', yield: 0.03, swap: 0.001, steps: [
      ['Buy the staking asset {name} accepts on {chain}, at the ticket size', 2, 6],
      ['Stake or restake it through {name}; pick the default operator or pool', 2, 5],
      ['Claim and compound rewards monthly if they do not auto-compound', 2, 5],
      ['Queue the unstake about two weeks before you need the money: unbonding takes days', 1, 3],
      ['Withdraw and swap back after {hold} days', 2, 6]] },
    infra: { play: 'Use the network', yield: 0.0, swap: 0.002, steps: [
      ['Bridge USDC onto {chain} with the official route and keep $5 for fees', 2, 10],
      ['Use {name} the way its users do: send, pay, or route value through it a few times a month', 6, 15],
      ['Park the rest of the ticket in the largest stablecoin pool on {chain} so it earns while you wait', 2, 5],
      ['Keep a log of transactions and dates; activity programs reward months active, not size', 0, 5],
      ['Bridge out after {hold} days', 2, 8]] },
  };
  PLAYS.other = PLAYS.vault;

  // Hold time: the longer a protocol has run with no token, the less it has to wait for one, assumed here.
  const holdFor = (noToken) => (noToken == null ? 180 : noToken > 730 ? 90 : noToken > 365 ? 120 : 180);

  function farm(p, value, opts) {
    const t = opts.ticket, share = opts.share, tbill = opts.tbill;
    const chain = cheapestChain(p.chains);
    const play = PLAYS[sectorOf(p.category)];
    const hold = holdFor(ageDays(opts.asOf, p.listed_at));
    const gas = gasOn(chain);
    let txs = 0, minutes = 0;
    const steps = play.steps.map(([text, tx, min]) => {
      txs += tx; minutes += min;
      const cost = tx * gas;
      return { text: text.replace('{chain}', chain).replace('{name}', p.name).replace('{hold}', hold), cost: round(cost, 2), minutes: min };
    });
    const bridge = chain === 'Ethereum' ? 0 : 1.5;
    const fees = round(txs * gas + bridge + t * play.swap * 2, 2);
    const forgone = round(t * Math.max(0, tbill - play.yield) * hold / 365, 2);
    const slice = round((value * share * t) / (p.tvl_usd + t), 2);
    const net = round(slice - fees - forgone, 2);
    const hours = round(minutes / 60, 1);
    const verdict = net >= 10 && net / Math.max(0.1, minutes / 60) >= 5 ? 'farm' : net > 0 ? 'thin' : 'skip';
    // Break-even ticket: fees are fixed, slice and forgone yield grow with the ticket.
    const perDollar = (value * share) / p.tvl_usd - Math.max(0, tbill - play.yield) * hold / 365 - play.swap * 2;
    const breakeven = perDollar > 0 ? Math.ceil((txs * gas + bridge) / perDollar) : null;
    return { chain, play: play.play, hold, steps, fees, forgone, slice, net, hours, per_hour: hours ? round(net / hours, 2) : 0, verdict, breakeven, apr: round(((value * share) / p.tvl_usd) * (365 / hold) * 100, 2) };
  }

  const stepLine = (s) => `${s.text} (about ${s.minutes} min, ${s.cost ? '$' + s.cost.toFixed(2) + ' gas' : 'no gas'})`;

  // ---- The radar: classify, fit, price, rank.
  function buildRadar(snap, opts = {}) {
    const o = { ticket: 1000, share: 0.1, tbill: 0.04, asOf: snap.as_of, ...opts };
    const P = snap.protocols;
    const watch = new Set(snap.watchlist);
    const traded = P.filter((p) => p.mcap_usd > 0);
    const tickerOnly = P.filter((p) => !(p.mcap_usd > 0) && (p.gecko_id || p.symbol));
    const tokenWords = new Map(P.filter((p) => p.gecko_id || p.symbol).map((p) => [firstWord(p.name), p.name]));
    const setAside = (p) => SET_ASIDE.has(p.category) || VERSIONED.test(p.name) || WRAPPED.test(p.name) || EXCHANGE.test(p.name);
    const pre = P.filter((p) => !p.gecko_id && !p.symbol && (watch.has(p.slug) || !setAside(p)));
    const aside = P.filter((p) => !p.gecko_id && !p.symbol && !pre.includes(p));

    const comps = traded.map((p) => ({ p, f: features(p, o.asOf), y: LOG(p.mcap_usd) }));
    const model = fitComps(comps);
    const test = looTest(comps);
    const lo = quantile(test.resid, 0.25), hi = quantile(test.resid, 0.75);

    const rows = pre.map((p) => {
      const f = features(p, o.asOf);
      const w = firstWord(p.name);
      const sibling = w.length >= 4 && tokenWords.has(w) ? tokenWords.get(w) : null;
      const parts = { curve: model.a + model.size * f.size, sector: model.offsets[f.sector] ?? 0, mom: model.size * LOG(forwardTvl(p)), age: model.age * f.age, sibling: sibling ? LOG(0.5) : 0 };
      const logv = parts.curve + parts.sector + parts.mom + parts.age + parts.sibling;
      const value = Math.max(1, Math.round(10 ** logv));
      const fm = farm(p, value, o);
      return {
        slug: p.slug, name: p.name, category: p.category ?? 'Uncategorised', sector: f.sector, chains: p.chains,
        tvl: p.tvl_usd, d7: p.change_7d, no_token_days: ageDays(o.asOf, p.listed_at), watch: watch.has(p.slug), sibling,
        value, band: [Math.round(10 ** (logv + lo)), Math.round(10 ** (logv + hi))], parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, round(v, 3)])),
        comps: nearest(comps, f, 4).map((c) => ({ name: c.p.name, tvl: c.p.tvl_usd, mcap: c.p.mcap_usd })), ...fm,
      };
    });
    rows.sort((a, b) => b.value - a.value || a.slug.localeCompare(b.slug));
    rows.forEach((r, i) => { r.rank = i + 1; });

    return {
      as_of: snap.as_of, source: snap.source, options: o, rows,
      fit: { a: round(model.a, 3), size: round(model.size, 3), age: round(model.age, 3), offsets: Object.fromEntries(Object.entries(model.offsets).map(([k, v]) => [k, round(v, 3)])), band: [round(lo, 3), round(hi, 3)] },
      test: { ...test, resid: undefined },
      counts: { protocols: P.length, watch: watch.size, pre: rows.length, traded: traded.length, ticker_only: tickerOnly.length, aside: aside.length, sibling: rows.filter((r) => r.sibling).length },
      traded: traded.map((p) => ({ name: p.name, tvl: p.tvl_usd, mcap: p.mcap_usd, sector: sectorOf(p.category) })),
      aside: aside.map((p) => ({ name: p.name, category: p.category, tvl: p.tvl_usd })),
    };
  }

  // The four traded tokens most like this protocol: same sector first, then nearest in size.
  function nearest(comps, f, n) {
    return [...comps].sort((a, b) => (a.f.sector !== f.sector) - (b.f.sector !== f.sector) || Math.abs(a.f.size - f.size) - Math.abs(b.f.size - f.size)).slice(0, n);
  }

  // The rows the gate reads: rank, value and 3 to 12 farm steps of 20 to 600 characters each.
  function boardRows(radar) {
    return radar.rows.map((r) => ({
      slug: r.slug, name: r.name, rank: r.rank, implied_value_usd: r.value, band_usd: r.band, verdict: r.verdict, net_usd: r.net,
      watchlist: r.watch, farm_steps: [`${r.play} on ${r.chain}, $${radar.options.ticket} ticket held ${r.hold} days: fees $${r.fees}, forgone yield $${r.forgone}, slice $${r.slice}, net $${r.net} (${r.verdict.toUpperCase()})`, ...r.steps.map(stepLine)],
    }));
  }

  const api = { buildRadar, boardRows, fitComps, predict, looTest, farm, sectorOf, SECTOR_NAME, stepLine };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Mintwatch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
