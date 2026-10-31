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

  function fresh(list, past) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      if (!played(past, list[i])) out.push(list[i]);
    }
    return out;
  }

  function shuffle(list, random) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  /* 1か所だけ別の色に替える。すでに置いた並びには戻さない。 */
  function tweakOne(last, allowDup, past, random) {
    const positions = shuffle(last.map(function (_, i) { return i; }), random);
    for (let p = 0; p < positions.length; p++) {
      const i = positions[p];
      const colors = [];
      for (let c = 0; c < COLOR_COUNT; c++) {
        if (c === last[i]) continue;
        if (!allowDup && last.indexOf(c) !== -1) continue;
        colors.push(c);
      }
      shuffle(colors, random);
      for (let k = 0; k < colors.length; k++) {
        const code = last.slice();
        code[i] = colors[k];
        if (!played(past, code)) return code;
      }
    }
    for (let a = 0; a < positions.length; a++) {
      for (let b = a + 1; b < positions.length; b++) {
        const i = positions[a];
        const j = positions[b];
        if (last[i] === last[j]) continue;
        const code = last.slice();
        code[i] = last[j];
        code[j] = last[i];
        if (!played(past, code)) return code;
      }
    }
    return null;
  }

  /**
   * 次の一手を選ぶ。history は { guess, hit, blow } の配列。
   * strong は全ヒントで残った候補から、少ないときは絞る手、多いときは半々。
   * normal は前の置き方から色を一つ動かす。動かし方は、ヒントに合うものを混ぜる。
   * weak は前の置き方から色を一つ動かす。候補が2つになると、その中から置く。
   */
  function pickCpuGuess(possible, pins, allowDup, rng, strength, history) {
    const random = rng || Math.random;
    const level = strength || "strong";
    const past = history || [];
    const last = past.length ? past[past.length - 1].guess : null;
    if (!possible.length) return randomCode(pins, allowDup, random);
    if (level === "weak") {
      const open = fresh(possible, past);
      if (possible.length <= 2) return pickFrom(open.length ? open : possible, random);
      if (!last) return randomCode(pins, allowDup, random);
      const moved = tweakOne(last, allowDup, past, random);
      return moved || pickFrom(open.length ? open : possible, random);
    }
    if (level === "normal") {
      const open = fresh(possible, past);
      if (possible.length <= 3) return pickFrom(open.length ? open : possible, random);
      if (!last) return pickFrom(possible, random);
      if (random() < 0.62) {
        const moved = tweakOne(last, allowDup, past, random);
        if (moved) return moved;
      }
      return pickFrom(open.length ? open : possible, random);
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
