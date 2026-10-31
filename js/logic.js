/* ヒット＆ブローの判定とCOMの手。DOMに依存しない。 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.HitBlow = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const COLOR_COUNT = 6;

  function score(guess, answer) {
    const n = guess.length;
    let hit = 0;
    const usedGuess = new Array(n).fill(false);
    const usedAnswer = new Array(n).fill(false);
    for (let i = 0; i < n; i++) {
      if (guess[i] === answer[i]) {
        hit++;
        usedGuess[i] = true;
        usedAnswer[i] = true;
      }
    }
    let blow = 0;
    for (let i = 0; i < n; i++) {
      if (usedGuess[i]) continue;
      for (let j = 0; j < n; j++) {
        if (usedAnswer[j]) continue;
        if (guess[i] === answer[j]) {
          blow++;
          usedAnswer[j] = true;
          break;
        }
      }
    }
    return { hit, blow };
  }

  function allCodes(pins, allowDup) {
    const out = [];
    const cur = [];
    function walk() {
      if (cur.length === pins) {
        out.push(cur.slice());
        return;
      }
      for (let c = 0; c < COLOR_COUNT; c++) {
        if (!allowDup && cur.indexOf(c) !== -1) continue;
        cur.push(c);
        walk();
        cur.pop();
      }
    }
    walk();
    return out;
  }

  function comboCount(pins, allowDup) {
    if (allowDup) return COLOR_COUNT ** pins;
    let n = 1;
    for (let i = 0; i < pins; i++) n *= COLOR_COUNT - i;
    return n;
  }

  function randomCode(pins, allowDup, rng) {
    const random = rng || Math.random;
    if (allowDup) {
      const code = [];
      for (let i = 0; i < pins; i++) code.push(Math.floor(random() * COLOR_COUNT));
      return code;
    }
    const bag = [0, 1, 2, 3, 4, 5];
    const code = [];
    for (let i = 0; i < pins; i++) {
      const j = Math.floor(random() * bag.length);
      code.push(bag.splice(j, 1)[0]);
    }
    return code;
  }

  function turnLimit(pins, mode, allowDup) {
    let n = pins * 2 + 2;
    if (allowDup) n += pins >= 5 ? 4 : 2;
    if (mode !== "solo") n += 1;
    if (mode !== "solo" && n % 2 === 0) n += 1;
    return n;
  }

  function sameCode(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function sample(arr, n, rng) {
    const copy = arr.slice();
    const take = Math.min(n, copy.length);
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(rng() * (copy.length - i));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy.slice(0, take);
  }

  function pickFrom(list, random) {
    return list[Math.floor(random() * list.length)].slice();
  }

  function played(history, guess) {
    for (let i = 0; i < history.length; i++) {
      if (sameCode(history[i].guess, guess)) return true;
    }
    return false;
  }

  /**
   * 次の一手を選ぶ。history は { guess, hit, blow } の配列。
   * strong は全ヒントで残った候補から、少ないときは絞る手、多いときは半々。
   * normal は候補から置く。ときどき直前と同じ置き方を繰り返す。
   * weak はばらばらに置き、直前と同じ置き方を繰り返しやすい。候補が2つになると当てにいく。
   */
  function pickCpuGuess(possible, pins, allowDup, rng, strength, history) {
    const random = rng || Math.random;
    const level = strength || "strong";
    const past = history || [];
    if (!possible.length) return randomCode(pins, allowDup, random);
    if (level === "weak") {
      if (possible.length <= 2) return pickFrom(possible, random);
      if (past.length && random() < 0.5) return past[past.length - 1].guess.slice();
      return randomCode(pins, allowDup, random);
    }
    if (level === "normal") {
      if (possible.length <= 3) return pickFrom(possible, random);
      if (past.length && random() < 0.22) return past[past.length - 1].guess.slice();
      return pickFrom(possible, random);
    }
    if (possible.length === 1) return possible[0].slice();
    const smartChance = possible.length <= 8 ? 1 : 0.52;
    if (random() > smartChance) {
      return possible[Math.floor(random() * possible.length)].slice();
    }
    const candN = Math.min(possible.length, possible.length > 1500 ? 22 : 36);
    const evalN = Math.min(possible.length, possible.length > 1500 ? 64 : possible.length);
    const cands = sample(possible, candN, random);
    const evals = evalN === possible.length ? possible : sample(possible, evalN, random);
    let best = Infinity;
    let ties = [];
    for (let c = 0; c < cands.length; c++) {
      const cand = cands[c];
      const buckets = new Map();
      for (let e = 0; e < evals.length; e++) {
        const s = score(cand, evals[e]);
        const key = s.hit * 10 + s.blow;
        buckets.set(key, (buckets.get(key) || 0) + 1);
      }
      let worst = 0;
      buckets.forEach(function (v) {
        if (v > worst) worst = v;
      });
      if (worst < best) {
        best = worst;
        ties = [cand];
      } else if (worst === best) {
        ties.push(cand);
      }
    }
    const pick = ties[Math.floor(random() * ties.length)] || possible[0];
    return pick.slice();
  }

  function filterPossible(possible, guess, hit, blow) {
    return possible.filter(function (code) {
      const s = score(guess, code);
      return s.hit === hit && s.blow === blow;
    });
  }

  return {
    COLOR_COUNT: COLOR_COUNT,
    score: score,
    allCodes: allCodes,
    comboCount: comboCount,
    randomCode: randomCode,
    turnLimit: turnLimit,
    sameCode: sameCode,
    pickCpuGuess: pickCpuGuess,
    filterPossible: filterPossible,
  };
});
