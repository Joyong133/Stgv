'use strict';
// ───────────────────────── 몬스터 도트 ─────────────────────────
// 각 몬스터는 2프레임 (0: 기본, 1: 움찔/통통) 으로 그린다. 모두 왼쪽을 바라본다.

const MONSTER_ART = {
  snail: { w: 24, h: 20, draw(P, f, o) {
    const sc = o.shell;
    const st = f ? 1 : 0;
    P.ell(12, 16, 10 + st, 3, '#f0d2a0');           // 몸
    P.rect(3, 16, 18 + st, 2, '#e0bc84');
    P.ell(5 - st, 13, 3.5, 3.5, '#f0d2a0');         // 머리
    P.line(4 - st, 11, 2 - st, 5, '#e0bc84'); P.line(6 - st, 11, 7 - st, 5, '#e0bc84');
    P.ell(2 - st, 5, 1.6, 1.6, '#ffffff'); P.px(2 - st, 5, '#202020');
    P.ell(7 - st, 5, 1.6, 1.6, '#ffffff'); P.px(7 - st, 5, '#202020');
    P.px(4 - st, 14, '#a05a40');
    P.ell(14, 9, 7, 7, sc);                          // 껍질
    P.ell(14, 9, 4.5, 4.5, shade(sc, -22));
    P.ell(14.5, 8.5, 2.5, 2.5, shade(sc, 25));
    P.ell(14, 9, 1, 1, shade(sc, -35));
    P.px(10, 4, shade(sc, 55)); P.px(11, 3, shade(sc, 55));
  } },
  slime: { w: 24, h: 22, draw(P, f) {
    const c = '#6ad35f', rx = f ? 10.5 : 9, ry = f ? 6 : 7.5, cy = f ? 15 : 13.5;
    P.ell(12, cy, rx, ry, c);
    P.ell(12, cy - ry + 1, 2.5, 3, c);
    P.rect(12 - rx + 1, cy + ry - 2, rx * 2 - 2, 1, shade(c, -25));
    P.ell(8, cy - 3, 2, 1.5, shade(c, 50));
    P.rect(8, cy - 1, 2, 3, '#1b2a1a'); P.px(8, cy - 1, '#ffffff');
    P.rect(14, cy - 1, 2, 3, '#1b2a1a'); P.px(14, cy - 1, '#ffffff');
    P.rect(11, cy + 3, 2, 1, '#2a4a28');
  } },
  mushroom: { w: 26, h: 26, draw(P, f, o) {
    const cc = o.cap, sq = f ? 1 : 0;
    P.ell(8, 23, 3.5, 2, '#8a5a30'); P.ell(18, 23, 3.5, 2, '#8a5a30');      // 발
    P.ell(13, 17 + sq, 7, 5.5 - sq, '#fbe6c8');                             // 몸통
    P.rect(7, 13 + sq, 12, 2, shade('#fbe6c8', -12));
    const eye = o.eye || '#20160f';
    P.rect(9, 16 + sq, 2, 3, eye); P.rect(15, 16 + sq, 2, 3, eye);
    if (o.angry) { P.line(8, 14 + sq, 11, 15 + sq, '#20160f'); P.line(18, 14 + sq, 15, 15 + sq, '#20160f'); }
    else { P.px(9, 16 + sq, '#ffffff'); P.px(15, 16 + sq, '#ffffff'); }
    P.rect(12, 20 + sq, 2, 1, '#a05040');
    P.ell(13, 10 + sq, 12, 8.5 - sq, cc, y => y <= 13 + sq);                // 갓
    P.rect(2, 12 + sq, 22, 2, shade(cc, -25));
    if (o.spots) { P.ell(8, 7 + sq, 2.2, 1.8, o.spots); P.ell(15, 5 + sq, 2.5, 2, o.spots); P.ell(19, 9 + sq, 1.6, 1.4, o.spots); P.ell(5, 11 + sq, 1.3, 1, o.spots); }
    P.ell(10, 4 + sq, 3, 1.2, shade(cc, 40));
    if (o.horns) { P.tri(6, 5, 3, -1, 9, 3, '#f4ecd8'); P.tri(20, 5, 23, -1, 17, 3, '#f4ecd8'); }
    if (o.stitch) { P.line(9, 3 + sq, 17, 9 + sq, '#3a2a3a'); [10, 12, 14, 16].forEach((x, i) => P.px(x, 3 + sq + i * 1.6, '#e8e0f0')); }
  } },
  pig: { w: 28, h: 22, draw(P, f) {
    const pk = '#ffb3c6', st = f ? 1 : 0;
    P.rect(8, 17, 3, 4 - st, shade(pk, -20)); P.rect(19, 17, 3, 4 + st - 1, shade(pk, -20));
    P.rect(12, 17, 3, 4 - (1 - st), pk); P.rect(22, 17, 3, 4 - st, pk);
    P.ell(16, 12, 10, 7, pk);                                               // 몸
    P.ell(7, 10, 6, 6, pk);                                                 // 머리
    P.ell(3, 11, 2.5, 2, '#ff8fab'); P.px(2, 11, '#8a3a50'); P.px(4, 11, '#8a3a50');
    P.rect(6, 8, 2, 2, '#201418'); P.px(6, 8, '#ffffff');
    P.tri(8, 4, 12, 4, 11, 0, shade(pk, -10));                              // 귀
    P.tri(5, 2, 9, 5, 4, 6, '#e83a5a'); P.tri(9, 5, 14, 2, 13, 7, '#e83a5a'); P.ell(9, 5, 1.6, 1.6, '#b81e3e'); // 리본
    P.line(26, 9, 27, 7, shade(pk, -15)); P.px(26, 6, shade(pk, -15));
    P.ell(14, 9, 4, 1.4, shade(pk, 35));
  } },
  stump: { w: 24, h: 26, draw(P, f, o) {
    const bk = o.bark || '#8a5a30', sq = f ? 1 : 0;
    P.rect(4, 22, 4, 3, shade(bk, -20)); P.rect(16, 22, 4, 3, shade(bk, -20));
    P.rect(5, 9 + sq, 14, 15 - sq, bk);
    P.rect(5, 9 + sq, 2, 15 - sq, shade(bk, -20)); P.rect(17, 9 + sq, 2, 15 - sq, shade(bk, 15));
    P.ell(12, 9 + sq, 7, 2.5, '#e0b878'); P.ell(12, 9 + sq, 4, 1.3, '#c89858');
    P.rect(8, 14 + sq, 2, 3, '#1a1008'); P.rect(14, 14 + sq, 2, 3, '#1a1008');
    P.px(8, 14 + sq, o.eyeGlow || '#ffffff'); P.px(14, 14 + sq, o.eyeGlow || '#ffffff');
    P.rect(10, 19 + sq, 4, 1, '#3a2010');
    P.ell(6, 5 + sq, 2.5, 2, o.leaf || '#5fbf4a'); P.ell(17, 4 + sq, 3, 2.2, o.leaf || '#5fbf4a'); P.line(12, 8 + sq, 15, 4 + sq, shade(bk, -10));
  } },
  evileye: { w: 28, h: 22, draw(P, f) {
    const c = '#9a5ad8', st = f ? 1 : 0;
    P.line(22, 14, 26, 10 - st, c); P.line(23, 14, 27, 11 - st, c); P.ell(27, 9 - st, 1.5, 1.5, shade(c, -20)); // 꼬리
    P.rect(8, 18, 3, 3, shade(c, -25)); P.rect(16, 18, 3, 3, shade(c, -25));
    P.ell(13, 12, 10, 8, c);
    P.ell(10, 11, 6.5, 5.5 - st, '#ffffff');
    P.ell(9, 11, 3.2, 3.2 - st, '#e83a3a'); P.ell(9, 11, 1.5, 1.5, '#1a0a0a'); P.px(8, 9, '#ffffff');
    P.line(4, 6, 15, 5, shade(c, -35));
    P.ell(17, 6, 3, 1.2, shade(c, 35));
  } },
  mushmom: { w: 48, h: 46, draw(P, f) {
    const cc = '#ff8c2a', sq = f ? 1 : 0;
    P.ell(14, 42, 6, 3.5, '#8a5a30'); P.ell(34, 42, 6, 3.5, '#8a5a30');
    P.ell(24, 31 + sq, 13, 10 - sq, '#fbe6c8');
    P.rect(13, 23 + sq, 22, 3, shade('#fbe6c8', -12));
    P.rect(16, 28 + sq, 4, 6, '#20160f'); P.rect(28, 28 + sq, 4, 6, '#20160f');
    P.px(17, 29 + sq, '#ffffff'); P.px(29, 29 + sq, '#ffffff');
    P.line(14, 25 + sq, 21, 27 + sq, '#20160f'); P.line(34, 25 + sq, 27, 27 + sq, '#20160f');
    P.ell(24, 37 + sq, 4, 2, '#a04040'); P.rect(22, 36 + sq, 4, 1, '#ffffff');
    P.ell(24, 18 + sq, 23, 16 - sq, cc, y => y <= 24 + sq);
    P.rect(2, 22 + sq, 44, 3, shade(cc, -25));
    [[12, 12, 4, 3], [26, 8, 5, 3.5], [37, 15, 3, 2.5], [7, 20, 2.5, 2], [20, 18, 2.5, 2]].forEach(([x, y, a, b]) => P.ell(x, y + sq, a, b, '#ffffff'));
    P.ell(18, 6 + sq, 5, 2, shade(cc, 40));
    P.ell(30, 2 + sq, 6, 3, '#4fb04a'); P.line(27, 4 + sq, 33, 1 + sq, '#2f7a2a'); P.rect(25, 3 + sq, 2, 3, '#7a4a26');
  } },
  balrog: { w: 60, h: 54, draw(P, f) {
    const c = '#5a3a7a', dk = '#3a2052', fl = f ? 2 : 0;
    // 날개
    P.tri(30, 18, 58, 2 + fl, 54, 28, '#2a1840'); P.tri(30, 20, 58, 2 + fl, 46, 30, '#3a2052');
    P.line(30, 18, 58, 2 + fl, '#1a0e28'); P.line(46, 30, 58, 2 + fl, '#1a0e28');
    // 다리 · 몸
    P.rect(18, 42, 7, 9, dk); P.rect(32, 42, 7, 9, dk);
    P.tri(16, 51, 26, 51, 14, 54, '#d8d0c0'); P.tri(30, 51, 40, 51, 28, 54, '#d8d0c0');
    P.ell(28, 34, 15, 13, c);
    P.ell(26, 36, 9, 8, shade(c, 18));
    // 팔 · 발톱
    P.rect(8, 28, 6, 12, dk); P.tri(6, 40, 9, 46, 11, 40, '#e8e0d0'); P.tri(10, 40, 13, 46, 15, 40, '#e8e0d0');
    // 머리
    P.ell(22, 17, 11, 10, c);
    P.tri(14, 10, 4, 0, 18, 6, '#d8d0c0'); P.tri(28, 9, 38, -2, 30, 4, '#d8d0c0');   // 뿔
    P.tri(14, 10, 6, 3, 17, 7, '#b8b0a0');
    P.rect(14, 14, 5, 3, '#ff3030'); P.rect(24, 14, 5, 3, '#ff3030'); P.px(15, 14, '#ffd0a0'); P.px(25, 14, '#ffd0a0');
    P.line(12, 11, 19, 13, '#1a0e28'); P.line(31, 11, 24, 13, '#1a0e28');
    P.rect(15, 21, 12, 4, '#1a0a14');
    P.tri(16, 21, 18, 21, 17, 24, '#ffffff'); P.tri(24, 21, 26, 21, 25, 24, '#ffffff');
    P.line(44, 40, 52, 46, dk); P.tri(51, 44, 56, 48, 52, 49, '#ff3030');            // 꼬리
  } }
};

// 같은 그림을 색만 바꿔 여러 몬스터로 쓴다
const MONSTER_LOOKS = {
  snail: ['snail', { shell: '#5fbf4a' }],
  bluesnail: ['snail', { shell: '#4a8cff' }],
  redsnail: ['snail', { shell: '#ff5a4a' }],
  slime: ['slime', {}],
  orangemush: ['mushroom', { cap: '#ff8c2a', spots: '#ffffff' }],
  greenmush: ['mushroom', { cap: '#5ab84a', spots: '#e8ffd8' }],
  hornymush: ['mushroom', { cap: '#7a6ad8', spots: null, horns: true, angry: true }],
  zombiemush: ['mushroom', { cap: '#8a8098', spots: '#5a5068', stitch: true, eye: '#c02020', angry: true }],
  ribbonpig: ['pig', {}],
  stump: ['stump', {}],
  darkstump: ['stump', { bark: '#5a4a5a', leaf: '#8a6aa8', eyeGlow: '#ff4040' }],
  evileye: ['evileye', {}],
  mushmom: ['mushmom', {}],
  balrog: ['balrog', {}]
};

function monsterSprite(kind, frame = 0, flash = false) {
  return cached('m' + kind + frame + (flash ? 'f' : ''), () => {
    if (flash) return flashOf(monsterSprite(kind, frame));
    const [artName, opts] = MONSTER_LOOKS[kind];
    const art = MONSTER_ART[artName];
    const c = makeCanvas(art.w + 2, art.h + 2), P = painter(c);
    P.g.translate(1, 1);
    art.draw(P, frame, opts);
    return addOutline(c);
  });
}
function monsterSpriteRight(kind, frame = 0) {
  return cached('mr' + kind + frame, () => mirror(monsterSprite(kind, frame)));
}
