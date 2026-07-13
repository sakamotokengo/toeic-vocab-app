"use strict";

// ===== 定数 =====
const ROUND_SIZE = 10;              // 1ラウンドの問題数
const INTERVALS = [3, 6, 12];       // 間違えた後に正解した単語を再出題する間隔（◯ラウンド後）
const STORAGE_KEY = "toeicVocabTrainer_v1";
const LEVELS = { 1: "基礎（〜600点）", 2: "中級（〜730点）", 3: "上級（860点〜）" };
const TOTAL_WORDS = WORDS.length;

const $app = document.getElementById("app");

// ===== データ保存 =====
function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && s.words) return s;
  } catch (e) { /* 読み込み失敗時は初期化 */ }
  return { round: 0, history: [], words: {}, levelFilter: 0 };
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) { /* file://等で保存不可でも動作は継続 */ }
}
// 単語ごとの学習状態
// c: 正解数 / w: 不正解数 / streak: 連続正解数 / seen: 出題回数
// retry: 次ラウンドで再出題 / due: 復習予定ラウンド / rIdx: 復習ステップ / last: 最後に出題されたラウンド
function stat(name) {
  if (!store.words[name]) {
    store.words[name] = { c: 0, w: 0, streak: 0, seen: 0, due: null, retry: false, rIdx: 0, last: 0 };
  }
  return store.words[name];
}

let store = loadStore();
let session = null;

// ===== ユーティリティ =====
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== 出題キューの構築 =====
// 優先順位: 1. 前回間違えた単語 → 2. 復習期限が来た単語 → 3. 未学習の単語 → 4. 学習済みで最も出題が古い単語
function buildQueue(num) {
  const filter = store.levelFilter;
  const inFilter = (w) => filter === 0 || w.lv === filter;
  const reviewSet = new Set();

  const retry = shuffle(WORDS.filter((w) => stat(w.w).retry));
  const due = shuffle(WORDS.filter((w) => {
    const s = stat(w.w);
    return !s.retry && s.due != null && s.due <= num;
  }));
  retry.forEach((w) => reviewSet.add(w.w));
  due.forEach((w) => reviewSet.add(w.w));

  const fresh = shuffle(WORDS.filter((w) => inFilter(w) && stat(w.w).seen === 0))
    .sort((a, b) => a.lv - b.lv); // 安定ソートなので同レベル内はランダム順のまま
  const rest = WORDS.filter((w) => {
    const s = stat(w.w);
    return inFilter(w) && s.seen > 0 && !s.retry && s.due == null;
  }).sort((a, b) => stat(a.w).last - stat(b.w).last);

  const picked = [];
  const used = new Set();
  for (const list of [retry, due, fresh, rest]) {
    for (const w of list) {
      if (picked.length >= ROUND_SIZE) break;
      if (!used.has(w.w)) { used.add(w.w); picked.push(w); }
    }
  }
  return { queue: shuffle(picked), reviewSet };
}

// 4択の選択肢を作成（同レベルの単語の意味を優先して誤答選択肢に）
function makeChoices(word) {
  const pool = shuffle(WORDS.filter((x) => x.w !== word.w && x.m !== word.m))
    .sort((a, b) => Math.abs(a.lv - word.lv) - Math.abs(b.lv - word.lv));
  const usedMeanings = new Set([word.m]);
  const distractors = [];
  for (const c of pool) {
    if (distractors.length >= 3) break;
    if (!usedMeanings.has(c.m)) { usedMeanings.add(c.m); distractors.push(c); }
  }
  return shuffle([word, ...distractors]);
}

// ===== 回答処理（成績更新とSRSスケジューリング） =====
function applyAnswer(q, ok) {
  const s = stat(q.w);
  s.seen++;
  s.last = session.num;
  if (ok) {
    s.c++;
    s.streak++;
    const inReviewCycle = s.retry || s.due != null || s.rIdx > 0;
    if (inReviewCycle) {
      s.retry = false;
      if (s.rIdx < INTERVALS.length) {
        s.due = session.num + INTERVALS[s.rIdx];
        s.rIdx++;
      } else {
        s.due = null; // 復習サイクル卒業
      }
    }
  } else {
    s.w++;
    s.streak = 0;
    s.retry = true;   // 次のラウンドに含める
    s.due = null;
    s.rIdx = 0;
  }
  save();
}

// ===== 語彙力の推定 =====
function vocabStats() {
  const bands = [1, 2, 3].map((lv) => {
    const ws = WORDS.filter((w) => w.lv === lv);
    const known = ws.filter((w) => {
      const s = store.words[w.w];
      return s && s.streak >= 1;
    }).length;
    return { lv, total: ws.length, known };
  });
  const knownAll = bands.reduce((a, b) => a + b.known, 0);
  const totalAnswered = Object.values(store.words).reduce((a, s) => a + s.c + s.w, 0);
  const totalCorrect = Object.values(store.words).reduce((a, s) => a + s.c, 0);

  let estimated = null;
  if (totalAnswered >= 20) {
    const r = bands.map((b) => b.known / b.total);
    estimated = Math.round((300 + 250 * r[0] + 200 * r[1] + 145 * r[2]) / 5) * 5;
  }
  return { bands, knownAll, totalAnswered, totalCorrect, estimated };
}

// ===== 描画部品 =====
function infoCard(word) {
  return `
    <div class="info-card">
      <div class="info-head">
        <span class="info-word">${word.w}</span>
        <span class="lv-badge lv${word.lv}">${LEVELS[word.lv]}</span>
      </div>
      <div class="info-meaning">${word.m}</div>
      <div class="info-ex">
        <div class="en">${word.ex}</div>
        <div class="ja">${word.exJa}</div>
      </div>
      <div class="info-tip">💡 ${word.tip}</div>
    </div>`;
}

function chartSVG() {
  const data = store.history.slice(-20);
  if (data.length === 0) {
    return '<p class="muted small">まだ記録がありません。最初の10問に挑戦しましょう！</p>';
  }
  const w = 560, h = 180, padL = 38, padR = 14, padT = 16, padB = 26;
  const n = data.length;
  const x = (i) => (n === 1 ? padL + (w - padL - padR) / 2 : padL + (i * (w - padL - padR)) / (n - 1));
  const y = (v) => padT + (1 - v / 100) * (h - padT - padB);
  const pts = data.map((r, i) => [x(i), y(Math.round((r.score / r.total) * 100))]);

  const grid = [0, 50, 100].map((v) =>
    `<line x1="${padL}" y1="${y(v)}" x2="${w - padR}" y2="${y(v)}" stroke="#e2e8f0" stroke-width="1"/>` +
    `<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="#94a3b8">${v}</text>`
  ).join("");

  const step = Math.max(1, Math.ceil(n / 6));
  const xLabels = data.map((r, i) =>
    (i % step === 0 || i === n - 1)
      ? `<text x="${x(i)}" y="${h - 8}" text-anchor="middle" font-size="11" fill="#94a3b8">R${r.n}</text>`
      : ""
  ).join("");

  const line = n > 1
    ? `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#4f46e5" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
    : "";
  const dots = pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#4f46e5"/>`).join("");

  return `<svg class="chart" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="正答率の推移">${grid}${xLabels}${line}${dots}</svg>`;
}

// ===== 画面: ホーム =====
function renderHome() {
  const v = vocabStats();
  const pct = Math.round((v.knownAll / TOTAL_WORDS) * 100);
  const accuracy = v.totalAnswered > 0 ? Math.round((v.totalCorrect / v.totalAnswered) * 100) : 0;
  const retryCount = WORDS.filter((w) => store.words[w.w] && store.words[w.w].retry).length;
  const dueCount = WORDS.filter((w) => {
    const s = store.words[w.w];
    return s && !s.retry && s.due != null && s.due <= store.round + 1;
  }).length;

  const bandsHtml = v.bands.map((b) => `
    <div class="band">
      <div class="band-label">${LEVELS[b.lv]}<span>${b.known} / ${b.total}語</span></div>
      <div class="bar"><div class="bar-fill lv${b.lv}" style="width:${(b.known / b.total) * 100}%"></div></div>
    </div>`).join("");

  const estHtml = v.estimated != null
    ? `<div class="est-level">約 ${v.estimated} 点レベル</div>`
    : `<div class="est-level" style="font-size:16px">測定中…（あと${Math.max(0, 20 - v.totalAnswered)}問回答で表示）</div>`;

  let noteHtml = "";
  if (retryCount > 0 || dueCount > 0) {
    const parts = [];
    if (retryCount > 0) parts.push(`前回間違えた単語 ${retryCount}語`);
    if (dueCount > 0) parts.push(`復習期限の単語 ${dueCount}語`);
    noteHtml = `<div class="start-note">🔁 ${parts.join("・")}が次のラウンドに含まれます</div>`;
  }

  const weak = WORDS
    .filter((w) => store.words[w.w] && store.words[w.w].w > 0)
    .sort((a, b) => store.words[b.w].w - store.words[a.w].w)
    .slice(0, 5);
  const weakHtml = weak.length === 0
    ? '<p class="muted small">間違えた単語はここに表示されます。</p>'
    : weak.map((w) => `
        <div class="weak-row">
          <span class="weak-word">${w.w}</span>
          <span class="weak-meaning">${w.m}</span>
          <span class="weak-count">✕ ${store.words[w.w].w}回</span>
        </div>`).join("");

  $app.innerHTML = `
    <header class="topbar"><h1>📘 TOEIC単語トレーナー</h1></header>
    <main class="container">
      <section class="card">
        <div class="field-row">
          <label for="levelFilter">出題レベル</label>
          <select id="levelFilter">
            <option value="0">すべて（${TOTAL_WORDS}語）</option>
            <option value="1">基礎（〜600点）</option>
            <option value="2">中級（〜730点）</option>
            <option value="3">上級（860点〜）</option>
          </select>
        </div>
        <button id="startBtn" class="btn-primary">10問クイズを始める ▶</button>
        ${noteHtml}
      </section>

      <section class="card hero">
        <div class="hero-top">
          <div class="ring" style="background:conic-gradient(#4f46e5 ${pct * 3.6}deg, #e2e8f0 0)">
            <div class="ring-inner">${pct}<span>%</span></div>
          </div>
          <div>
            <div class="hero-label">推定語彙力（目安）</div>
            ${estHtml}
            <div class="est-note">このアプリの単語セット${TOTAL_WORDS}語の習得状況に基づく推定です</div>
          </div>
        </div>
        <div>${bandsHtml}</div>
      </section>

      <section class="card">
        <h3>学習の記録</h3>
        <div class="stats-grid">
          <div class="stat-tile"><div class="stat-value">${store.round}</div><div class="stat-label">ラウンド数</div></div>
          <div class="stat-tile"><div class="stat-value">${v.totalAnswered}</div><div class="stat-label">総回答数</div></div>
          <div class="stat-tile"><div class="stat-value">${accuracy}<small>%</small></div><div class="stat-label">累計正答率</div></div>
          <div class="stat-tile"><div class="stat-value">${v.knownAll}<small> / ${TOTAL_WORDS}</small></div><div class="stat-label">正解できる単語</div></div>
        </div>
      </section>

      <section class="card">
        <h3>スコア推移（直近20ラウンド）</h3>
        ${chartSVG()}
      </section>

      <section class="card">
        <h3>苦手な単語 TOP5</h3>
        ${weakHtml}
      </section>

      <div class="footer-note">
        データはこのブラウザに保存されます ・
        <button class="reset-link" id="resetBtn">学習データをリセット</button>
      </div>
    </main>`;

  const sel = document.getElementById("levelFilter");
  sel.value = String(store.levelFilter);
  sel.addEventListener("change", () => {
    store.levelFilter = Number(sel.value);
    save();
  });
  document.getElementById("startBtn").addEventListener("click", startRound);
  document.getElementById("resetBtn").addEventListener("click", () => {
    if (confirm("これまでの学習データをすべて削除します。よろしいですか？")) {
      localStorage.removeItem(STORAGE_KEY);
      store = loadStore();
      renderHome();
    }
  });
}

// ===== 画面: クイズ =====
function startRound() {
  const num = store.round + 1;
  const { queue, reviewSet } = buildQueue(num);
  if (queue.length === 0) {
    alert("出題できる単語がありません。出題レベルを変更してください。");
    return;
  }
  session = { num, queue, reviewSet, idx: 0, correct: 0, results: [] };
  renderQuestion();
}

function renderQuestion() {
  const q = session.queue[session.idx];
  session.choices = makeChoices(q);
  session.answered = false;
  const isReview = session.reviewSet.has(q.w);
  const isLast = session.idx === session.queue.length - 1;

  const choicesHtml = session.choices.map((c, i) => `
    <button class="choice" data-i="${i}">
      <span class="letter">${"ABCD"[i]}</span>
      <span>${c.m}</span>
    </button>`).join("");

  $app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="quitBtn" title="ホームに戻る">✕</button>
      <div class="quiz-title">第${session.num}ラウンド</div>
      <div class="quiz-count">${session.idx + 1} / ${session.queue.length}</div>
    </header>
    <div class="progress"><div class="progress-fill" style="width:${(session.idx / session.queue.length) * 100}%"></div></div>
    <main class="container">
      <section class="card">
        <div class="q-meta">${isReview ? '<span class="badge review">🔁 復習</span>' : ""}</div>
        <div class="q-word">${q.w}</div>
        <p class="q-prompt">この単語の意味は？</p>
        <div class="choices" id="choices">${choicesHtml}</div>
        <div id="feedback"></div>
        <p class="info-hint" id="infoHint" hidden>💬 他の選択肢をクリックすると、その単語の解説も見られます</p>
        <div id="infoPanel"></div>
        <button id="nextBtn" class="btn-primary" hidden>${isLast ? "結果を見る" : "次の問題へ"}</button>
      </section>
    </main>`;

  document.getElementById("quitBtn").addEventListener("click", () => {
    if (confirm("ラウンドを中断してホームに戻りますか？（回答済みの結果は記録されます）")) {
      session = null;
      renderHome();
    }
  });
  document.querySelectorAll(".choice").forEach((btn) => {
    btn.addEventListener("click", () => onChoice(Number(btn.dataset.i)));
  });
  document.getElementById("nextBtn").addEventListener("click", () => {
    if (session.idx + 1 >= session.queue.length) {
      finishRound();
    } else {
      session.idx++;
      renderQuestion();
    }
  });
}

function onChoice(i) {
  const q = session.queue[session.idx];
  const choice = session.choices[i];
  const buttons = document.querySelectorAll(".choice");
  const infoPanel = document.getElementById("infoPanel");

  // 回答後: 選択肢クリックでその単語の解説を表示
  if (session.answered) {
    buttons.forEach((b) => b.classList.remove("viewing"));
    buttons[i].classList.add("viewing");
    infoPanel.innerHTML = infoCard(choice);
    return;
  }

  // 初回クリック = 回答
  session.answered = true;
  const ok = choice.w === q.w;
  applyAnswer(q, ok);
  session.results.push({ word: q, ok });
  if (ok) session.correct++;

  session.choices.forEach((c, j) => {
    if (c.w === q.w) buttons[j].classList.add("correct");
    else if (j === i) buttons[j].classList.add("wrong");
  });

  document.getElementById("feedback").innerHTML = ok
    ? '<div class="fb ok">⭕ 正解！</div>'
    : `<div class="fb ng">❌ 不正解… 正解は「${q.m}」</div>`;
  infoPanel.innerHTML = infoCard(q);
  document.getElementById("infoHint").hidden = false;
  document.getElementById("nextBtn").hidden = false;
}

// ===== 画面: 結果 =====
function finishRound() {
  store.round = session.num;
  store.history.push({
    n: session.num,
    score: session.correct,
    total: session.queue.length,
    date: new Date().toISOString().slice(0, 10),
  });
  save();
  renderResult();
}

function renderResult() {
  const total = session.queue.length;
  const pct = Math.round((session.correct / total) * 100);
  const wrong = session.results.filter((r) => !r.ok);

  let msg;
  if (pct === 100) msg = "素晴らしい！全問正解です 🎉";
  else if (pct >= 80) msg = "よくできました！この調子で続けましょう。";
  else if (pct >= 60) msg = "いい調子です。間違えた単語は次のラウンドで復習しましょう。";
  else msg = "繰り返しが定着への近道です。もう一度挑戦しましょう！";

  const wrongHtml = wrong.length === 0
    ? '<p class="muted small">間違えた単語はありませんでした 🎊</p>'
    : wrong.map((r) => infoCard(r.word)).join("") +
      '<p class="muted small" style="margin-top:12px">🔁 間違えた単語は次の10問に自動で再出題されます。正解できた後も 3・6・12ラウンド後に再度出題され、定着を確認します。</p>';

  $app.innerHTML = `
    <header class="topbar"><h1>📘 TOEIC単語トレーナー</h1></header>
    <main class="container">
      <section class="card center">
        <div class="result-head">第${session.num}ラウンド 結果</div>
        <div class="big-score">${session.correct} <span>/ ${total}</span></div>
        <div class="result-acc">正答率 ${pct}%</div>
        <p class="result-msg">${msg}</p>
      </section>
      <section class="card">
        <h3>間違えた単語（${wrong.length}語）</h3>
        ${wrongHtml}
      </section>
      <div class="actions">
        <button id="againBtn" class="btn-primary">次の10問へ ▶</button>
        <button id="homeBtn" class="btn-secondary">ホームに戻る</button>
      </div>
    </main>`;

  document.getElementById("againBtn").addEventListener("click", startRound);
  document.getElementById("homeBtn").addEventListener("click", () => {
    session = null;
    renderHome();
  });
}

// ===== 起動 =====
renderHome();
