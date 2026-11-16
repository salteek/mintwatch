/* Mintwatch page: runs model.js on the snapshot in data.js, checks it against board.json's rows, draws the board. */
(function () {
  'use strict';
  const M = window.Mintwatch;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const VERDICT = { farm: 'Farm', thin: 'Thin', skip: 'Skip' };
  const COLOR = { farm: '#1d8a57', thin: '#d39a1c', skip: '#b24a5e' };

  function money(x, d) {
    const a = Math.abs(x), s = x < 0 ? '−$' : '$';
    if (a >= 1e9) return s + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M';
    if (a >= 1e4) return s + (a / 1e3).toFixed(0) + 'K';
    if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'K';
    return s + a.toFixed(d ?? (a < 100 ? 2 : 0));
  }
  const usd = (n) => '$' + n.toLocaleString('en-US');
  const days = (n) => (n == null ? 'no date' : n >= 365 ? (n / 365).toFixed(1) + ' yr' : n + ' d');
  const pct = (x) => (x == null ? '–' : (x > 0 ? '+' : '') + x.toFixed(1) + '%');

  // Page state: read from the address so any view can be linked to (and screenshotted).
  const q = new URLSearchParams(location.search);
  const S = {
    tab: q.get('tab') || 'board', text: q.get('q') || '', sector: q.get('sector') || '', chain: q.get('chain') || '',
    verdict: q.get('verdict') || '', list: q.get('list') || '', sort: q.get('sort') || 'value', dir: q.get('dir') === 'asc' ? 1 : -1,
    ticket: +(q.get('ticket') || 1000), share: +(q.get('share') || 0.1), open: q.get('open') || '',
  };

  let R;
  function compute() { R = M.buildRadar(window.SNAPSHOT, { ticket: S.ticket, share: S.share }); }

  // The board.json rows main.ts wrote, against what this page just computed.
  function verify() {
    const mine = new Map(R.rows.map((r) => [r.slug, r]));
    const same = window.BOARD.filter(([slug, rank, v]) => mine.get(slug)?.rank === rank && mine.get(slug)?.value === v).length;
    const w = R.rows.filter((r) => r.watch).length;
    $('checks').innerHTML = `<span class="ok${w === R.counts.watch ? '' : ' bad'}">✓ Watchlist ${w}/${R.counts.watch} ranked</span>` +
      `<span class="ok${same === window.BOARD.length ? '' : ' bad'}">✓ ${same}/${window.BOARD.length} rows recomputed here equal board.json</span>`;
    $('meta').textContent = `DefiLlama snapshot of ${R.as_of}, ${R.counts.protocols} protocols, model mintwatch-1`;
  }

  function lede() {
    const total = R.rows.reduce((a, r) => a + r.value, 0);
    const f = R.fit, t = R.test, by = { farm: 0, thin: 0, skip: 0 };
    R.rows.forEach((r) => by[r.verdict]++);
    const best = [...R.rows].sort((a, b) => b.per_hour - a.per_hour)[0];
    $('lede').innerHTML = `<h1>${R.counts.pre} protocols record no token. Priced off the ${R.counts.traded} that trade, their launches imply <em>${money(total)}</em>.</h1>
      <p>Every value comes from one function, <b>buildRadar</b> in model.js: a size curve fitted on traded tokens' market caps, a sector offset, the last week's TVL momentum and time on record. The same file wrote board.json, and this page has just re-run it.</p>
      <div class="formula"><div><code>value = 10^${f.a} × TVL^${f.size} × sector × momentum × age^${String(f.age).replace('-', '−')} × sibling</code>
        <small>Momentum carries the 7-day TVL change four more weeks at half pace, then reads it off the size curve. A name that shares its first word with a token that trades is halved: it may launch under that token. The band is the P25 to P75 of the fit's out-of-sample misses.</small></div>
        <table><tr><td>Each of ${t.n} traded tokens left out, then priced</td><td class="num">miss</td><td class="num">within 3×</td></tr>
        <tr><td>One flat market cap / TVL multiple</td><td class="num">×${t.flat_miss}</td><td class="num">${Math.round(t.flat_within3 * 100)}%</td></tr>
        <tr class="win"><td>Mintwatch fit (looTest)</td><td class="num">×${t.median_miss}</td><td class="num">${Math.round(t.within3 * 100)}%</td></tr></table></div>
      <div class="tally"><div><b>${R.counts.watch}/${R.counts.watch}</b>watchlist on the board</div><div><b>${R.counts.pre - R.counts.watch}</b>more off the watchlist</div>
        <div><b class="up">${by.farm}</b>farm at a ${usd(S.ticket)} ticket</div><div><b style="color:var(--thin)">${by.thin}</b>thin</div><div><b class="down">${by.skip}</b>skip</div>
        <div><b>${money(best.per_hour)}/h</b>best net per hour: ${esc(best.name)}</div></div>`;
  }

  // The radar itself: a wedge per sector, distance out is implied value on a log scale.
  function scope() {
    const secs = Object.keys(M.SECTOR_NAME).filter((s) => R.rows.some((r) => r.sector === s));
    const C = 210, R0 = 22, R1 = 160, lo = 6.5, hi = 8.0;
    const shown = new Set(visible().map((r) => r.slug)), all = shown.size === R.rows.length;
    const rad = (v) => R0 + (R1 - R0) * Math.max(0, Math.min(1, (Math.log10(v) - lo) / (hi - lo)));
    const step = (Math.PI * 2) / secs.length;
    let svg = `<defs><radialGradient id="sweep" cx="0" cy="0.5" r="1"><stop offset="0" stop-color="#0e7c86" stop-opacity=".22"/><stop offset="1" stop-color="#0e7c86" stop-opacity="0"/></radialGradient></defs>`;
    svg += `<circle class="disc" cx="${C}" cy="${C}" r="${R1 + 6}"/>`;
    [1e7, 3e7, 1e8].forEach((v) => { svg += `<circle class="ring" cx="${C}" cy="${C}" r="${rad(v)}"/><text x="${C + 4}" y="${C - rad(v) - 3}">${money(v)}</text>`; });
    secs.forEach((s, i) => {
      const a = -Math.PI / 2 + i * step;
      svg += `<line class="spoke" x1="${C}" y1="${C}" x2="${C + Math.cos(a) * (R1 + 6)}" y2="${C + Math.sin(a) * (R1 + 6)}"/>`;
      const m = a + step / 2, lx = C + Math.cos(m) * (R1 + 20), ly = C + Math.sin(m) * (R1 + 20) + 4;
      const n = R.rows.filter((r) => r.sector === s).length;
      svg += `<text class="sec" x="${lx}" y="${ly}" text-anchor="${Math.abs(Math.cos(m)) < 0.3 ? 'middle' : Math.cos(m) > 0 ? 'start' : 'end'}">${M.SECTOR_NAME[s].split(' ')[0]} ${n}</text>`;
    });
    const sweepA = -Math.PI / 2 + 0.55;
    svg += `<path class="sweep" d="M${C},${C} L${C + Math.cos(sweepA - 0.5) * R1},${C + Math.sin(sweepA - 0.5) * R1} A${R1},${R1} 0 0,1 ${C + Math.cos(sweepA) * R1},${C + Math.sin(sweepA) * R1} Z"/>`;
    R.rows.slice().reverse().forEach((r) => {
      const i = secs.indexOf(r.sector), h = hash(r.slug);
      const a = -Math.PI / 2 + i * step + step * (0.12 + 0.76 * h), d = rad(r.value);
      svg += `<circle class="dot${r.watch ? ' w' : ''}"${all || shown.has(r.slug) ? '' : ' opacity=".14"'} data-slug="${r.slug}" cx="${(C + Math.cos(a) * d).toFixed(1)}" cy="${(C + Math.sin(a) * d).toFixed(1)}" r="${r.rank <= 10 || (!all && shown.has(r.slug)) ? 5.5 : 3.6}" fill="${COLOR[r.verdict]}"><title>${esc(r.name)}: ${money(r.value)}</title></circle>`;
    });
    svg += `<circle cx="${C}" cy="${C}" r="3" fill="#16203a"/>`;
    $('scope').innerHTML = svg;
    $('scopeKey').innerHTML = Object.keys(VERDICT).map((v) => `<span class="key"><i style="background:${COLOR[v]}"></i>${VERDICT[v]}</span>`).join('') +
      '<span class="key"><i style="background:#fff;border:1.6px solid var(--watch)"></i>Watchlist</span><span>' + (all ? 'Farther out is worth more' : `${shown.size} rows match the filters; the rest are faded`) + '</span>';
  }
  function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; }

  function tabs() {
    const T = [['board', 'No token yet', R.counts.pre], ['traded', 'Token trades', R.counts.traded], ['aside', 'Set aside', R.counts.aside], ['method', 'Method and tests', '']];
    $('tabs').innerHTML = T.map(([k, n, c]) => `<button role="tab" data-tab="${k}" aria-selected="${S.tab === k}">${n}${c !== '' ? `<small>${c}</small>` : ''}</button>`).join('');
  }

  function filters() {
    const chains = {}; R.rows.forEach((r) => r.chains.forEach((c) => (chains[c] = (chains[c] || 0) + 1)));
    const top = Object.entries(chains).sort((a, b) => b[1] - a[1]).slice(0, 18).map(([c]) => c).sort();
    const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
    const seg = (key, items) => `<span class="seg" data-key="${key}">${items.map(([v, l]) => `<button type="button" data-v="${v}" class="${S[key] === v ? 'on' : ''}">${l}</button>`).join('')}</span>`;
    $('filters').innerHTML = `<input type="search" id="fq" placeholder="Search name or category" value="${esc(S.text)}" aria-label="Search">
      <select id="fsector" aria-label="Sector">${opt('', 'Every sector', S.sector)}${Object.entries(M.SECTOR_NAME).map(([k, v]) => opt(k, v, S.sector)).join('')}</select>
      <select id="fchain" aria-label="Chain">${opt('', 'Every chain', S.chain)}${top.map((c) => opt(c, c, S.chain)).join('')}</select>
      ${seg('verdict', [['', 'All'], ['farm', 'Farm'], ['thin', 'Thin'], ['skip', 'Skip']])}
      ${seg('list', [['', 'All rows'], ['watch', 'Watchlist'], ['early', 'Early']])}
      <label class="grow">Ticket <select id="fticket">${[250, 1000, 5000, 25000].map((t) => opt(String(t), usd(t), String(S.ticket))).join('')}</select></label>
      <label>Airdrop to depositors <select id="fshare">${[0.05, 0.1, 0.2].map((t) => opt(String(t), t * 100 + '%', String(S.share))).join('')}</select></label>`;
  }

  const COLS = [
    ['rank', '#', (r) => r.rank, 'rk'], ['name', 'Protocol', (r) => r.name], ['tvl', 'TVL', (r) => r.tvl, 'num'], ['d7', '7d TVL', (r) => r.d7 ?? -999, 'num'],
    ['age', 'No token for', (r) => r.no_token_days ?? -1, 'num'], ['value', 'Implied value', (r) => r.value, 'num'], ['band', 'P25–P75 band', (r) => r.band[1] / r.band[0]],
    ['slice', 'Your slice', (r) => r.slice, 'num'], ['net', 'Net of all costs', (r) => r.net, 'num'], ['be', 'Break-even', (r) => r.breakeven ?? 1e12, 'num'], ['play', 'Play, chain, hold', (r) => r.play],
  ];

  function visible() {
    const t = S.text.toLowerCase();
    return R.rows.filter((r) => (!t || (r.name + ' ' + r.category).toLowerCase().includes(t)) && (!S.sector || r.sector === S.sector) &&
      (!S.chain || r.chains.includes(S.chain)) && (!S.verdict || r.verdict === S.verdict) && (!S.list || (S.list === 'watch' ? r.watch : !r.watch)));
  }

  function board() {
    const col = COLS.find((c) => c[0] === S.sort) || COLS[5];
    const rows = visible().sort((a, b) => { const x = col[2](a), y = col[2](b); return (x < y ? -1 : x > y ? 1 : a.rank - b.rank) * S.dir; });
    $('count').innerHTML = `<b>${rows.length}</b> of ${R.rows.length} rows, sorted by ${col[1]}. Net is the slice a ${usd(S.ticket)} deposit would get if ${S.share * 100}% of the launch goes to depositors pro rata, minus gas, bridge, swaps and the 4% T-bill yield it gives up. Click a row for its plan.`;
    const lo = 5.5, hi = 9;
    const pos = (v) => Math.max(0, Math.min(100, ((Math.log10(v) - lo) / (hi - lo)) * 100));
    document.querySelector('#board thead').innerHTML = '<tr>' + COLS.map(([k, l, , c]) => `<th data-sort="${k}" class="${c === 'num' ? 'num' : ''}"${S.sort === k ? ` aria-sort="${S.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${l}${S.sort === k ? (S.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr>';
    document.querySelector('#board tbody').innerHTML = rows.map((r) => `<tr data-slug="${r.slug}" tabindex="0">
      <td class="rk">${r.rank}</td>
      <td><span class="pname">${esc(r.name)}</span>${r.watch ? '<span class="tag watch">watchlist</span>' : r.tvl >= window.SNAPSHOT.floor_usd ? '<span class="tag early">off list</span>' : '<span class="tag early">early</span>'}${r.sibling ? '<span class="tag sib">sibling</span>' : ''}<div class="psub">${esc(r.category)}, ${esc(r.chains.slice(0, 2).join(', '))}${r.chains.length > 2 ? ` +${r.chains.length - 2}` : ''}</div></td>
      <td class="num">${money(r.tvl)}</td><td class="num ${r.d7 > 0 ? 'up' : r.d7 < 0 ? 'down' : ''}">${pct(r.d7)}</td><td class="num">${days(r.no_token_days)}</td>
      <td class="num val">${money(r.value)}</td>
      <td><div class="band" title="${money(r.band[0])} to ${money(r.band[1])}"><span style="left:${pos(r.band[0])}%;width:${pos(r.band[1]) - pos(r.band[0])}%"></span><i style="left:${pos(r.value)}%"></i></div></td>
      <td class="num">${money(r.slice)}</td>
      <td class="num"><span class="pill ${r.verdict}">${VERDICT[r.verdict]}</span> <span class="net${r.net < 0 ? ' neg' : ''}">${r.net >= 0 ? '+' : ''}${money(r.net)}</span><div class="psub">${money(r.per_hour)}/h over ${r.hours} h</div></td>
      <td class="num">${r.breakeven ? money(r.breakeven, 0) : 'never'}</td>
      <td class="play">${esc(r.play)}<div class="psub">${esc(r.chain)}, ${r.hold} d, fees ${money(r.fees)}</div></td></tr>`).join('');
  }

  // The detail view: how the value was built, what it is compared with, and the plan with its costs.
  function detail(slug) {
    const r = R.rows.find((x) => x.slug === slug);
    const el = $('detail');
    if (!r) { el.hidden = true; return; }
    const f = (x) => 10 ** x;
    const steps = [['Size curve at ' + money(r.tvl) + ' TVL', r.parts.curve], [M.SECTOR_NAME[r.sector] + ' offset', r.parts.sector], ['7-day momentum, ' + pct(r.d7), r.parts.mom], ['Time on record, ' + days(r.no_token_days), r.parts.age]];
    if (r.sibling) steps.push(['Sibling of ' + r.sibling + ', halved', r.parts.sibling]);
    el.innerHTML = `<button class="close" id="close">Close</button>
      <h2>${esc(r.name)}</h2><p class="sub">Rank ${r.rank} of ${R.rows.length}. ${esc(r.category)} on ${esc(r.chains.join(', '))}. ${r.watch ? 'On the watchlist.' : 'Early: below the $50M floor.'} DefiLlama records no token for it.</p>
      <div class="dgrid"><div><small>Implied value</small><b class="val">${money(r.value)}</b></div><div><small>P25–P75 band</small><b>${money(r.band[0])} – ${money(r.band[1])}</b></div>
        <div><small>Net at ${usd(S.ticket)}</small><b class="${r.net < 0 ? 'down' : 'up'}">${r.net >= 0 ? '+' : ''}${money(r.net)}</b></div><div><small>Break-even ticket</small><b>${r.breakeven ? money(r.breakeven, 0) : 'never'}</b></div></div>
      <h3>How the value is built</h3>${waterfall(steps, r.value)}
      <h3>The four traded tokens it is priced against</h3>
      <table class="comps"><tr><th>Token family</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Cap / TVL</th></tr>${r.comps.map((c) => `<tr><td>${esc(c.name)}</td><td class="num">${money(c.tvl)}</td><td class="num">${money(c.mcap)}</td><td class="num">${(c.mcap / c.tvl).toFixed(2)}×</td></tr>`).join('')}
      <tr><td><b>${esc(r.name)}, implied</b></td><td class="num">${money(r.tvl)}</td><td class="num val">${money(r.value)}</td><td class="num">${(r.value / r.tvl).toFixed(2)}×</td></tr></table>
      <h3>Farm plan: ${esc(r.play)} on ${esc(r.chain)}, held ${r.hold} days</h3>
      <ol class="steps">${r.steps.map((s) => `<li><span>${esc(s.text)}</span><span class="c">${s.minutes} min</span><span class="c">${s.cost ? money(s.cost) + ' gas' : 'no gas'}</span></li>`).join('')}</ol>
      <div class="econ"><div><h3>What a ${usd(S.ticket)} ticket nets</h3><table class="ledger">
        <tr><td>Slice of the launch (${S.share * 100}% to depositors, pro rata)</td><td class="num up">+${money(r.slice)}</td></tr>
        <tr><td>Gas, bridge and swaps</td><td class="num down">−${money(r.fees).slice(1)}</td></tr>
        <tr><td>Yield given up against a 4% T-bill</td><td class="num down">${r.forgone ? '−' + money(r.forgone).slice(1) : '$0.00'}</td></tr>
        <tr class="total"><td>Net, <span class="pill ${r.verdict}">${VERDICT[r.verdict]}</span></td><td class="num">${r.net >= 0 ? '+' : ''}${money(r.net)}</td></tr>
        <tr><td>Hands-on time</td><td class="num">${r.hours} h, ${money(r.per_hour)}/h</td></tr>
        <tr><td>Airdrop yield on capital, annualised</td><td class="num">${r.apr}%</td></tr></table></div>
        <div><h3>Net by ticket size</h3>${curve(r)}<p class="note">Fees are fixed; the slice grows with the deposit. Above the break-even ticket the plan pays for itself.</p></div></div>`;
    el.hidden = false;
    document.body.classList.add('open');
    $('close').onclick = () => { S.open = ''; el.hidden = true; document.body.classList.remove('open'); };
  }

  function waterfall(steps, value) {
    const W = 700, row = 26, x0 = 230, lo = 5, hi = 9.2, sx = (v) => x0 + ((v - lo) / (hi - lo)) * (W - x0 - 70);
    let acc = 0, svg = '';
    steps.forEach(([label, d], i) => {
      const a = acc, b = acc + d; acc = b;
      const y = i * row + 4, left = i === 0 ? sx(lo) : sx(Math.min(a, b)), right = i === 0 ? sx(b) : sx(Math.max(a, b));
      const col = i === 0 ? '#9fb3c8' : d >= 0 ? '#1d8a57' : '#b24a5e';
      svg += `<text x="0" y="${y + 14}">${esc(label)}</text><rect x="${left}" y="${y + 3}" width="${Math.max(2, right - left)}" height="15" rx="3" fill="${col}"/>` +
        `<text x="${right + 6}" y="${y + 15}">${i === 0 ? money(10 ** b) : '×' + (10 ** d).toFixed(2)}</text>`;
    });
    const y = steps.length * row + 4;
    svg += `<text class="v" x="0" y="${y + 14}">Implied value</text><rect x="${sx(lo)}" y="${y + 3}" width="${sx(Math.log10(value)) - sx(lo)}" height="15" rx="3" fill="#0e7c86"/><text class="v" x="${sx(Math.log10(value)) + 6}" y="${y + 15}">${money(value)}</text>`;
    return `<svg class="wf" viewBox="0 0 ${W} ${y + 26}">${svg}</svg>`;
  }

  function curve(r) {
    const T = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
    const pts = T.map((t) => [t, M.farm(window.SNAPSHOT.protocols.find((p) => p.slug === r.slug), r.value, { ticket: t, share: S.share, tbill: 0.04, asOf: R.as_of }).net]);
    const W = 330, H = 150, P = 30, ys = pts.map((p) => p[1]), mn = Math.min(0, ...ys), mx = Math.max(1, ...ys);
    const X = (t) => P + ((Math.log10(t) - 2) / 3) * (W - P - 22), Y = (v) => 8 + (1 - (v - mn) / (mx - mn)) * (H - 30);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    return `<svg class="wf" viewBox="0 0 ${W} ${H}"><line x1="${P}" x2="${W - 8}" y1="${Y(0)}" y2="${Y(0)}" stroke="#c9d1dd"/><path d="${line}" fill="none" stroke="#0e7c86" stroke-width="2.2"/>` +
      `<circle cx="${X(S.ticket)}" cy="${Y(pts.find((p) => p[0] === S.ticket)?.[1] ?? 0)}" r="4.5" fill="#16203a"/>` +
      [100, 1000, 10000, 100000].map((t) => `<text x="${X(t)}" y="${H - 4}" text-anchor="middle">${money(t, 0)}</text>`).join('') +
      `<text x="${P}" y="${Y(mx) + 10}">${money(mx)}</text><text x="${P}" y="${Y(0) - 4}">$0</text></svg>`;
  }

  function other() {
    const v = $('otherView');
    if (S.tab === 'traded') {
      const rows = [...R.traded].sort((a, b) => b.mcap - a.mcap);
      v.innerHTML = `<div class="other"><p class="note">These ${rows.length} protocols already trade. They are never ranked: they are the comps the size curve is fitted on.</p><table><tr><th>Protocol</th><th>Sector</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Cap / TVL</th></tr>` +
        rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${M.SECTOR_NAME[r.sector]}</td><td class="num">${money(r.tvl)}</td><td class="num">${money(r.mcap)}</td><td class="num">${(r.mcap / r.tvl).toFixed(2)}×</td></tr>`).join('') + '</table></div>';
    } else if (S.tab === 'aside') {
      v.innerHTML = `<div class="other"><p class="note">These ${R.aside.length} record no token but are a bridge, exchange, liquid-staking wrapper or versioned product of something that trades, by the watchlist's own rule. They are not launches of their own.</p><table><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th></tr>` +
        R.aside.sort((a, b) => b.tvl - a.tvl).map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.category ?? '–')}</td><td class="num">${money(r.tvl)}</td></tr>`).join('') + '</table></div>';
    } else {
      const f = R.fit;
      v.innerHTML = `<div class="other method"><h3>What is priced</h3><p>A protocol enters the board when DefiLlama records no token for it (no CoinGecko id, no ticker) and the watchlist's rule does not set it aside. That is all ${R.counts.watch} watchlist protocols and ${R.counts.pre - R.counts.watch} smaller ones, the early rows a radar exists to find. A record is not proof: a protocol here may still have a token its record does not carry.</p>
        <h3>The fit</h3><p>fitComps solves a ridge regression of log market cap on log TVL, time on record and a sector offset over the ${R.counts.traded} protocols whose token trades. Size slope ${f.size}, so ten times the TVL is worth ${(10 ** f.size).toFixed(1)} times the value. Sector offsets: ${Object.entries(f.offsets).map(([k, x]) => `${M.SECTOR_NAME[k]} ×${(10 ** x).toFixed(2)}`).join(', ')}.</p>
        <h3>The test</h3><p>looTest leaves each traded token out, refits on the rest and prices it. The median miss is ×${R.test.median_miss} against ×${R.test.flat_miss} for one flat multiple, and ${Math.round(R.test.within3 * 100)}% land within 3×. The band on every row is the middle half of those misses.</p>
        <h3>The plan</h3><p>farm picks the cheapest of a protocol's three largest chains, a play by sector, five steps with their transactions and minutes, and a hold that shortens the longer the protocol has gone with no token. Net is the depositors' pro-rata slice minus gas, bridge, swaps and the yield given up against a 4% T-bill. Farm needs at least $10 net and $5 an hour; thin is any profit below that.</p></div>`;
    }
  }

  function render() {
    tabs();
    $('boardView').hidden = S.tab !== 'board';
    $('otherView').hidden = S.tab === 'board';
    if (S.tab === 'board') board(); else other();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab],[data-sort],.seg button,tr[data-slug],circle[data-slug]');
    if (!t) return;
    if (t.dataset.tab) { S.tab = t.dataset.tab; render(); }
    else if (t.dataset.sort) { S.dir = S.sort === t.dataset.sort ? -S.dir : -1; S.sort = t.dataset.sort; board(); }
    else if (t.dataset.v !== undefined) { S[t.parentNode.dataset.key] = t.dataset.v; filters(); board(); scope(); }
    else if (t.dataset.slug) { S.open = t.dataset.slug; detail(S.open); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('detail').hidden = true; document.body.classList.remove('open'); }
    if (e.key === 'Enter' && e.target.dataset?.slug) detail(e.target.dataset.slug);
  });
  $('filters').addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'fq') S.text = e.target.value; if (id === 'fsector') S.sector = e.target.value; if (id === 'fchain') S.chain = e.target.value;
    if (id === 'fticket' || id === 'fshare') { S.ticket = +$('fticket').value; S.share = +$('fshare').value; compute(); lede(); scope(); if (S.open) detail(S.open); }
    board(); scope();
  });

  compute(); verify(); lede(); scope(); filters(); render();
  if (S.open) detail(S.open);
})();
