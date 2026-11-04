// Offline unit test for the parser with wikitext in Wikipedia's race-table format.
//   node tools/test-parser.js
const assert = require('assert');
const P = require('../app/src/main/assets/parser.js');

const senate = `
== Special elections during the preceding Congress ==
None.

== Elections leading to the next Congress ==
{| class="wikitable sortable"
! State !! Senator !! Party !! First elected !! Results !! Candidates
|-
! [[North Carolina]]
| {{Sortname|Thom|Tillis}}
| {{Party shading/Republican}} | Republican
| 2014
| Incumbent retired.<br/>New senator elected.<br/>'''Democratic gain'''.
| nowrap | {{Plainlist|
* {{Aye}} [[Roy Cooper]] ([[Democratic Party (United States)|Democratic]]) 51.8%
* [[Michael Whatley]] (Republican) 47.1%<ref>{{cite web|title=x}}</ref>
}}
|-
! [[West Virginia]]
| {{Sortname|Shelley Moore|Capito}}
| Republican
| 2014
| Incumbent running.
| nowrap | {{Plainlist|
* [[Shelley Moore Capito]] (Republican)
* Zachary Shrewsbury (Democratic)
}}
|-
! rowspan=1 | [[Minnesota]]
| Tina Smith
| DFL
| 2018
| Incumbent retired.
| {{Plainlist|
* {{aye}} [[Peggy Flanagan]] ([[Minnesota Democratic–Farmer–Labor Party|DFL]]) 53%
* [[Royce White (politician)|Royce White]] (Republican) 44%
}}
|}
`;
const s = P.parseStatewide(senate);
assert.strictEqual(Object.keys(s).length, 3);
assert.strictEqual(s.NC.winner.name, 'Roy Cooper');
assert.strictEqual(s.NC.winner.party, 'D');
assert.strictEqual(s.NC.winner.pct, 51.8);
assert.strictEqual(s.NC.candidates[1].party, 'R');
assert.strictEqual(s.WV.winner, null);           // not "Virginia"
assert.ok(!s.VA);
assert.strictEqual(s.MN.winner.party, 'D');
assert.strictEqual(s.MN.candidates[1].name, 'Royce White');

const house = `
== Special elections ==
{| class="wikitable"
|-
! {{ushr|Texas|18|X}}
| Vacant
| {{Plainlist|
* {{Aye}} [[Christian Menefee]] (Democratic) 68%
* Someone (Democratic) 32%
}}
|}
== Alabama ==
{| class="wikitable"
|-
! {{ushr|Alabama|1|X}}
| {{Sortname|Barry|Moore}}
| Republican
| Incumbent re-elected.
| {{Plainlist|
*{{Party stripe|Republican Party (US)}}{{Aye}} '''[[Barry Moore]]''' (Republican) 79.2%
* Tom Holmes (Democratic) 20.8%
}}
|-
! {{ushr|Alabama|2|X}}
| Shomari Figures
| Democratic
| Incumbent running.
| {{Plainlist|
* [[Shomari Figures]] (Democratic)
* Dick Brewbaker (Republican)
}}
|}
== Alaska ==
{| class="wikitable"
|-
!{{ushr|AK|AL|X}}
| Nick Begich
| Republican
| {{Plainlist|
* {{Aye}} [[Nick Begich III|Nick Begich]] (Republican) 50.5%
* Mary Peltola (Democratic) 48.1%
}}
|}
`;
const h = P.parseHouse(house);
assert.deepStrictEqual(Object.keys(h).sort(), ['AK-AL', 'AL-1', 'AL-2']); // special election section skipped
const t = P.tally(h);
assert.strictEqual(t.R, 2);
assert.strictEqual(t.D, 0);
assert.strictEqual(h['AK-AL'].winner.name, 'Nick Begich');
console.log('parser tests passed');
