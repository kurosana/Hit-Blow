(function () {
  "use strict";

  var HB = window.HitBlow;
  var COLORS = [
    { name: "あか", hex: "#e43636", dark: "#8e1c1c", light: false, mark: "●" },
    { name: "きいろ", hex: "#f5c400", dark: "#b08a00", light: true, mark: "▲" },
    { name: "みどり", hex: "#2fa84a", dark: "#146b28", light: false, mark: "■" },
    { name: "あお", hex: "#2f6fe0", dark: "#1a3f86", light: false, mark: "◆" },
    { name: "ピンク", hex: "#ee6aa7", dark: "#a83a68", light: false, mark: "★" },
    { name: "しろ", hex: "#f7f4ee", dark: "#c9c2b4", light: true, mark: "○" },
  ];

  var settings = { pins: 4, allowDup: false, mode: "solo", muted: false };
  var state = null;
  var epoch = 0;
  var justCommitted = false;
  var toastTimer = 0;
  var audioCtx = null;
  var pointer = null;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }

  function loadSettings() {
    try {
      var raw = localStorage.getItem("hitblow.v1");
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved.pins >= 2 && saved.pins <= 6) settings.pins = saved.pins;
      if (typeof saved.allowDup === "boolean") settings.allowDup = saved.allowDup;
      if (saved.mode === "solo" || saved.mode === "com" || saved.mode === "duo") settings.mode = saved.mode;
      if (typeof saved.muted === "boolean") settings.muted = saved.muted;
    } catch (err) { /* 壊れた保存は無視する */ }
  }

  function saveSettings() {
    try {
      localStorage.setItem("hitblow.v1", JSON.stringify(settings));
    } catch (err) { /* プライベートモードなど */ }
  }

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("active", el.id === "screen-" + name);
    });
  }

  function emptyDraft() {
    var d = [];
    for (var i = 0; i < settings.pins; i++) d.push(null);
    return d;
  }

  function pegHTML(color, size) {
    var c = COLORS[color];
    var style = "--peg:" + c.hex + ";--peg-dark:" + c.dark;
    if (size) style += ";--size:" + size + "px;--peg-size:" + size + "px";
    return '<span class="peg' + (c.light ? " light" : "") + '" style="' + style + '"><span class="mark">' + c.mark + "</span></span>";
  }

  function updateSetup() {
    document.querySelectorAll(".pin-btn").forEach(function (btn) {
      var on = Number(btn.dataset.pins) === settings.pins;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    document.querySelectorAll(".dup-btn").forEach(function (btn) {
      var on = (btn.dataset.dup === "1") === settings.allowDup;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      var on = btn.dataset.mode === settings.mode;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    var count = HB.comboCount(settings.pins, settings.allowDup);
    var limit = HB.turnLimit(settings.pins, settings.mode, settings.allowDup);
    $("stats-rule").textContent = "6色から " + settings.pins + " 本 · " + (settings.allowDup ? "同じ色が重なってもよい" : "同じ色は使わない");
    $("stats-count").textContent = count.toLocaleString("ja-JP") + "通り";
    $("stats-tries").textContent = settings.mode === "solo"
      ? "挑戦は " + limit + " 回まで"
      : "ふたり合わせて " + limit + " 回（先手が1回多い）";
    var note = $("stats-note");
    if (settings.pins === 6 && !settings.allowDup) {
      note.hidden = false;
      note.textContent = "6本で同色なしなら、6色すべての並びだけが答えです。";
    } else if (settings.allowDup && settings.pins >= 5) {
      note.hidden = false;
      note.textContent = "同色ありで本数が多いと、通り数が大きくなります。";
    } else {
      note.hidden = true;
      note.textContent = "";
    }
    var preview = $("preview");
    preview.innerHTML = "";
    for (var i = 0; i < settings.pins; i++) {
      var hole = document.createElement("span");
      hole.className = "preview-hole";
      preview.appendChild(hole);
    }
    $("btn-mute").setAttribute("aria-pressed", settings.muted ? "true" : "false");
    $("btn-mute").setAttribute("aria-label", settings.muted ? "おとをだす" : "おとをけす");
  }

  function toast(message) {
    var el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1600);
  }

  function unlockAudio() {
    if (settings.muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (err) { /* 音が出せない環境 */ }
  }

  function tone(freq, dur, type, gain, delay) {
    if (settings.muted) return;
    if (!audioCtx) return;
    var t = audioCtx.currentTime + (delay || 0);
    var osc = audioCtx.createOscillator();
    var amp = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain || 0.04, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    amp.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function soundPlace() { tone(520, 0.06, "triangle", 0.03); }

  function soundLose() {
    tone(392, 0.14, "sine", 0.04, 0);
    tone(311, 0.18, "sine", 0.04, 0.12);
    tone(247, 0.24, "sine", 0.04, 0.26);
  }

  function burst() {
    if (reducedMotion) return;
    var box = $("confetti");
    box.innerHTML = "";
    var colors = ["#e43636", "#f5c400", "#2fa84a", "#2f6fe0", "#ee6aa7", "#f7f4ee"];
    for (var i = 0; i < 32; i++) {
      var bit = document.createElement("i");
      bit.className = "confetti";
      bit.style.left = Math.random() * 100 + "%";
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = Math.random() * 0.15 + "s";
      bit.style.animationDuration = 0.9 + Math.random() * 0.6 + "s";
      box.appendChild(bit);
    }
    setTimeout(function () { box.innerHTML = ""; }, 1800);
  }

  function actorNow() {
    if (settings.mode === "solo" || settings.mode === "com") return "you";
    return state.rows.length % 2 === 0 ? "p1" : "p2";
  }

  function turnText() {
    if (!state || state.over) return "おわり";
    if (state.phase === "cpu") return "COMが置いています…";
    if (settings.mode === "solo") return "ピンを置いてください";
    if (settings.mode === "com") return "あなたのばん";
    return state.rows.length % 2 === 0 ? "1Pのばん" : "2Pのばん";
  }

  function whoName(by) {
    if (by === "you") return "あなた";
    if (by === "com") return "COM";
    if (by === "p1") return "1P";
    return "2P";
  }

  function buildPalette() {
    var box = $("palette");
    box.innerHTML = "";
    COLORS.forEach(function (c, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pal";
      btn.dataset.color = String(i);
      btn.setAttribute("aria-label", c.name);
      btn.innerHTML = pegHTML(i, 36) + '<span class="pal-name">' + c.name + "</span>";
      box.appendChild(btn);
    });
  }

  function renderPaletteState() {
    var used = {};
    state.draft.forEach(function (c) { if (c != null) used[c] = true; });
    document.querySelectorAll(".pal").forEach(function (btn) {
      var color = Number(btn.dataset.color);
      btn.classList.toggle("is-selected", color === state.selected);
      btn.classList.toggle("is-used", !settings.allowDup && !!used[color]);
    });
    $("tray").classList.toggle("is-locked", state.phase !== "input" || state.over);
  }

  function miniHole(kind) {
    if (kind === "hit") return '<i class="mini mini-hit"></i>';
    if (kind === "blow") return '<i class="mini mini-blow"></i>';
    return '<i class="mini mini-hole"></i>';
  }

  function feedbackHTML(hit, blow, pins) {
    var html = "";
    for (var i = 0; i < pins; i++) {
      if (i < hit) html += miniHole("hit");
      else if (i < hit + blow) html += miniHole("blow");
      else html += miniHole("hole");
    }
    return '<div class="minis">' + html + "</div>";
  }

  function renderSecret() {
    var box = $("secret-pegs");
    box.style.setProperty("--pins", String(settings.pins));
    var html = "";
    for (var i = 0; i < settings.pins; i++) {
      if (state.revealed) html += '<span class="filled">' + pegHTML(state.secret[i]) + "</span>";
      else html += '<span class="filled"></span>';
    }
    box.innerHTML = html;
    $("secret").classList.toggle("is-open", !!state.revealed);
  }

  function renderRows(scroll) {
    var host = $("rows");
    var html = "";
    if (!state.rows.length) {
      html += '<p class="empty-hint">6色から選んで<br>かくされた並びを置いてください</p>';
    }
    state.rows.forEach(function (row, index) {
      var label = settings.mode === "solo" ? "" : whoName(row.by) + " · ";
      var fresh = justCommitted && index === state.rows.length - 1 ? " is-new" : "";
      var win = row.hit === settings.pins ? " is-win" : "";
      html += '<div class="row' + fresh + win + '" data-by="' + row.by + '">';
      html += '<span class="row-num">' + (index + 1) + "</span>";
      html += '<div class="row-pegs">';
      row.guess.forEach(function (color) {
        html += '<span class="filled">' + pegHTML(color) + "</span>";
      });
      html += "</div>";
      html += '<div class="minis-wrap">' + feedbackHTML(row.hit, row.blow, settings.pins) + "</div>";
      html += '<span class="fb-text">' + label + row.hit + "ヒット " + row.blow + "ブロー</span></div>";
    });

    var by = state.over ? "" : actorNow();
    html += '<div class="row draft"' + (by ? ' data-by="' + by + '"' : "") + ">";
    html += '<span class="row-num">' + (state.rows.length + 1) + "</span>";
    html += '<div class="row-pegs">';
    state.draft.forEach(function (color, i) {
      var inner = color == null ? "" : pegHTML(color);
      var label = (i + 1) + "番目の穴" + (color == null ? "" : "、" + COLORS[color].name);
      html += '<button type="button" class="hole" data-hole="' + i + '" aria-label="' + label + '">' + inner + "</button>";
    });
    html += "</div>";
    html += '<div class="minis-wrap" aria-hidden="true">' + feedbackHTML(0, 0, 0) + "</div>";
    html += '<span class="fb-text">いまの一手</span></div>';
    host.innerHTML = html;
    justCommitted = false;
    if (scroll) {
      var scroller = $("board-scroll");
      scroller.scrollTop = scroller.scrollHeight;
    }
  }

  function render(scroll) {
    var dup = settings.allowDup ? "同色あり" : "同色なし";
    $("game-sub").textContent = settings.pins + "ピン · " + dup + " · " + state.rows.length + "/" + state.maxTurns;
    $("turn-label").textContent = turnText();
    $("board").dataset.pins = String(settings.pins);
    $("board").style.setProperty("--pins", String(settings.pins));
    var full = state.draft.every(function (c) { return c != null; });
    var playing = state.phase === "input" && !state.over;
    $("btn-ok").disabled = !playing || !full;
    $("btn-undo").disabled = !playing;
    $("actions-play").hidden = !!state.over;
    $("actions-end").hidden = !state.over;
    renderSecret();
    renderRows(scroll);
    renderPaletteState();
  }

  function announce(text) {
    $("live").textContent = text;
  }

  function resultCopy() {
    var n = state.rows.length;
    if (state.winner === "you" && settings.mode === "solo") {
      return { title: "せいかい！", sub: n + "回目で当たりました" };
    }
    if (state.winner === "you") return { title: "あなたの勝ち！", sub: n + "回目で当てました" };
    if (state.winner === "com") return { title: "COMの勝ち", sub: "COMが" + n + "回目で当てました" };
    if (state.winner === "p1") return { title: "1Pの勝ち！", sub: n + "回目で当てました" };
    if (state.winner === "p2") return { title: "2Pの勝ち！", sub: n + "回目で当てました" };
    if (settings.mode === "solo") return { title: "ざんねん…", sub: "回数のなかでは当たりませんでした" };
    return { title: "ひきわけ", sub: "回数のなかでは、どちらも当たりませんでした" };
  }

  function fillResult() {
    var copy = resultCopy();
    $("result-title").textContent = copy.title;
    $("result-sub").textContent = copy.sub;
    $("result-pegs").innerHTML = state.secret.map(function (c) { return pegHTML(c, 42); }).join("");
  }

  function happyWinner(winner) {
    if (!winner) return false;
    if (winner === "com") return false;
    return true;
  }

  function finish(winner) {
    state.over = true;
    state.phase = "input";
    state.revealed = true;
    state.winner = winner;
    epoch += 1;
    fillResult();
    render(true);
    if (happyWinner(winner)) {
      tone(523, 0.12, "triangle", 0.05, 0);
      tone(659, 0.12, "triangle", 0.05, 0.1);
      tone(784, 0.18, "triangle", 0.05, 0.2);
      tone(1046, 0.28, "triangle", 0.05, 0.32);
      burst();
    } else if (winner === "com") {
      tone(494, 0.12, "sine", 0.04, 0);
      tone(370, 0.2, "sine", 0.04, 0.12);
    } else {
      soundLose();
    }
    var dialog = $("result-dialog");
    if (!dialog.open) dialog.showModal();
    announce(resultCopy().title + "。" + resultCopy().sub);
  }

  function commit(guess, by) {
    var result = HB.score(guess, state.secret);
    state.rows.push({ guess: guess.slice(), hit: result.hit, blow: result.blow, by: by });
    state.possible = HB.filterPossible(state.possible, guess, result.hit, result.blow);
    state.draft = emptyDraft();
    justCommitted = true;
    announce(state.rows.length + "手目、" + result.hit + "ヒット " + result.blow + "ブロー");
    if (result.hit !== settings.pins) tone(340, 0.08, "sine", 0.03);
    if (result.hit === settings.pins) {
      finish(by);
      return;
    }
    if (state.rows.length >= state.maxTurns) {
      finish(null);
      return;
    }
    if (settings.mode === "com" && by === "you") {
      state.phase = "cpu";
      render(true);
      runCpu();
      return;
    }
    state.phase = "input";
    render(true);
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function runCpu() {
    var token = epoch;
    state.draft = emptyDraft();
    render(true);
    await sleep(reducedMotion ? 20 : 280);
    if (token !== epoch) return;
    var guess = HB.pickCpuGuess(state.possible, settings.pins, settings.allowDup);
    for (var i = 0; i < guess.length; i++) {
      await sleep(reducedMotion ? 10 : 120);
      if (token !== epoch) return;
      state.draft[i] = guess[i];
      soundPlace();
      render(false);
    }
    await sleep(reducedMotion ? 20 : 220);
    if (token !== epoch) return;
    commit(guess, "com");
  }

  function startGame() {
    epoch += 1;
    saveSettings();
    var secret = HB.randomCode(settings.pins, settings.allowDup);
    state = {
      secret: secret,
      possible: HB.allCodes(settings.pins, settings.allowDup),
      rows: [],
      draft: emptyDraft(),
      selected: 0,
      phase: "input",
      over: false,
      revealed: false,
      winner: null,
      maxTurns: HB.turnLimit(settings.pins, settings.mode, settings.allowDup),
    };
    buildPalette();
    $("confetti").innerHTML = "";
    var result = $("result-dialog");
    if (result.open) result.close();
    showScreen("game");
    render(true);
  }

  function draftFull() {
    return state.draft.every(function (c) { return c != null; });
  }

  function placeAt(index, color, fromIndex) {
    if (fromIndex >= 0 && fromIndex !== index) state.draft[fromIndex] = null;
    if (!settings.allowDup) {
      for (var i = 0; i < state.draft.length; i++) {
        if (i !== index && state.draft[i] === color) state.draft[i] = null;
      }
    }
    state.draft[index] = color;
    state.selected = color;
  }

  function onPalette(color) {
    state.selected = color;
    if (!settings.allowDup) {
      var idx = state.draft.indexOf(color);
      if (idx !== -1) {
        state.draft[idx] = null;
        soundPlace();
        render(false);
        return;
      }
    }
    var empty = state.draft.indexOf(null);
    if (empty !== -1) {
      state.draft[empty] = color;
      soundPlace();
    }
    render(false);
  }

  function onHole(index) {
    if (state.draft[index] != null) {
      state.draft[index] = null;
      soundPlace();
      render(false);
      return;
    }
    placeAt(index, state.selected, -1);
    soundPlace();
    render(false);
  }

  function undoOne() {
    if (!state || state.phase !== "input" || state.over) return;
    for (var i = state.draft.length - 1; i >= 0; i--) {
      if (state.draft[i] != null) {
        state.draft[i] = null;
        soundPlace();
        render(false);
        return;
      }
    }
  }

  function confirmDraft() {
    if (!state || state.phase !== "input" || state.over) return;
    if (!draftFull()) {
      toast("すべての穴に置いてください");
      return;
    }
    var guess = state.draft.slice();
    if (!settings.allowDup && new Set(guess).size !== guess.length) {
      toast("同じ色は使えません");
      return;
    }
    if (state.rows.some(function (row) { return HB.sameCode(row.guess, guess); })) {
      toast("さっきと同じ置き方です");
      return;
    }
    commit(guess, actorNow());
  }

  function canPlay() {
    return state && state.phase === "input" && !state.over && $("screen-game").classList.contains("active");
  }

  function clearLift() {
    document.querySelectorAll(".is-lifted, .is-over").forEach(function (el) {
      el.classList.remove("is-lifted", "is-over");
    });
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    var pal = event.target.closest("[data-color]");
    var hole = event.target.closest("[data-hole]");
    if (!pal && !hole) return;
    if (!canPlay()) return;
    unlockAudio();
    if (hole && state.draft[Number(hole.dataset.hole)] == null) {
      pointer = {
        kind: "empty",
        index: Number(hole.dataset.hole),
        x: event.clientX,
        y: event.clientY,
        moved: false,
        id: event.pointerId,
      };
      return;
    }
    var color = pal ? Number(pal.dataset.color) : state.draft[Number(hole.dataset.hole)];
    pointer = {
      kind: pal ? "palette" : "hole",
      color: color,
      index: hole ? Number(hole.dataset.hole) : -1,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      id: event.pointerId,
    };
    if (hole) hole.classList.add("is-lifted");
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveGhost(x, y, color) {
    var ghost = $("ghost");
    var c = COLORS[color];
    ghost.hidden = false;
    ghost.style.setProperty("--peg", c.hex);
    ghost.style.setProperty("--peg-dark", c.dark);
    ghost.classList.toggle("light", c.light);
    ghost.style.transform = "translate(" + x + "px," + y + "px) translate(-50%, -70%)";
  }

  function onPointerMove(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) {
      pointer.moved = true;
    }
    if (!pointer.moved || pointer.kind === "empty") return;
    moveGhost(event.clientX, event.clientY, pointer.color);
    document.querySelectorAll(".hole.is-over").forEach(function (el) { el.classList.remove("is-over"); });
    var under = document.elementFromPoint(event.clientX, event.clientY);
    var hole = under && under.closest("[data-hole]");
    if (hole) hole.classList.add("is-over");
  }

  function onPointerUp(event) {
    if (!pointer || event.pointerId !== pointer.id) return;
    var p = pointer;
    pointer = null;
    $("ghost").hidden = true;
    if (!canPlay()) {
      clearLift();
      return;
    }
    if (!p.moved || p.kind === "empty") {
      clearLift();
      if (p.kind === "palette") onPalette(p.color);
      else onHole(p.index);
      return;
    }
    var under = document.elementFromPoint(event.clientX, event.clientY);
    var hole = under && under.closest("[data-hole]");
    clearLift();
    if (hole) {
      var index = Number(hole.dataset.hole);
      if (p.kind === "hole" && index === p.index) {
        render(false);
        return;
      }
      placeAt(index, p.color, p.kind === "hole" ? p.index : -1);
      soundPlace();
      render(false);
      return;
    }
    if (p.kind === "hole") {
      state.draft[p.index] = null;
      soundPlace();
      render(false);
    }
  }

  function goSetup() {
    epoch += 1;
    ["result-dialog", "leave-dialog", "help-dialog"].forEach(function (id) {
      var dialog = $(id);
      if (dialog.open) dialog.close();
    });
    showScreen("setup");
    updateSetup();
  }

  function askLeave() {
    if (state && state.rows.length && !state.over) {
      $("leave-dialog").showModal();
      return;
    }
    goSetup();
  }

  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    if (!$("screen-game").classList.contains("active")) return;
    var key = event.key;
    if (key >= "1" && key <= "6") {
      event.preventDefault();
      if (!canPlay()) return;
      onPalette(Number(key) - 1);
      return;
    }
    if (key === "Backspace") {
      event.preventDefault();
      undoOne();
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      confirmDraft();
    }
  }

  function init() {
    loadSettings();
    updateSetup();

    $("btn-to-setup").addEventListener("click", function () {
      unlockAudio();
      showScreen("setup");
      updateSetup();
    });
    $("btn-back-title").addEventListener("click", function () { showScreen("title"); });
    $("btn-start").addEventListener("click", function () {
      unlockAudio();
      startGame();
    });
    document.querySelectorAll(".pin-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        settings.pins = Number(btn.dataset.pins);
        saveSettings();
        updateSetup();
      });
    });
    document.querySelectorAll(".dup-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        settings.allowDup = btn.dataset.dup === "1";
        saveSettings();
        updateSetup();
      });
    });
    document.querySelectorAll(".mode-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        settings.mode = btn.dataset.mode;
        saveSettings();
        updateSetup();
      });
    });

    $("btn-back-game").addEventListener("click", askLeave);
    $("btn-leave-cancel").addEventListener("click", function () { $("leave-dialog").close(); });
    $("btn-leave-ok").addEventListener("click", goSetup);
    $("btn-undo").addEventListener("click", undoOne);
    $("btn-ok").addEventListener("click", function () {
      unlockAudio();
      confirmDraft();
    });
    $("btn-retry").addEventListener("click", startGame);
    $("btn-setup").addEventListener("click", goSetup);
    $("btn-result-retry").addEventListener("click", startGame);
    $("btn-result-setup").addEventListener("click", goSetup);
    $("btn-help").addEventListener("click", function () { $("help-dialog").showModal(); });
    $("btn-help-close").addEventListener("click", function () { $("help-dialog").close(); });
    $("btn-mute").addEventListener("click", function () {
      settings.muted = !settings.muted;
      saveSettings();
      updateSetup();
      if (!settings.muted) unlockAudio();
    });

    $("palette").addEventListener("pointerdown", onPointerDown);
    $("rows").addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", unlockAudio);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
