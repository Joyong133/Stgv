(function () {
  'use strict';
  var P = window.MidtermParser;

  // ---- Election setup (seats NOT on the ballot in 2026 are fixed) -------------------------
  // Senate before the election: R 53, D 47 (incl. King and Sanders, independents who caucus with D).
  // 35 seats up (33 Class 2 + Ohio and Florida specials): R 22, D 13 → seats not up: R 31, D 34.
  var SENATE_RACES = {
    AL: 'R', AK: 'R', AR: 'R', CO: 'D', DE: 'D', FL: 'R', GA: 'D', ID: 'R', IL: 'D', IA: 'R',
    KS: 'R', KY: 'R', LA: 'R', ME: 'R', MA: 'D', MI: 'D', MN: 'D', MS: 'R', MT: 'R', NE: 'R',
    NH: 'D', NJ: 'D', NM: 'D', NC: 'R', OH: 'R', OK: 'R', OR: 'D', RI: 'D', SC: 'R', SD: 'R',
    TN: 'R', TX: 'R', VA: 'D', WV: 'R', WY: 'R'
  };
  // Governors before the election: R 26, D 24. 36 races (R 18, D 18) → not up: R 8, D 6.
  var GOV_RACES = {
    AL: 'R', AK: 'R', AZ: 'D', AR: 'R', CA: 'D', CO: 'D', CT: 'D', FL: 'R', GA: 'R', HI: 'D',
    ID: 'R', IL: 'D', IA: 'R', KS: 'D', ME: 'D', MD: 'D', MA: 'D', MI: 'D', MN: 'D', NE: 'R',
    NV: 'R', NH: 'R', NM: 'D', NY: 'D', OH: 'R', OK: 'R', OR: 'D', PA: 'D', RI: 'D', SC: 'R',
    SD: 'R', TN: 'R', TX: 'R', VT: 'R', WI: 'D', WY: 'R'
  };
  var HOUSE_SEATS = {
    AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14, HI: 2, ID: 2, IL: 17,
    IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8, MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2,
    NE: 3, NV: 4, NH: 2, NJ: 12, NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17,
    RI: 2, SC: 7, SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1
  };

  var CHAMBERS = {
    senate: {
      label: '상원', page: '2026 United States Senate elections', total: 100, majority: 51,
      fixed: { D: 34, R: 31, I: 0 }, before: { D: 47, R: 53 }, races: SENATE_RACES, unit: '석',
      majorityText: '과반 51석 (50:50이면 부통령 밴스(공화) 캐스팅보트)'
    },
    house: {
      label: '하원', page: '2026 United States House of Representatives elections', total: 435, majority: 218,
      fixed: { D: 0, R: 0, I: 0 }, before: { D: 214, R: 219 }, unit: '석', majorityText: '과반 218석'
    },
    governor: {
      label: '주지사', page: '2026 United States gubernatorial elections', total: 50, majority: 26,
      fixed: { D: 6, R: 8, I: 0 }, before: { D: 24, R: 26 }, races: GOV_RACES, unit: '명',
      majorityText: '50개 주 중 26곳 이상이면 과반'
    }
  };

  // Tile-grid map of the US: [col, row]
  var GRID = {
    AK: [0, 0], ME: [10, 0], VT: [9, 1], NH: [10, 1],
    WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], WI: [6, 2], MI: [7, 2], NY: [8, 2], RI: [9, 2], MA: [10, 2],
    OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3],
    CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4],
    AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5],
    OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6],
    HI: [0, 7], TX: [3, 7], FL: [8, 7]
  };

  var PARTY_KO = { D: '민주당', R: '공화당', I: '무소속·기타' };
  var STATE_BY_ABBR = {};
  P.STATES.forEach(function (s) { STATE_BY_ABBR[s[1]] = { name: s[0], abbr: s[1], ko: s[2] }; });

  // ---- State ------------------------------------------------------------------------------
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };
  var data = { senate: null, house: null, governor: null };
  var errors = {};
  var tab = store.get('midterm.tab', 'senate');
  var filters = { senate: 'all', governor: 'all' };
  var feed = store.get('midterm.feed', []);
  var seenWinners = store.get('midterm.seen', null); // { "senate:NC": "D", ... }
  var unreadFeed = 0;
  var freshKeys = {};
  var lastOk = null;
  var loading = false;
  var timer = null;
  var nextAt = 0;

  // ---- Networking (native bridge in the APK, fetch() in a browser) ----------------------
  var pending = {};
  var seq = 0;
  window.__nativeFetchDone = function (id, status, body) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (status >= 200 && status < 300) p.resolve(body);
    else p.reject(new Error(status ? 'HTTP ' + status : (body || '네트워크 오류')));
  };
  function httpGet(url) {
    if (window.Native && window.Native.fetch) {
      return new Promise(function (resolve, reject) {
        var id = 'r' + (++seq);
        pending[id] = { resolve: resolve, reject: reject };
        window.Native.fetch(id, url);
        setTimeout(function () { if (pending[id]) window.__nativeFetchDone(id, 0, '시간 초과'); }, 30000);
      });
    }
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
  }

  function wikiUrl(page) {
    return 'https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content%7Ctimestamp' +
      '&rvslots=main&format=json&formatversion=2&redirects=1&origin=*&titles=' + encodeURIComponent(page) +
      '&_=' + Date.now();
  }
  function articleUrl(page) {
    return 'https://en.wikipedia.org/wiki/' + encodeURIComponent(page.replace(/ /g, '_'));
  }

  function loadChamber(key) {
    var c = CHAMBERS[key];
    return httpGet(wikiUrl(c.page)).then(function (body) {
      var j = JSON.parse(body);
      var pg = j.query && j.query.pages && j.query.pages[0];
      if (!pg || pg.missing || !pg.revisions) throw new Error('문서를 찾을 수 없음');
      var rev = pg.revisions[0];
      var text = rev.slots ? rev.slots.main.content : rev.content;
      var races = key === 'house' ? P.parseHouse(text) : P.parseStatewide(text);
      if (c.races) {
        // keep only states that actually vote for this office in 2026
        Object.keys(races).forEach(function (k) { if (!c.races[k]) delete races[k]; });
      }
      return { races: races, edited: rev.timestamp ? new Date(rev.timestamp) : null };
    });
  }

  // ---- Counting ---------------------------------------------------------------------------
  function count(key) {
    var c = CHAMBERS[key], d = data[key];
    var won = { D: 0, R: 0, I: 0 }, flips = { D: 0, R: 0, I: 0 };
    var races = d ? d.races : {};
    Object.keys(races).forEach(function (k) {
      var w = races[k].winner;
      if (!w) return;
      won[w.party]++;
      if (c.races && c.races[k] && c.races[k] !== w.party) flips[w.party]++;
    });
    var D = c.fixed.D + won.D, R = c.fixed.R + won.R, I = c.fixed.I + won.I;
    var raceTotal = c.races ? Object.keys(c.races).length : c.total;
    return {
      D: D, R: R, I: I, und: Math.max(0, c.total - D - R - I), won: won, flips: flips,
      called: won.D + won.R + won.I, raceTotal: raceTotal
    };
  }

  function verdict(key, t) {
    var c = CHAMBERS[key];
    if (key === 'senate') {
      if (t.D >= 51) return ['d', '민주당 상원 다수당 확정'];
      if (t.R >= 50) return ['r', '공화당 상원 다수당 확정' + (t.R === 50 ? ' (부통령 캐스팅보트)' : '')];
    } else if (key === 'house') {
      if (t.D >= 218) return ['d', '민주당 하원 다수당 확정'];
      if (t.R >= 218) return ['r', '공화당 하원 다수당 확정'];
    } else {
      if (t.D >= 26) return ['d', '민주당 주지사 과반 확정'];
      if (t.R >= 26) return ['r', '공화당 주지사 과반 확정'];
    }
    var needD = c.majority - t.D, needR = (key === 'senate' ? 50 : c.majority) - t.R;
    return ['', '아직 미정 · 민주당 ' + needD + c.unit + ' / 공화당 ' + needR + c.unit + ' 더 필요'];
  }

  // ---- Rendering --------------------------------------------------------------------------
  var view = document.getElementById('view');
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function pctW(n, total) { return (100 * n / total).toFixed(3) + '%'; }

  function summaryCard(key) {
    var c = CHAMBERS[key], t = count(key), v = verdict(key, t);
    var majPos = key === 'senate' ? 50 : (c.majority - 0.5);
    return '<section class="card">' +
      '<h2>' + c.label + ' 의석 현황<small>' + c.majorityText + '</small></h2>' +
      '<div class="totals">' +
        '<div class="side d"><div class="num">' + t.D + '</div><div class="lab">민주당</div></div>' +
        '<div class="mid-info"><strong>' + t.und + '</strong>미확정' + (t.I ? '<br>무소속·기타 ' + t.I : '') + '</div>' +
        '<div class="side r"><div class="num">' + t.R + '</div><div class="lab">공화당</div></div>' +
      '</div>' +
      '<div class="bar" role="img" aria-label="민주당 ' + t.D + ', 미확정 ' + t.und + ', 공화당 ' + t.R + '">' +
        '<span class="d" style="width:' + pctW(t.D, c.total) + '"></span>' +
        '<span class="i" style="width:' + pctW(t.I, c.total) + '"></span>' +
        '<span class="u" style="width:' + pctW(t.und, c.total) + '"></span>' +
        '<span class="r" style="width:' + pctW(t.R, c.total) + '"></span>' +
        '<i class="maj" style="left:' + pctW(majPos, c.total) + '"></i>' +
      '</div>' +
      '<div class="bar-caption"><span>선거 전 ' + c.before.D + '</span><span>' + (key === 'senate' ? '50|51' : c.majority) + '</span><span>선거 전 ' + c.before.R + '</span></div>' +
      '<div class="verdict ' + v[0] + '">' + v[1] + '</div>' +
      '<div class="stats">' +
        '<div class="stat"><b>' + t.called + ' / ' + t.raceTotal + '</b><span>확정된 경합</span></div>' +
        (c.races
          ? '<div class="stat"><b style="color:var(--dem)">' + t.flips.D + '</b><span>민주당이 뺏은 곳</span></div>' +
            '<div class="stat"><b style="color:var(--rep)">' + t.flips.R + '</b><span>공화당이 뺏은 곳</span></div>'
          : '<div class="stat"><b style="color:var(--dem)">' + t.won.D + '</b><span>민주당 당선</span></div>' +
            '<div class="stat"><b style="color:var(--rep)">' + t.won.R + '</b><span>공화당 당선</span></div>') +
      '</div>' +
      (c.fixed.D + c.fixed.R ? '<div class="map-note">이번에 선거가 없는 ' + c.label + ' 의석(민주 ' + c.fixed.D + ' · 공화 ' + c.fixed.R + ')을 포함한 숫자입니다.' + (key === 'senate' ? ' 민주당에는 민주당과 함께하는 무소속(킹·샌더스) 포함.' : '') + '</div>' : '') +
      errorNote(key) +
    '</section>';
  }
  function errorNote(key) {
    if (!errors[key]) return '';
    return '<div class="map-note err" style="color:var(--rep)">⚠ 최신 자료를 받지 못했습니다: ' + esc(errors[key]) + '</div>';
  }

  function tileMap(key) {
    var c = CHAMBERS[key], races = (data[key] && data[key].races) || {};
    var html = '<section class="card"><h2>주별 지도<small>노란 점 = 정당이 바뀐 곳</small></h2><div class="tilemap">';
    var cells = [];
    Object.keys(GRID).forEach(function (ab) { cells.push([GRID[ab][1], GRID[ab][0], ab]); });
    cells.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    cells.forEach(function (cell) {
      var ab = cell[2], cls = 'tile', title;
      var st = STATE_BY_ABBR[ab];
      if (!c.races[ab]) { cls += ' none'; title = st.ko + ': 2026년 선거 없음'; }
      else {
        var r = races[ab], w = r && r.winner;
        if (w) {
          cls += ' ' + w.party + (w.party !== c.races[ab] ? ' flip' : '');
          title = st.ko + ': ' + PARTY_KO[w.party] + ' ' + w.name + ' 당선';
        } else {
          cls += ' pend was-' + c.races[ab].toLowerCase();
          title = st.ko + ': 미확정';
        }
        if (freshKeys[key + ':' + ab]) cls += ' new';
      }
      html += '<button type="button" class="' + cls + '" data-race="' + key + ':' + ab + '" style="grid-column:' + (cell[1] + 1) + ';grid-row:' + (cell[0] + 1) + '" aria-label="' + esc(title) + '" title="' + esc(title) + '">' + ab + '</button>';
    });
    html += '</div><div class="map-note">회색 칸 아래 띠 색 = 현재 그 의석을 가진 정당 · 흐린 칸 = 올해 선거 없음 · 칸을 누르면 후보별 득표</div></section>';
    return html;
  }

  function raceList(key) {
    var c = CHAMBERS[key], races = (data[key] && data[key].races) || {};
    var f = filters[key];
    var keys = Object.keys(c.races).sort(function (a, b) { return STATE_BY_ABBR[a].ko.localeCompare(STATE_BY_ABBR[b].ko, 'ko'); });
    var rows = keys.map(function (ab) {
      var r = races[ab], w = r && r.winner, st = STATE_BY_ABBR[ab];
      var flip = w && w.party !== c.races[ab];
      if (f === 'called' && !w) return '';
      if (f === 'pending' && w) return '';
      if (f === 'flip' && !flip) return '';
      var who;
      if (w) who = '<span class="' + w.party + '">✔ ' + esc(w.name) + '</span>' + (w.pct != null ? ' ' + w.pct + '%' : '');
      else if (r && r.candidates.length) who = r.candidates.slice(0, 3).map(function (x) { return '<span class="' + x.party + '">' + esc(x.name) + '</span>' + (x.pct != null ? ' ' + x.pct + '%' : ''); }).join(' vs ');
      else who = '후보 정보 없음';
      return '<div class="race" data-race="' + key + ':' + ab + '">' +
        '<div class="chip ' + (w ? w.party : '') + '">' + ab + '</div>' +
        '<div class="info"><div class="st">' + st.ko + '<small>' + st.name + '</small></div><div class="who">' + who + '</div></div>' +
        (flip ? '<span class="badge flip">' + (w.party === 'D' ? '민주' : w.party === 'R' ? '공화' : '무소속') + ' 탈환</span>'
              : '<span class="badge">' + (w ? '확정' : '현직 ' + (c.races[ab] === 'D' ? '민주' : '공화')) + '</span>') +
      '</div>';
    }).join('');
    return '<section class="card"><h2>경합별 결과</h2>' + filterBar(key) + (rows || '<div class="empty">해당하는 경합이 없습니다.</div>') + '</section>';
  }
  function filterBar(key) {
    var f = filters[key];
    return '<div class="filter">' + [['all', '전체'], ['called', '확정'], ['pending', '미확정'], ['flip', '정당 교체']].map(function (o) {
      return '<button type="button" data-filter="' + key + ':' + o[0] + '" class="' + (f === o[0] ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }

  function houseStates() {
    var races = (data.house && data.house.races) || {};
    var per = {};
    Object.keys(HOUSE_SEATS).forEach(function (ab) { per[ab] = { D: 0, R: 0, I: 0 }; });
    Object.keys(races).forEach(function (k) {
      var r = races[k];
      if (r.winner && per[r.abbr]) per[r.abbr][r.winner.party]++;
    });
    var keys = Object.keys(HOUSE_SEATS).sort(function (a, b) { return HOUSE_SEATS[b] - HOUSE_SEATS[a] || STATE_BY_ABBR[a].ko.localeCompare(STATE_BY_ABBR[b].ko, 'ko'); });
    var html = '<section class="card"><h2>주별 하원 결과<small>의석 많은 순 · 누르면 선거구별 결과</small></h2>';
    keys.forEach(function (ab) {
      var n = HOUSE_SEATS[ab], p = per[ab], st = STATE_BY_ABBR[ab];
      html += '<div class="hstate" data-house="' + ab + '">' +
        '<div class="nm">' + st.ko + '</div>' +
        '<div class="mini"><span style="width:' + pctW(p.D, n) + ';background:var(--dem)"></span><span style="width:' + pctW(p.I, n) + ';background:var(--ind)"></span><span style="flex:1"></span><span style="width:' + pctW(p.R, n) + ';background:var(--rep)"></span></div>' +
        '<div class="cnt"><span class="d">' + p.D + '</span> : <span class="r">' + p.R + '</span> / ' + n + '</div>' +
      '</div>';
    });
    return html + '</section>';
  }

  function feedView() {
    if (!feed.length) {
      return '<section class="card"><h2>속보</h2><div class="empty">앱을 켜둔 동안 새로 당선이 확정되는 경합이 여기에 쌓이고 알림으로도 알려드립니다.</div></section>';
    }
    return '<section class="card"><h2>속보<small>새로 확정된 경합</small></h2>' + feed.slice(0, 200).map(function (f) {
      var d = new Date(f.t);
      return '<div class="feed-item"><time>' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '</time>' +
        '<div class="chip ' + f.party + '">' + esc(f.abbr) + '</div>' +
        '<div class="info"><div class="st">' + esc(f.title) + '</div><div class="who">' + esc(f.text) + '</div></div></div>';
    }).join('') + '<button type="button" class="link-btn" id="clearFeed">속보 기록 지우기</button></section>';
  }

  function render() {
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    var badge = document.getElementById('feedBadge');
    badge.hidden = !unreadFeed;
    badge.textContent = unreadFeed;
    if (tab === 'feed') { view.innerHTML = feedView(); return; }
    if (!data[tab] && !errors[tab]) { view.innerHTML = '<div class="card empty">불러오는 중…</div>'; return; }
    if (tab === 'house') view.innerHTML = summaryCard('house') + houseStates();
    else view.innerHTML = summaryCard(tab) + tileMap(tab) + raceList(tab);
  }

  // ---- Detail sheet -----------------------------------------------------------------------
  var sheet = document.getElementById('sheet');
  function openSheet(html) {
    document.getElementById('sheetBody').innerHTML = html;
    sheet.hidden = false;
  }
  function candRows(list) {
    if (!list || !list.length) return '<div class="empty">후보 정보가 아직 없습니다.</div>';
    return list.map(function (x) {
      return '<div class="cand"><span class="dot ' + x.party + '"></span>' +
        '<span class="nm">' + (x.won ? '<span class="won">✔ </span>' : '') + esc(x.name) + ' <small style="color:var(--muted)">' + esc(PARTY_KO[x.party] || x.partyLabel) + '</small></span>' +
        '<span class="pct">' + (x.pct != null ? x.pct + '%' : '') + '</span></div>';
    }).join('');
  }
  function showRace(key, ab) {
    var c = CHAMBERS[key], st = STATE_BY_ABBR[ab];
    if (!c.races || !c.races[ab]) return;
    var r = data[key] && data[key].races[ab];
    var w = r && r.winner;
    openSheet('<h3>' + st.ko + ' ' + c.label + '</h3>' +
      '<div class="sub">' + st.name + ' · 선거 전 ' + PARTY_KO[c.races[ab]] + (w ? ' → <b style="color:var(--' + (w.party === 'D' ? 'dem' : w.party === 'R' ? 'rep' : 'ind') + ')">' + PARTY_KO[w.party] + ' 당선 확정</b>' : ' · 아직 미확정') +
      (r && r.note ? '<br>' + esc(r.note) : '') + '</div>' +
      candRows(r && r.candidates) +
      '<button type="button" class="link-btn" data-open="' + esc(articleUrl(c.page)) + '">위키백과 원문 보기</button>');
  }
  function showHouseState(ab) {
    var st = STATE_BY_ABBR[ab], races = (data.house && data.house.races) || {};
    var list = Object.keys(races).filter(function (k) { return races[k].abbr === ab; })
      .sort(function (a, b) { return (parseInt(races[a].district, 10) || 0) - (parseInt(races[b].district, 10) || 0); });
    var html = '<h3>' + st.ko + ' 하원 (' + HOUSE_SEATS[ab] + '석)</h3><div class="sub">' + st.name + '</div>';
    if (!list.length) html += '<div class="empty">선거구 자료가 아직 없습니다.</div>';
    list.forEach(function (k) {
      var r = races[k], w = r.winner;
      var who = w ? '<span class="' + w.party + '">✔ ' + esc(w.name) + '</span>' + (w.pct != null ? ' ' + w.pct + '%' : '')
        : r.candidates.slice(0, 3).map(function (x) { return '<span class="' + x.party + '">' + esc(x.name) + '</span>'; }).join(' vs ');
      html += '<div class="race" style="cursor:default"><div class="chip ' + (w ? w.party : '') + '">' + (r.district === 'AL' ? '전체' : r.district) + '</div>' +
        '<div class="info"><div class="st">' + (r.district === 'AL' ? '주 전체 선거구' : r.district + '선거구') + '</div><div class="who">' + who + '</div></div></div>';
    });
    html += '<button type="button" class="link-btn" data-open="' + esc(articleUrl(CHAMBERS.house.page)) + '">위키백과 원문 보기</button>';
    openSheet(html);
  }

  // ---- New-call detection -----------------------------------------------------------------
  function detectNewCalls() {
    var now = {};
    ['senate', 'house', 'governor'].forEach(function (key) {
      var d = data[key];
      if (!d) return;
      Object.keys(d.races).forEach(function (k) { if (d.races[k].winner) now[key + ':' + k] = d.races[k]; });
    });
    var first = seenWinners === null;
    var seen = seenWinners || {};
    var fresh = [];
    Object.keys(now).forEach(function (id) {
      var w = now[id].winner;
      if (seen[id] !== w.party) fresh.push(id);
      seen[id] = w.party;
    });
    // keep winners of chambers that failed to load this round
    seenWinners = seen;
    store.set('midterm.seen', seenWinners);
    freshKeys = {};
    if (first || !fresh.length) return;
    fresh.forEach(function (id) {
      freshKeys[id] = true;
      var key = id.split(':')[0], r = now[id], c = CHAMBERS[key], w = r.winner;
      var was = c.races && c.races[r.abbr];
      var flip = was && was !== w.party;
      var place = key === 'house' ? r.ko + ' ' + (r.district === 'AL' ? '전체' : r.district) + '선거구' : r.ko;
      feed.unshift({
        t: Date.now(), abbr: r.abbr, party: w.party,
        title: place + ' ' + c.label + ' · ' + PARTY_KO[w.party] + (flip ? ' 탈환!' : ' 승리'),
        text: w.name + (w.pct != null ? ' (' + w.pct + '%)' : '') + ' 당선 확정'
      });
    });
    feed = feed.slice(0, 300);
    store.set('midterm.feed', feed);
    unreadFeed += fresh.length;
    var top = feed[0];
    var msg = fresh.length === 1 ? top.title + ' — ' + top.text : top.title + ' 외 ' + (fresh.length - 1) + '곳 새로 확정';
    toast('🔔 ' + msg);
    if (window.Native && window.Native.notify) {
      var tt = count('senate'), th = count('house');
      window.Native.notify(msg, '상원 민주 ' + tt.D + ' : 공화 ' + tt.R + ' · 하원 민주 ' + th.D + ' : 공화 ' + th.R);
    }
  }

  var toastTimer;
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 5000);
  }

  // ---- Refresh loop -----------------------------------------------------------------------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }

  function refresh() {
    if (loading) return;
    loading = true;
    document.getElementById('refreshBtn').classList.add('spin');
    setStatus('갱신 중…');
    var keys = ['senate', 'house', 'governor'];
    Promise.all(keys.map(function (k) {
      return loadChamber(k).then(function (res) { data[k] = res; delete errors[k]; }, function (e) { errors[k] = e.message || String(e); });
    })).then(function () {
      loading = false;
      document.getElementById('refreshBtn').classList.remove('spin');
      if (keys.some(function (k) { return !errors[k]; })) lastOk = new Date();
      detectNewCalls();
      render();
      schedule();
    });
  }

  function setStatus(extra) {
    var el = document.getElementById('status');
    var parts = [];
    if (lastOk) parts.push('갱신 ' + hm(lastOk));
    var ed = ['senate', 'house', 'governor'].map(function (k) { return data[k] && data[k].edited; }).filter(Boolean)
      .sort(function (a, b) { return b - a; })[0];
    if (ed) parts.push('자료 수정 ' + pad(ed.getHours()) + ':' + pad(ed.getMinutes()));
    if (extra) parts.push(extra);
    var bad = Object.keys(errors).length;
    el.innerHTML = esc(parts.join(' · ')) + (bad && !extra ? ' · <span class="err">연결 오류</span>' : '');
  }

  function schedule() {
    clearTimeout(timer);
    var sec = parseInt(document.getElementById('interval').value, 10);
    var dot = document.getElementById('liveDot');
    dot.classList.toggle('off', !sec);
    dot.classList.toggle('pulse', !!sec);
    if (!sec) { setStatus('자동 새로고침 꺼짐'); return; }
    nextAt = Date.now() + sec * 1000;
    tick();
  }
  function tick() {
    clearTimeout(timer);
    var left = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
    if (left <= 0) { refresh(); return; }
    setStatus(left + '초 후 갱신');
    timer = setTimeout(tick, 1000);
  }

  // ---- Events -----------------------------------------------------------------------------
  document.querySelector('.tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab;
    store.set('midterm.tab', tab);
    if (tab === 'feed') unreadFeed = 0;
    render();
    window.scrollTo(0, 0);
  });
  view.addEventListener('click', function (e) {
    var t = e.target.closest('[data-race],[data-filter],[data-house],#clearFeed');
    if (!t) return;
    if (t.id === 'clearFeed') { feed = []; store.set('midterm.feed', feed); render(); return; }
    if (t.dataset.filter) { var f = t.dataset.filter.split(':'); filters[f[0]] = f[1]; render(); return; }
    if (t.dataset.house) { showHouseState(t.dataset.house); return; }
    var r = t.dataset.race.split(':');
    showRace(r[0], r[1]);
  });
  sheet.addEventListener('click', function (e) {
    if (e.target === sheet || e.target.closest('.sheet-close')) { sheet.hidden = true; return; }
    var o = e.target.closest('[data-open]');
    if (o) {
      if (window.Native && window.Native.openUrl) window.Native.openUrl(o.dataset.open);
      else window.open(o.dataset.open, '_blank');
    }
  });
  document.getElementById('refreshBtn').addEventListener('click', refresh);
  var intervalSel = document.getElementById('interval');
  intervalSel.value = String(store.get('midterm.interval', 60));
  intervalSel.addEventListener('change', function () { store.set('midterm.interval', parseInt(intervalSel.value, 10)); if (!loading) schedule(); });
  window.__onResume = function () { if (!loading && parseInt(intervalSel.value, 10)) refresh(); };
  window.__onBack = function () {
    if (!sheet.hidden) { sheet.hidden = true; return true; }
    return false;
  };

  render();
  refresh();
})();
