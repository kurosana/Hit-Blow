const assert = require("node:assert/strict");
const HB = require("../js/logic.js");

function eqScore(guess, answer, hit, blow) {
  const s = HB.score(guess, answer);
  assert.deepEqual(s, { hit, blow }, `${guess} vs ${answer} => ${JSON.stringify(s)}`);
}

eqScore([0, 1, 2, 3], [0, 1, 2, 3], 4, 0);
eqScore([0, 1, 2, 3], [3, 2, 1, 0], 0, 4);
eqScore([0, 1, 2, 3], [0, 1, 3, 2], 2, 2);
eqScore([0, 1, 2, 3], [0, 2, 1, 3], 2, 2);
eqScore([0, 0, 0, 0], [0, 1, 2, 3], 1, 0);
eqScore([0, 0, 0, 1], [0, 1, 2, 3], 1, 1);
eqScore([1, 1, 2, 3], [0, 1, 1, 1], 1, 1);
eqScore([0, 0, 1, 1], [0, 1, 0, 1], 2, 2);
eqScore([0, 1], [1, 0], 0, 2);
eqScore([0, 1, 2], [3, 4, 5], 0, 0);
eqScore([5, 5, 5, 5, 5, 5], [5, 4, 5, 4, 5, 0], 3, 0);

assert.equal(HB.comboCount(4, false), 360);
assert.equal(HB.comboCount(4, true), 1296);
assert.equal(HB.comboCount(2, false), 30);
assert.equal(HB.comboCount(6, false), 720);
assert.equal(HB.comboCount(6, true), 46656);
assert.equal(HB.allCodes(4, false).length, 360);
assert.equal(HB.allCodes(2, true).length, 36);
assert.equal(HB.allCodes(6, false).length, 720);

for (let pins = 2; pins <= 6; pins++) {
  assert.equal(HB.turnLimit(pins, "com", false) % 2, 1);
  assert.equal(HB.turnLimit(pins, "duo", true) % 2, 1);
  assert.equal(HB.turnLimit(pins, "com2", false) % 2, 1);
  assert.equal(HB.turnLimit(pins, "com2", false), HB.turnLimit(pins, "com", false));
  assert.ok(HB.turnLimit(pins, "solo", false) >= pins);
}

const secret = [0, 1, 2, 3];
let possible = HB.allCodes(4, false);
const guess = [0, 1, 3, 4];
const got = HB.score(guess, secret);
possible = HB.filterPossible(possible, guess, got.hit, got.blow);
assert.ok(possible.some((c) => HB.sameCode(c, secret)));
assert.ok(!possible.some((c) => HB.sameCode(c, guess)));

const zero = () => 0;
const smart = HB.pickCpuGuess(possible, 4, false, zero);
assert.equal(smart.length, 4);
assert.equal(new Set(smart).size, 4);
assert.ok(possible.some((c) => HB.sameCode(c, smart)));

const almost = () => 0.99;
const loose = HB.pickCpuGuess(possible, 4, false, almost);
assert.ok(possible.some((c) => HB.sameCode(c, loose)));

const only = HB.pickCpuGuess([[2, 0, 1, 3]], 4, false, zero);
assert.deepEqual(only, [2, 0, 1, 3]);

let overflow = 0;
for (let t = 0; t < 200; t++) {
  const a = HB.randomCode(5, true);
  const g = HB.randomCode(5, true);
  const s = HB.score(g, a);
  if (s.hit + s.blow > 5) overflow++;
  if (s.hit < 0 || s.blow < 0) overflow++;
}
assert.equal(overflow, 0);

const dupCode = HB.randomCode(6, false, zero);
assert.equal(new Set(dupCode).size, 6);

console.log("logic ok");
