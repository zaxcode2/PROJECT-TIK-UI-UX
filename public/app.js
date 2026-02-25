const STARTING_BALANCE = 1000;
const SYMBOLS = ["7", "A", "K", "Q", "J", "*", "#"];
const PLINKO_MULTIPLIERS = [2.2, 1.6, 1.2, 1, 0.8, 0.6, 0.4, 0.6, 0.8, 1, 1.2, 1.6, 2.2];
const STORAGE_KEY = "arcade_lab_state_v1";
const MAX_PLINKO_BALLS = 30;
const MAX_HISTORY_STORED = 60;
const MAX_HISTORY_RENDERED = 6;
const MINE_TILE_COUNT = 12;
const MINE_COUNT = 3;
const MINE_MULTIPLIERS = [1.2, 1.45, 1.8, 2.2, 2.7, 3.3, 4.1, 5.2, 6.5];
const CHICKEN_MULTIPLIERS = [1.15, 1.35, 1.7, 2.1, 2.7, 3.5];
const SLOT_ANIM_STEPS = 10;
const SLOT_ANIM_MS = 65;
const DICE_ANIM_MS = 920;
const WHEEL_SPIN_MS = 2800;
const WHEEL_SEGMENTS = [
  ...Array.from({ length: 9 }, (_, i) => ({ key: i % 2 === 0 ? "red" : "black", label: "1.9x" })),
  ...Array.from({ length: 9 }, (_, i) => ({ key: i % 2 === 0 ? "black" : "red", label: "1.9x" })),
  { key: "green", label: "12x" }
];

const page = document.body.dataset.page || "dashboard";

const balanceEl = document.getElementById("balance");
const betInput = document.getElementById("betAmount");
const slotReel = document.getElementById("slotReel");
const diceBox = document.getElementById("diceBox");
const dice3d = document.getElementById("dice3d");
const diceResultText = document.getElementById("diceResultText");
const minesBoard = document.getElementById("minesBoard");
const minesStatus = document.getElementById("minesStatus");
const wheelResult = document.getElementById("wheelResult");
const wheelCanvas = document.getElementById("wheelCanvas");
const wtx = wheelCanvas ? wheelCanvas.getContext("2d") : null;
const chickenTrack = document.getElementById("chickenTrack");
const chickenStatus = document.getElementById("chickenStatus");
const historyList = document.getElementById("historyList");
const userBadge = document.getElementById("userBadge");
const appLoader = document.getElementById("appLoader");

const roundsCount = document.getElementById("roundsCount");
const winsCount = document.getElementById("winsCount");
const winRate = document.getElementById("winRate");

const spinBtn = document.getElementById("spinBtn");
const rollBtn = document.getElementById("rollBtn");
const dropBtn = document.getElementById("dropBtn");
const minesStartBtn = document.getElementById("minesStartBtn");
const minesCashoutBtn = document.getElementById("minesCashoutBtn");
const wheelSpinBtn = document.getElementById("wheelSpinBtn");
const wheelPickBtns = [...document.querySelectorAll(".wheel-pick")];
const chickenStartBtn = document.getElementById("chickenStartBtn");
const chickenCrossBtn = document.getElementById("chickenCrossBtn");
const chickenCashoutBtn = document.getElementById("chickenCashoutBtn");
const resetBtn = document.getElementById("resetBtn");
const topupBtn = document.getElementById("topupBtn");
const clearLogBtn = document.getElementById("clearLogBtn");

const plinkoCanvas = document.getElementById("plinkoCanvas");
const plinkoMultipliers = document.getElementById("plinkoMultipliers");
const ptx = plinkoCanvas ? plinkoCanvas.getContext("2d") : null;

let state = loadState();
let uiRefreshQueued = false;
let stateSaveQueued = false;

let plinkoBalls = [];
let lastBin = -1;
let wheelPick = "red";
let slotRolling = false;
let diceRolling = false;
let wheelSpinning = false;
let wheelAngle = -Math.PI / 2;
let minesLastReveal = -1;
let chickenStepLane = -1;
let minesGame = {
  active: false,
  bet: 0,
  safeHits: 0,
  mines: new Set(),
  opened: new Set()
};
let chickenGame = {
  active: false,
  bet: 0,
  lane: 0
};

const pegs = [];
const pegRows = 9;
const pegRadius = 4.5;
const ballRadius = 7;

function isProtectedPage() {
  return false;
}

function setLoader(show) {
  if (!appLoader) return;
  appLoader.classList.toggle("show", show);
}

async function authBootstrap() {
  if (userBadge) {
    userBadge.textContent = "Guest";
    userBadge.title = "Guest";
  }

  setLoader(false);
  return true;
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.balance === "number" && Array.isArray(parsed.history)) {
        return {
          balance: Math.max(0, Math.round(parsed.balance)),
          bet: Math.max(10, Number(parsed.bet) || 50),
          history: parsed.history.slice(0, MAX_HISTORY_STORED)
        };
      }
    } catch {
      // Ignore invalid local storage and fall back to defaults.
    }
  }

  return {
    balance: STARTING_BALANCE,
    bet: 50,
    history: []
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function scheduleSaveState() {
  if (stateSaveQueued) return;
  stateSaveQueued = true;

  requestAnimationFrame(() => {
    stateSaveQueued = false;
    saveState();
  });
}

function fmt(n) {
  return new Intl.NumberFormat().format(n);
}

function fmtNet(n) {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}${fmt(Math.abs(n))}`;
}

function syncBalance() {
  if (balanceEl) balanceEl.textContent = fmt(state.balance);
}

function syncBetInput() {
  if (betInput) betInput.value = String(state.bet);
}

function parseValidBet() {
  if (!betInput) return null;

  const bet = Number(betInput.value);
  if (!Number.isFinite(bet) || bet < 10 || bet % 10 !== 0) {
    addLog("System", "Use a bet in steps of 10 (minimum 10).", "loss");
    return null;
  }
  if (bet > state.balance) {
    addLog("System", "Not enough credits for this bet.", "loss");
    return null;
  }

  state.bet = bet;
  saveState();
  return bet;
}

function addLog(game, text, result) {
  state.history.unshift({ game, text, result });
  state.history = state.history.slice(0, MAX_HISTORY_STORED);
  scheduleSaveState();
  scheduleUiRefresh();
}

function scheduleUiRefresh() {
  if (uiRefreshQueued) return;
  uiRefreshQueued = true;

  requestAnimationFrame(() => {
    uiRefreshQueued = false;
    renderHistory();
    renderStats();
  });
}

function renderHistory() {
  if (!historyList) return;

  historyList.innerHTML = "";
  if (!state.history.length) {
    const empty = document.createElement("li");
    empty.className = "log-item";
    empty.innerHTML = "<span>No rounds yet.</span><span></span>";
    historyList.appendChild(empty);
    return;
  }

  state.history.slice(0, MAX_HISTORY_RENDERED).forEach((item) => {
    const row = document.createElement("li");
    row.className = "log-item";
    row.innerHTML = `
      <span><strong>${item.game}:</strong> ${item.text}</span>
      <span class="${item.result === "win" ? "outcome-win" : "outcome-loss"}">${item.result === "win" ? "WIN" : "LOSS"}</span>
    `;
    historyList.appendChild(row);
  });
}

function renderStats() {
  if (!roundsCount || !winsCount || !winRate) return;

  const roundGames = new Set(["Slot", "Dice", "Plinko", "Mines", "Wheel", "Chicken"]);
  const rounds = state.history.filter((i) => roundGames.has(i.game));
  const wins = rounds.filter((i) => i.result === "win").length;
  const rate = rounds.length ? Math.round((wins / rounds.length) * 100) : 0;

  roundsCount.textContent = String(rounds.length);
  winsCount.textContent = String(wins);
  winRate.textContent = `${rate}%`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function animateElement(el, className, durationMs) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  setTimeout(() => {
    el.classList.remove(className);
  }, durationMs);
}

function setDiceFace(value, animate = false) {
  if (!dice3d) return;

  const transforms = {
    1: "rotateX(0deg) rotateY(0deg)",
    2: "rotateX(0deg) rotateY(-90deg)",
    3: "rotateX(90deg) rotateY(0deg)",
    4: "rotateX(-90deg) rotateY(0deg)",
    5: "rotateX(0deg) rotateY(90deg)",
    6: "rotateX(0deg) rotateY(180deg)"
  };

  if (animate) {
    dice3d.classList.add("rolling");
  } else {
    dice3d.classList.remove("rolling");
  }
  dice3d.style.transform = transforms[value] || transforms[1];
}

function drawWheel(angle = wheelAngle) {
  if (!wheelCanvas || !wtx) return;

  const width = wheelCanvas.width;
  const height = wheelCanvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 12;
  const arc = (Math.PI * 2) / WHEEL_SEGMENTS.length;

  wtx.clearRect(0, 0, width, height);
  wtx.save();
  wtx.translate(cx, cy);
  wtx.rotate(angle);

  WHEEL_SEGMENTS.forEach((seg, idx) => {
    const start = idx * arc;
    const end = start + arc;
    const isRed = seg.key === "red";
    const isGreen = seg.key === "green";

    wtx.beginPath();
    wtx.moveTo(0, 0);
    wtx.arc(0, 0, radius, start, end);
    wtx.closePath();
    wtx.fillStyle = isGreen ? "#3f6e3f" : isRed ? "#713434" : "#232323";
    wtx.fill();
    wtx.strokeStyle = "#0f0f0f";
    wtx.lineWidth = 2;
    wtx.stroke();

    const mid = start + arc / 2;
    wtx.save();
    wtx.rotate(mid);
    wtx.textAlign = "right";
    wtx.fillStyle = "#f0f0f0";
    wtx.font = "600 16px IBM Plex Sans";
    wtx.fillText(seg.label, radius - 14, 5);
    wtx.restore();
  });

  wtx.beginPath();
  wtx.arc(0, 0, 26, 0, Math.PI * 2);
  wtx.fillStyle = "#141414";
  wtx.fill();
  wtx.strokeStyle = "#5a5a5a";
  wtx.lineWidth = 2;
  wtx.stroke();
  wtx.restore();
}

function wheelIndicesFor(key) {
  const idxs = [];
  WHEEL_SEGMENTS.forEach((seg, idx) => {
    if (seg.key === key) idxs.push(idx);
  });
  return idxs;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function animateWheelTo(resultKey) {
  if (!wheelCanvas) return Promise.resolve();

  const arc = (Math.PI * 2) / WHEEL_SEGMENTS.length;
  const candidates = wheelIndicesFor(resultKey);
  const targetIndex = candidates[Math.floor(Math.random() * candidates.length)];
  const targetCenter = targetIndex * arc + arc / 2;
  const pointerAngle = -Math.PI / 2;
  const baseTarget = pointerAngle - targetCenter;
  const spins = 5 + Math.floor(Math.random() * 2);
  const finalAngle = baseTarget + spins * Math.PI * 2;

  const startAngle = wheelAngle;
  const change = finalAngle - startAngle;
  const start = performance.now();

  return new Promise((resolve) => {
    const tick = (now) => {
      const t = Math.min(1, (now - start) / WHEEL_SPIN_MS);
      wheelAngle = startAngle + change * easeOutCubic(t);
      drawWheel(wheelAngle);
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

async function runSlot() {
  if (slotRolling) return;
  const bet = parseValidBet();
  if (!bet || !slotReel) return;

  slotRolling = true;
  state.balance -= bet;
  syncBalance();
  scheduleSaveState();
  animateElement(slotReel, "anim-spin", SLOT_ANIM_STEPS * SLOT_ANIM_MS + 120);

  for (let i = 0; i < SLOT_ANIM_STEPS; i += 1) {
    slotReel.textContent = `${pickSymbol()} ${pickSymbol()} ${pickSymbol()}`;
    await wait(SLOT_ANIM_MS);
  }

  const reels = [pickSymbol(), pickSymbol(), pickSymbol()];
  slotReel.textContent = reels.join(" ");

  let payout = 0;

  if (reels[0] === reels[1] && reels[1] === reels[2]) {
    payout = Math.round(bet * 2.6);
  } else if (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]) {
    payout = Math.round(bet * 1.25);
  }

  state.balance += payout;
  syncBalance();
  scheduleSaveState();

  const net = payout - bet;
  animateElement(slotReel, net >= 0 ? "anim-win" : "anim-loss", 420);
  if (net >= 0) {
    addLog("Slot", `Reel ${reels.join("-")} paid ${fmt(payout)} (net ${fmtNet(net)}).`, "win");
  } else {
    addLog("Slot", `Reel ${reels.join("-")} paid ${fmt(payout)} (net ${fmtNet(net)}).`, "loss");
  }
  slotRolling = false;
}

function drawMinesBoard() {
  if (!minesBoard) return;

  minesBoard.innerHTML = "";
  for (let i = 0; i < MINE_TILE_COUNT; i += 1) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "mine-tile";

    const isMine = minesGame.mines.has(i);
    const isOpened = minesGame.opened.has(i);

    if (isOpened && isMine) {
      tile.classList.add("mine");
      tile.textContent = "X";
    } else if (isOpened) {
      tile.classList.add("safe");
      tile.textContent = "OK";
    } else {
      tile.textContent = "?";
    }
    if (isOpened) tile.classList.add("revealed");
    if (isOpened && i === minesLastReveal) tile.classList.add("pop");

    tile.disabled = !minesGame.active || isOpened;
    tile.addEventListener("click", () => selectMineTile(i));
    minesBoard.appendChild(tile);
  }
}

function syncMinesButtons() {
  if (minesStartBtn) minesStartBtn.disabled = minesGame.active;
  if (minesCashoutBtn) minesCashoutBtn.disabled = !minesGame.active || minesGame.safeHits < 1;
}

function createMinesSet() {
  const mineIndexes = new Set();
  while (mineIndexes.size < MINE_COUNT) {
    mineIndexes.add(Math.floor(Math.random() * MINE_TILE_COUNT));
  }
  return mineIndexes;
}

function startMinesRound() {
  const bet = parseValidBet();
  if (!bet) return;

  state.balance -= bet;
  syncBalance();
  scheduleSaveState();

  minesGame = {
    active: true,
    bet,
    safeHits: 0,
    mines: createMinesSet(),
    opened: new Set()
  };
  minesLastReveal = -1;

  if (minesStatus) minesStatus.textContent = "Round started. Tap safe tiles and cash out before hitting a mine.";
  drawMinesBoard();
  syncMinesButtons();
}

function endMinesRoundByMine() {
  minesGame.active = false;
  minesGame.mines.forEach((idx) => minesGame.opened.add(idx));
  minesLastReveal = -1;
  drawMinesBoard();
  syncMinesButtons();

  if (minesStatus) {
    minesStatus.textContent = `Boom. You hit a mine after ${minesGame.safeHits} safe tiles.`;
  }
  addLog("Mines", `Hit a mine after ${minesGame.safeHits} safe picks (net ${fmtNet(-minesGame.bet)}).`, "loss");
}

function cashoutMines() {
  if (!minesGame.active || minesGame.safeHits < 1) return;

  const mult = MINE_MULTIPLIERS[Math.min(minesGame.safeHits - 1, MINE_MULTIPLIERS.length - 1)];
  const payout = Math.round(minesGame.bet * mult);
  const net = payout - minesGame.bet;

  state.balance += payout;
  syncBalance();
  scheduleSaveState();

  minesGame.active = false;
  minesLastReveal = -1;
  for (let i = 0; i < MINE_TILE_COUNT; i += 1) minesGame.opened.add(i);
  drawMinesBoard();
  syncMinesButtons();

  if (minesStatus) {
    minesStatus.textContent = `Cashed out at ${mult}x for ${fmt(payout)} credits.`;
  }
  addLog("Mines", `Cashed out at ${mult}x after ${minesGame.safeHits} picks (net ${fmtNet(net)}).`, net >= 0 ? "win" : "loss");
}

function selectMineTile(index) {
  if (!minesGame.active || minesGame.opened.has(index)) return;

  minesGame.opened.add(index);
  minesLastReveal = index;
  if (minesGame.mines.has(index)) {
    endMinesRoundByMine();
    return;
  }

  minesGame.safeHits += 1;
  const mult = MINE_MULTIPLIERS[Math.min(minesGame.safeHits - 1, MINE_MULTIPLIERS.length - 1)];
  const potential = Math.round(minesGame.bet * mult);

  if (minesStatus) {
    minesStatus.textContent = `Safe pick ${minesGame.safeHits}. Cash out now for ${mult}x (${fmt(potential)}).`;
  }

  drawMinesBoard();
  syncMinesButtons();
}

function setWheelPick(choice) {
  wheelPick = choice;
  wheelPickBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.choice === choice);
  });
}

function flashWheelOutcome(result) {
  wheelPickBtns.forEach((btn) => {
    btn.classList.remove("result-hit", "result-miss");
    const choice = btn.dataset.choice || "";
    if (choice === result) btn.classList.add("result-hit");
    if (choice === wheelPick && choice !== result) btn.classList.add("result-miss");
  });

  setTimeout(() => {
    wheelPickBtns.forEach((btn) => {
      btn.classList.remove("result-hit", "result-miss");
    });
  }, 780);
}

function weightedWheelResult() {
  const segments = [
    { key: "red", weight: 9 },
    { key: "black", weight: 9 },
    { key: "green", weight: 1 }
  ];
  const total = segments.reduce((sum, seg) => sum + seg.weight, 0);
  let roll = Math.random() * total;

  for (const seg of segments) {
    roll -= seg.weight;
    if (roll <= 0) return seg.key;
  }
  return "red";
}

async function runWheel() {
  if (wheelSpinning) return;
  const bet = parseValidBet();
  if (!bet) return;

  wheelSpinning = true;
  state.balance -= bet;
  syncBalance();
  scheduleSaveState();

  let payout = 0;
  const result = weightedWheelResult();
  if (wheelResult) wheelResult.textContent = "Spinning wheel...";
  await animateWheelTo(result);

  if (wheelPick === result) {
    const mult = result === "green" ? 12 : 1.9;
    payout = Math.round(bet * mult);
    state.balance += payout;
  }

  const net = payout - bet;
  if (wheelResult) wheelResult.textContent = `Result: ${result.toUpperCase()} | Picked: ${wheelPick.toUpperCase()}`;
  syncBalance();
  scheduleSaveState();
  flashWheelOutcome(result);
  animateElement(wheelResult, net >= 0 ? "anim-win" : "anim-loss", 460);
  addLog("Wheel", `Result ${result}, pick ${wheelPick}, paid ${fmt(payout)} (net ${fmtNet(net)}).`, net >= 0 ? "win" : "loss");
  wheelSpinning = false;
}

function drawChickenTrack() {
  if (!chickenTrack) return;

  chickenTrack.innerHTML = "";
  for (let lane = 0; lane < CHICKEN_MULTIPLIERS.length; lane += 1) {
    const laneEl = document.createElement("div");
    laneEl.className = "road-lane";

    if (lane < chickenGame.lane) laneEl.classList.add("passed");
    if (chickenGame.active && lane === chickenGame.lane) laneEl.classList.add("current");
    if (lane === chickenStepLane) laneEl.classList.add("step");

    laneEl.innerHTML = `<span>Lane ${lane + 1}</span><span>${CHICKEN_MULTIPLIERS[lane]}x</span>`;
    chickenTrack.appendChild(laneEl);
  }
}

function syncChickenButtons() {
  const running = chickenGame.active;
  if (chickenStartBtn) chickenStartBtn.disabled = running;
  if (chickenCrossBtn) chickenCrossBtn.disabled = !running;
  if (chickenCashoutBtn) chickenCashoutBtn.disabled = !running || chickenGame.lane < 1;
}

function startChickenRun() {
  const bet = parseValidBet();
  if (!bet) return;

  state.balance -= bet;
  syncBalance();
  scheduleSaveState();

  chickenGame = {
    active: true,
    bet,
    lane: 0
  };

  if (chickenStatus) chickenStatus.textContent = "Run started. Cross lane 1 first, then cash out anytime.";
  drawChickenTrack();
  syncChickenButtons();
}

function cashoutChicken() {
  if (!chickenGame.active || chickenGame.lane < 1) return;

  const mult = CHICKEN_MULTIPLIERS[chickenGame.lane - 1];
  const payout = Math.round(chickenGame.bet * mult);
  const net = payout - chickenGame.bet;

  state.balance += payout;
  syncBalance();
  scheduleSaveState();

  chickenGame.active = false;
  if (chickenStatus) chickenStatus.textContent = `Cashed out at lane ${chickenGame.lane} for ${mult}x (${fmt(payout)}).`;
  drawChickenTrack();
  syncChickenButtons();
  addLog("Chicken", `Cashed out at lane ${chickenGame.lane} (${mult}x), net ${fmtNet(net)}.`, net >= 0 ? "win" : "loss");
}

function crossChickenLane() {
  if (!chickenGame.active) return;

  const failChance = Math.min(0.14 + chickenGame.lane * 0.1, 0.65);
  if (Math.random() < failChance) {
    chickenGame.active = false;
    if (chickenStatus) chickenStatus.textContent = `Crash on lane ${chickenGame.lane + 1}. Better luck next run.`;
    drawChickenTrack();
    syncChickenButtons();
    addLog("Chicken", `Crashed on lane ${chickenGame.lane + 1} (net ${fmtNet(-chickenGame.bet)}).`, "loss");
    return;
  }

  chickenGame.lane += 1;
  chickenStepLane = chickenGame.lane - 1;
  drawChickenTrack();
  syncChickenButtons();
  setTimeout(() => {
    chickenStepLane = -1;
    drawChickenTrack();
  }, 260);

  if (chickenGame.lane >= CHICKEN_MULTIPLIERS.length) {
    cashoutChicken();
    return;
  }

  const nextMult = CHICKEN_MULTIPLIERS[chickenGame.lane];
  if (chickenStatus) chickenStatus.textContent = `Safe to lane ${chickenGame.lane}. Next lane pays ${nextMult}x.`;
}

async function runDice() {
  if (diceRolling) return;
  const bet = parseValidBet();
  if (!bet) return;

  diceRolling = true;
  state.balance -= bet;
  syncBalance();
  scheduleSaveState();

  const roll = Math.floor(Math.random() * 6) + 1;
  setDiceFace(roll, true);
  await wait(DICE_ANIM_MS);
  setDiceFace(roll, false);
  if (diceBox) diceBox.textContent = String(roll);
  if (diceResultText) diceResultText.textContent = `Rolled: ${roll}`;

  let payout = 0;

  if (roll >= 5) {
    payout = Math.round(bet * 1.9);
    state.balance += payout;
  }

  syncBalance();
  scheduleSaveState();

  const net = payout - bet;
  animateElement(diceResultText || diceBox, net >= 0 ? "anim-win" : "anim-loss", 420);
  if (net >= 0) {
    addLog("Dice", `Rolled ${roll}, paid ${fmt(payout)} (net ${fmtNet(net)}).`, "win");
  } else {
    addLog("Dice", `Rolled ${roll}, paid ${fmt(payout)} (net ${fmtNet(net)}).`, "loss");
  }
  diceRolling = false;
}

function pickSymbol() {
  return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
}

function setupMultipliers() {
  if (!plinkoMultipliers) return;

  plinkoMultipliers.innerHTML = "";
  PLINKO_MULTIPLIERS.forEach((value, idx) => {
    const el = document.createElement("div");
    el.className = "mult";
    el.dataset.index = String(idx);
    el.innerHTML = `<span class="mult-value">${value}x</span>`;
    plinkoMultipliers.appendChild(el);
  });
}

function highlightMultiplier(binIndex) {
  if (!plinkoMultipliers) return;

  [...plinkoMultipliers.querySelectorAll(".mult")].forEach((el) => {
    el.classList.toggle("hot", Number(el.dataset.index) === binIndex);
  });
}

function initPegs() {
  if (!plinkoCanvas) return;

  pegs.length = 0;
  const boardLeft = 24;
  const boardRight = plinkoCanvas.width - 24;
  const usableWidth = boardRight - boardLeft;

  for (let row = 0; row < pegRows; row += 1) {
    const count = 7 + row;
    const y = 62 + row * 28;
    const rowWidth = usableWidth * 0.82;
    const startX = (plinkoCanvas.width - rowWidth) / 2;

    for (let i = 0; i < count; i += 1) {
      const x = startX + (rowWidth * i) / (count - 1);
      pegs.push({ x, y, r: pegRadius });
    }
  }
}

function createBall(bet) {
  if (!plinkoCanvas) return;

  plinkoBalls.push({
    x: plinkoCanvas.width / 2 + (Math.random() - 0.5) * 8,
    y: 24,
    vx: (Math.random() - 0.5) * 1.1,
    vy: 0,
    bet
  });
}

function settlePlinko(ball, binIndex) {
  const safeIndex = Math.max(0, Math.min(PLINKO_MULTIPLIERS.length - 1, binIndex));
  const mult = PLINKO_MULTIPLIERS[safeIndex];
  const payout = Math.round(ball.bet * mult);

  state.balance += payout;
  saveState();
  syncBalance();

  const net = payout - ball.bet;
  addLog(
    "Plinko",
    `Bin ${safeIndex + 1} (${mult}x) paid ${fmt(payout)} (net ${fmtNet(net)}).`,
    net >= 0 ? "win" : "loss"
  );

  lastBin = safeIndex;
  highlightMultiplier(safeIndex);
}

function updatePlinko() {
  if (!plinkoCanvas || !plinkoBalls.length) return;

  const boardLeft = 24;
  const boardRight = plinkoCanvas.width - 24;
  const floorY = plinkoCanvas.height - 48;
  const binWidth = (boardRight - boardLeft) / PLINKO_MULTIPLIERS.length;

  for (let i = plinkoBalls.length - 1; i >= 0; i -= 1) {
    const ball = plinkoBalls[i];

    ball.vy += 0.2;
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x < boardLeft + ballRadius) {
      ball.x = boardLeft + ballRadius;
      ball.vx *= -0.7;
    }
    if (ball.x > boardRight - ballRadius) {
      ball.x = boardRight - ballRadius;
      ball.vx *= -0.7;
    }

    pegs.forEach((peg) => {
      const dx = ball.x - peg.x;
      const dy = ball.y - peg.y;
      const dist = Math.hypot(dx, dy);
      const minDist = ballRadius + peg.r;

      if (dist < minDist && dist > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        ball.x += nx * overlap;
        ball.y += ny * overlap;

        const dot = ball.vx * nx + ball.vy * ny;
        ball.vx -= 1.35 * dot * nx;
        ball.vy -= 1.35 * dot * ny;

        ball.vx += (Math.random() - 0.5) * 0.26;
        ball.vx *= 0.99;
        ball.vy *= 0.985;
      }
    });

    if (ball.y >= floorY - ballRadius) {
      const rawIndex = Math.floor((ball.x - boardLeft) / binWidth);
      settlePlinko(ball, rawIndex);
      plinkoBalls.splice(i, 1);
    }
  }
}

function drawPlinkoBoard() {
  if (!plinkoCanvas || !ptx) return;

  const boardLeft = 24;
  const boardRight = plinkoCanvas.width - 24;
  const floorY = plinkoCanvas.height - 48;
  const binCount = PLINKO_MULTIPLIERS.length;
  const binWidth = (boardRight - boardLeft) / binCount;

  ptx.clearRect(0, 0, plinkoCanvas.width, plinkoCanvas.height);

  ptx.strokeStyle = "rgba(230, 230, 230, 0.34)";
  ptx.lineWidth = 2;
  ptx.beginPath();
  ptx.moveTo(boardLeft, floorY);
  ptx.lineTo(boardRight, floorY);
  ptx.stroke();

  ptx.strokeStyle = "rgba(230, 230, 230, 0.18)";
  ptx.lineWidth = 1;
  for (let i = 1; i < binCount; i += 1) {
    const x = boardLeft + i * binWidth;
    ptx.beginPath();
    ptx.moveTo(x, floorY);
    ptx.lineTo(x, plinkoCanvas.height - 8);
    ptx.stroke();
  }

  pegs.forEach((peg) => {
    ptx.beginPath();
    ptx.fillStyle = "rgba(230, 230, 230, 0.7)";
    ptx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
    ptx.fill();
  });

  plinkoBalls.forEach((ball) => {
    ptx.beginPath();
    ptx.fillStyle = "#f0f0f0";
    ptx.arc(ball.x, ball.y, ballRadius, 0, Math.PI * 2);
    ptx.fill();
  });
}

function animatePlinko() {
  updatePlinko();
  drawPlinkoBoard();
  requestAnimationFrame(animatePlinko);
}

function runPlinko() {
  if (!plinkoCanvas) return;

  if (plinkoBalls.length >= MAX_PLINKO_BALLS) {
    addLog("System", "Plinko ball limit reached. Wait a moment.", "loss");
    return;
  }

  const bet = parseValidBet();
  if (!bet) return;

  state.balance -= bet;
  saveState();
  syncBalance();
  createBall(bet);
}

function setupGameSwitcher() {
  if (page !== "game") return;

  const buttons = [...document.querySelectorAll(".switch-btn")];
  const panes = [...document.querySelectorAll(".game-pane")];
  if (!buttons.length || !panes.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      panes.forEach((pane) => pane.classList.toggle("active", pane.id === target));
    });
  });
}

function setupGamesNav() {
  const navMenus = [...document.querySelectorAll(".nav-games")];
  if (!navMenus.length) return;

  const closeAll = (except = null) => {
    navMenus.forEach((menu) => {
      if (menu === except) return;
      menu.classList.remove("open");
      const btn = menu.querySelector(".nav-games-btn");
      if (btn) btn.setAttribute("aria-expanded", "false");
    });
  };

  navMenus.forEach((menu) => {
    const btn = menu.querySelector(".nav-games-btn");
    if (!btn) return;

    btn.setAttribute("aria-expanded", menu.classList.contains("open") ? "true" : "false");

    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const shouldOpen = !menu.classList.contains("open");
      closeAll(menu);
      menu.classList.toggle("open", shouldOpen);
      btn.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".nav-games")) {
      closeAll();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAll();
  });
}

function bindEvents() {
  if (spinBtn) spinBtn.addEventListener("click", runSlot);
  if (rollBtn) rollBtn.addEventListener("click", runDice);
  if (dropBtn) dropBtn.addEventListener("click", runPlinko);
  if (minesStartBtn) minesStartBtn.addEventListener("click", startMinesRound);
  if (minesCashoutBtn) minesCashoutBtn.addEventListener("click", cashoutMines);
  if (wheelSpinBtn) wheelSpinBtn.addEventListener("click", runWheel);
  wheelPickBtns.forEach((btn) => {
    btn.addEventListener("click", () => setWheelPick(btn.dataset.choice || "red"));
  });
  if (chickenStartBtn) chickenStartBtn.addEventListener("click", startChickenRun);
  if (chickenCrossBtn) chickenCrossBtn.addEventListener("click", crossChickenLane);
  if (chickenCashoutBtn) chickenCashoutBtn.addEventListener("click", cashoutChicken);

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      state.balance = STARTING_BALANCE;
      saveState();
      syncBalance();
      addLog("System", "Wallet reset to 1000 credits.", "win");
    });
  }

  if (topupBtn) {
    topupBtn.addEventListener("click", () => {
      state.balance += 250;
      saveState();
      syncBalance();
      addLog("System", "+250 test credits added.", "win");
    });
  }

  if (clearLogBtn) {
    clearLogBtn.addEventListener("click", () => {
      state.history = [];
      saveState();
      renderHistory();
      renderStats();
    });
  }

  if (betInput) {
    betInput.addEventListener("change", () => {
      const val = Number(betInput.value);
      if (Number.isFinite(val) && val >= 10 && val % 10 === 0) {
        state.bet = val;
        saveState();
      }
    });
  }
}

function setupExtraGamesUi() {
  setDiceFace(1, false);
  drawMinesBoard();
  syncMinesButtons();
  setWheelPick("red");
  drawWheel(wheelAngle);
  drawChickenTrack();
  syncChickenButtons();
}

function setupPageTransitions() {
  requestAnimationFrame(() => {
    document.body.classList.add("page-ready");
  });

  document.querySelectorAll("a[href$='.html']").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const href = link.getAttribute("href");
      if (!href || href === window.location.pathname.split("/").pop()) return;

      event.preventDefault();
      document.body.classList.remove("page-ready");
      document.body.classList.add("page-leave");
      setTimeout(() => {
        window.location.href = href;
      }, 220);
    });
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  setupPageTransitions();
  setupGamesNav();

  const authOk = await authBootstrap();
  if (!authOk) return;

  document.querySelectorAll(".reveal").forEach((el, index) => {
    setTimeout(() => el.classList.add("in"), index * 80);
  });

  syncBalance();
  syncBetInput();
  renderHistory();
  renderStats();
  setupGameSwitcher();
  setupExtraGamesUi();
  bindEvents();

  if (page === "plinko" && plinkoCanvas) {
    setupMultipliers();
    initPegs();
    highlightMultiplier(lastBin);
    animatePlinko();
  }
});

