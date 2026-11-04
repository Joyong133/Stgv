/*
 * Wikipedia wikitext parser for the 2026 US midterm results tables.
 *
 * Wikipedia's race tables mark each called race's winner with {{Aye}} (a green check)
 * in the candidate list, e.g.
 *   * {{Aye}} [[Roy Cooper]] (Democratic) 52.1%
 * We read every table row, find which state (or House district) it belongs to,
 * and record the candidates and the winner, if one is marked.
 *
 * Works both in the app's WebView and in Node (tools/probe.js).
 */
(function (root) {
  'use strict';

  var STATES = [
    ['Alabama', 'AL', '앨라배마'], ['Alaska', 'AK', '알래스카'], ['Arizona', 'AZ', '애리조나'],
    ['Arkansas', 'AR', '아칸소'], ['California', 'CA', '캘리포니아'], ['Colorado', 'CO', '콜로라도'],
    ['Connecticut', 'CT', '코네티컷'], ['Delaware', 'DE', '델라웨어'], ['Florida', 'FL', '플로리다'],
    ['Georgia', 'GA', '조지아'], ['Hawaii', 'HI', '하와이'], ['Idaho', 'ID', '아이다호'],
    ['Illinois', 'IL', '일리노이'], ['Indiana', 'IN', '인디애나'], ['Iowa', 'IA', '아이오와'],
    ['Kansas', 'KS', '캔자스'], ['Kentucky', 'KY', '켄터키'], ['Louisiana', 'LA', '루이지애나'],
    ['Maine', 'ME', '메인'], ['Maryland', 'MD', '메릴랜드'], ['Massachusetts', 'MA', '매사추세츠'],
    ['Michigan', 'MI', '미시간'], ['Minnesota', 'MN', '미네소타'], ['Mississippi', 'MS', '미시시피'],
    ['Missouri', 'MO', '미주리'], ['Montana', 'MT', '몬태나'], ['Nebraska', 'NE', '네브래스카'],
    ['Nevada', 'NV', '네바다'], ['New Hampshire', 'NH', '뉴햄프셔'], ['New Jersey', 'NJ', '뉴저지'],
    ['New Mexico', 'NM', '뉴멕시코'], ['New York', 'NY', '뉴욕'], ['North Carolina', 'NC', '노스캐롤라이나'],
    ['North Dakota', 'ND', '노스다코타'], ['Ohio', 'OH', '오하이오'], ['Oklahoma', 'OK', '오클라호마'],
    ['Oregon', 'OR', '오리건'], ['Pennsylvania', 'PA', '펜실베이니아'], ['Rhode Island', 'RI', '로드아일랜드'],
    ['South Carolina', 'SC', '사우스캐롤라이나'], ['South Dakota', 'SD', '사우스다코타'], ['Tennessee', 'TN', '테네시'],
    ['Texas', 'TX', '텍사스'], ['Utah', 'UT', '유타'], ['Vermont', 'VT', '버몬트'],
    ['Virginia', 'VA', '버지니아'], ['Washington', 'WA', '워싱턴'], ['West Virginia', 'WV', '웨스트버지니아'],
    ['Wisconsin', 'WI', '위스콘신'], ['Wyoming', 'WY', '와이오밍']
  ];

  var BY_NAME = {}, BY_ABBR = {};
  STATES.forEach(function (s) { BY_NAME[s[0]] = BY_ABBR[s[1]] = { name: s[0], abbr: s[1], ko: s[2] }; });

  // Longest names first so "West Virginia" wins over "Virginia".
  var STATE_RE = new RegExp('(^|[^A-Za-z])(' + STATES.map(function (s) { return s[0]; })
    .sort(function (a, b) { return b.length - a.length; })
    .map(function (n) { return n.replace(/ /g, '[ _]'); }).join('|') + ')(?![A-Za-z])');

  var WIN_RE = /\{\{\s*(aye|tick|yes check|check ?mark|won)\s*(\||\}\})/i;

  function findState(s) {
    var m = STATE_RE.exec(s || '');
    return m ? BY_NAME[m[2].replace(/_/g, ' ')] : null;
  }

  function partyCode(p) {
    p = (p || '').toLowerCase();
    if (/democrat|dfl|farmer.labor/.test(p)) return 'D';
    if (/republican|\bgop\b/.test(p)) return 'R';
    if (/independent|libertarian|green|forward|constitution|nonpartisan|alaska|other/.test(p)) return 'I';
    return '';
  }

  // Turn a wikitext fragment into plain readable text.
  function plain(s) {
    var prev;
    s = s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
    s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '');
    s = s.replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1');
    s = s.replace(/\{\{\s*sortname\s*\|([^|}]*)\|([^|}]*)[^}]*\}\}/gi, '$1 $2');
    s = s.replace(/\{\{\s*(?:nowrap|nobr|small)\s*\|([^{}]*)\}\}/gi, '$1');
    do { prev = s; s = s.replace(/\{\{[^{}]*\}\}/g, ''); } while (s !== prev);
    s = s.replace(/'''?/g, '').replace(/&nbsp;/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  // Candidate bullet: "* {{Aye}} [[Name]] (Party) 51.2%"
  function parseCandidateLine(line) {
    var won = WIN_RE.test(line);
    var t = plain(line.replace(/^\s*\*+\s*/, ''));
    var m = /^(.*?)\s*\(([^()]+)\)\s*(.*)$/.exec(t);
    if (!m) return null;
    var party = partyCode(m[2]);
    if (!party) return null;
    var pct = /(\d{1,3}(?:\.\d+)?)\s*%/.exec(m[3]);
    var name = m[1].replace(/^[\s:–-]+|[\s:–-]+$/g, '');
    if (!name || name.length > 60) return null;
    return { name: name, party: party, partyLabel: m[2].trim(), pct: pct ? parseFloat(pct[1]) : null, won: won };
  }

  // Drop sections whose heading mentions special elections held *before* this cycle
  // (they carry {{Aye}} marks for races that are not part of the 2026 general).
  function dropSections(text, re) {
    var out = [], skipLevel = 0;
    text.split('\n').forEach(function (line) {
      var h = /^(={2,6})\s*(.*?)\s*\1\s*$/.exec(line);
      if (h) {
        var level = h[1].length;
        if (skipLevel && level <= skipLevel) skipLevel = 0;
        if (!skipLevel && re.test(h[2])) { skipLevel = level; return; }
      }
      if (!skipLevel) out.push(line);
    });
    return out.join('\n');
  }

  function tableRows(text) {
    return text.split(/\n\|-[^\n]*/);
  }

  function headerOf(row) {
    var lines = row.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    for (var i = 0; i < lines.length && i < 3; i++) {
      if (lines[i].charAt(0) === '!') return lines[i];
    }
    return lines.slice(0, 2).join(' ');
  }

  function candidatesOf(row) {
    var list = [];
    row.split('\n').forEach(function (line) {
      if (!/^\s*\*/.test(line)) return;
      var c = parseCandidateLine(line);
      if (c) list.push(c);
    });
    return list;
  }

  function resultNote(row) {
    var m = /(Incumbent[^|\n]*?(?:re-elected|defeated|retired|lost|elected)[^|\n]*|New (?:senator|member|governor) elected[^|\n]*|(?:Democratic|Republican|Independent) (?:gain|hold)[^|\n]*)/i.exec(row);
    return m ? plain(m[1]).slice(0, 120) : '';
  }

  function merge(map, key, entry) {
    var old = map[key];
    if (!old) { map[key] = entry; return; }
    if (!old.winner && entry.winner) { entry.candidates = entry.candidates.length >= old.candidates.length ? entry.candidates : old.candidates; map[key] = entry; return; }
    if (!old.winner && entry.candidates.length > old.candidates.length) map[key] = entry;
  }

  function buildEntry(state, cands, row) {
    var winner = null;
    cands.forEach(function (c) { if (c.won && !winner) winner = c; });
    return { state: state.name, abbr: state.abbr, ko: state.ko, candidates: cands, winner: winner, note: resultNote(row) };
  }

  // Senate / governor pages: one race per state.
  function parseStatewide(text) {
    var races = {};
    // Note: the Ohio/Florida 2026 Senate specials sit under "Special elections during the
    // preceding Congress", so those sections must be kept here.
    text = dropSections(text, /see also|references|notes|external links/i);
    tableRows(text).forEach(function (row) {
      var cands = candidatesOf(row);
      if (cands.length === 0) return;
      var st = findState(headerOf(row));
      if (!st) return;
      merge(races, st.abbr, buildEntry(st, cands, row));
    });
    return races;
  }

  // House page: one race per district, keyed like "NC-1" / "AK-AL".
  function parseHouse(text) {
    var races = {};
    text = dropSections(text, /special election|preceding congress|see also|references|notes|external links/i);
    var USHR = /\{\{\s*ushr\s*\|\s*([^|}]+?)\s*\|\s*([^|}]+?)\s*(?:\||\}\})/i;
    tableRows(text).forEach(function (row) {
      var m = USHR.exec(row.slice(0, 400));
      if (!m) return;
      var id = m[1].replace(/_/g, ' ');
      var st = BY_NAME[id] || BY_ABBR[id.toUpperCase()];
      if (!st) return; // territories / delegates
      var cands = candidatesOf(row);
      if (cands.length === 0) return;
      var d = m[2].toUpperCase();
      d = /^(AL|AT[- ]?LARGE|0)$/.test(d) ? 'AL' : String(parseInt(d, 10));
      if (d === 'NaN') return;
      var e = buildEntry(st, cands, row);
      e.district = d;
      merge(races, st.abbr + '-' + d, e);
    });
    return races;
  }

  function tally(races) {
    var t = { D: 0, R: 0, I: 0, total: 0, called: 0 };
    Object.keys(races).forEach(function (k) {
      t.total++;
      var w = races[k].winner;
      if (w) { t.called++; t[w.party] = (t[w.party] || 0) + 1; }
    });
    return t;
  }

  var api = {
    STATES: STATES, BY_NAME: BY_NAME, BY_ABBR: BY_ABBR, plain: plain, parseCandidateLine: parseCandidateLine,
    parseStatewide: parseStatewide, parseHouse: parseHouse, tally: tally, findState: findState
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MidtermParser = api;
})(this);
