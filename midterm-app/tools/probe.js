// Fetches the live Wikipedia pages and runs the app's parser on them.
// Used in CI to confirm the parser still matches the current page layout.
//   node tools/probe.js
const P = require('../app/src/main/assets/parser.js');

const PAGES = {
  senate: '2026 United States Senate elections',
  house: '2026 United States House of Representatives elections',
  governor: '2026 United States gubernatorial elections',
};

async function wikitext(title) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content%7Ctimestamp' +
    '&rvslots=main&format=json&formatversion=2&redirects=1&titles=' + encodeURIComponent(title);
  const r = await fetch(url, { headers: { 'User-Agent': 'MidtermLiveKR-CI/1.0 (https://github.com/joyong133/stgv)' } });
  if (!r.ok) throw new Error(title + ': HTTP ' + r.status);
  const j = await r.json();
  const rev = j.query.pages[0].revisions[0];
  return { text: rev.slots.main.content, ts: rev.timestamp };
}

(async () => {
  let bad = false;
  for (const [key, title] of Object.entries(PAGES)) {
    const { text, ts } = await wikitext(title);
    const races = key === 'house' ? P.parseHouse(text) : P.parseStatewide(text);
    const t = P.tally(races);
    console.log(`\n=== ${key}: "${title}" (rev ${ts}, ${text.length} chars)`);
    console.log(`races found ${t.total}, called ${t.called}  D ${t.D}  R ${t.R}  I ${t.I}`);
    const sample = Object.keys(races).slice(0, 6).map(k => {
      const r = races[k];
      return `  ${k}: ` + r.candidates.map(c => `${c.won ? '[W] ' : ''}${c.name} (${c.party}${c.pct != null ? ' ' + c.pct + '%' : ''})`).join(' | ');
    });
    console.log(sample.join('\n'));
    const expect = { senate: 30, house: 380, governor: 30 }[key];
    if (t.total < expect) { bad = true; console.log(`!! only ${t.total} races parsed (expected >= ${expect})`); }
    if (t.total < expect || process.env.DUMP) {
      const aye = text.split('\n').filter(l => /\{\{\s*aye/i.test(l)).slice(0, 5);
      console.log('-- sample {{Aye}} lines:\n' + aye.join('\n'));
      const i = text.indexOf('{{Aye');
      console.log('-- context around first {{Aye}}:\n' + text.slice(Math.max(0, i - 1500), i + 500));
    }
  }
  if (bad) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
