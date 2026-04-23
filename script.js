class SoundEngine {
  constructor() {
    this.audioContext = null;
    this.enabled = true;
  }

  init() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioContext = new AudioCtx();
    }
  }

  beep({ freq = 440, duration = 0.1, type = "sine", gain = 0.03 }) {
    if (!this.enabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = type;
    oscillator.frequency.value = freq;
    gainNode.gain.value = gain;
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;
    oscillator.start(now);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.stop(now + duration);
  }

  playBonus() {
    this.beep({ freq: 860, duration: 0.1, type: "triangle", gain: 0.04 });
  }

  playCrash() {
    this.beep({ freq: 120, duration: 0.28, type: "sawtooth", gain: 0.06 });
  }
}

const STORAGE_KEYS = {
  best: "neon-runner-best-score",
  playerName: "neon-runner-player-name",
  leaderboard: "neon-runner-leaderboard-v1",
};

const DIFFICULTY = {
  easy: { baseSpeed: 155, maxSpeed: 360, acceleration: 4.2, spawnFactor: 1.22, scoreFactor: 0.08 },
  normal: { baseSpeed: 185, maxSpeed: 430, acceleration: 6, spawnFactor: 1, scoreFactor: 0.095 },
  hard: { baseSpeed: 220, maxSpeed: 520, acceleration: 8.4, spawnFactor: 0.84, scoreFactor: 0.115 },
};

const CAR_TYPES = {
  balanced: { speedMult: 1, accelMult: 1, controlMult: 1, sizeMult: 1, colorShift: 0, title: "Balanced" },
  sprinter: { speedMult: 1.12, accelMult: 1.08, controlMult: 0.9, sizeMult: 0.95, colorShift: 18, title: "Sprinter" },
  drift: { speedMult: 0.97, accelMult: 0.96, controlMult: 1.25, sizeMult: 0.94, colorShift: -22, title: "Drift" },
  tank: { speedMult: 0.9, accelMult: 0.86, controlMult: 0.82, sizeMult: 1.08, colorShift: 44, title: "Tank" },
};

const THEMES = {
  neon: {
    skyTop: "#162546",
    skyBottom: "#090d18",
    grass: "#1f5738",
    grassDark: "#173a2a",
    road: "#2b3042",
    shoulder: "#5a2029",
    shoulderAlt: "#f0e6d6",
    laneMark: "#f8f5ef",
    playerCar: "#61efff",
  },
  sunset: {
    skyTop: "#ff8a5b",
    skyBottom: "#34224f",
    grass: "#686c2a",
    grassDark: "#4e531f",
    road: "#483f55",
    shoulder: "#8f3b2b",
    shoulderAlt: "#ffe8b0",
    laneMark: "#fff2d4",
    playerCar: "#ff8b72",
  },
  midnight: {
    skyTop: "#1f2f58",
    skyBottom: "#050914",
    grass: "#1b3a43",
    grassDark: "#122c33",
    road: "#222a37",
    shoulder: "#334864",
    shoulderAlt: "#b6d1e4",
    laneMark: "#d9e7f5",
    playerCar: "#8cc8ff",
  },
};

class Game {
  constructor() {
    this.canvas = document.getElementById("gameCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.scoreValueEl = document.getElementById("scoreValue");
    this.bestScoreValueEl = document.getElementById("bestScoreValue");
    this.speedValueEl = document.getElementById("speedValue");
    this.finalScoreEl = document.getElementById("finalScore");
    this.finalBestScoreEl = document.getElementById("finalBestScore");
    this.finalRankTextEl = document.getElementById("finalRankText");
    this.leaderboardListEl = document.getElementById("leaderboardList");

    this.startScreen = document.getElementById("startScreen");
    this.pauseScreen = document.getElementById("pauseScreen");
    this.gameOverScreen = document.getElementById("gameOverScreen");
    this.playButton = document.getElementById("playButton");
    this.restartButton = document.getElementById("restartButton");
    this.exportButton = document.getElementById("exportButton");
    this.difficultySelect = document.getElementById("difficultySelect");
    this.themeSelect = document.getElementById("themeSelect");
    this.carTypeSelect = document.getElementById("carTypeSelect");
    this.playerNameInput = document.getElementById("playerNameInput");

    this.touchLeft = document.getElementById("touchLeft");
    this.touchRight = document.getElementById("touchRight");

    this.sound = new SoundEngine();
    this.keys = { left: false, right: false };
    this.mouseControl = { active: false, targetX: 0 };

    this.state = "menu";
    this.lastTime = 0;
    this.distance = 0;
    this.score = 0;
    this.speed = 0;
    this.baseSpeed = 180;
    this.maxSpeed = 430;
    this.acceleration = 6;
    this.spawnFactor = 1;
    this.scoreFactor = 0.095;

    this.bestScore = this.loadBestScore();
    this.leaderboard = this.loadLeaderboard();
    this.bestScore = Math.max(this.bestScore, this.leaderboard[0]?.score || 0);
    this.crashFlash = 0;
    this.playerTilt = 0;
    this.cameraShake = 0;

    this.theme = THEMES.neon;
    this.carType = CAR_TYPES.balanced;
    this.player = { x: 0, y: this.canvas.height - 148, width: 58, height: 108, moveSpeed: 1.85 };
    this.playerRect = { x: 0, y: 0, width: 0, height: 0 };
    this.lanes = [-0.7, 0, 0.7];

    this.horizonY = 0;
    this.roadTopWidth = 150;
    this.roadBottomWidth = this.canvas.width * 0.92;
    this.roadScroll = 0;

    this.traffic = [];
    this.bonuses = [];
    this.props = [];
    this.spawnTimer = 0;
    this.bonusSpawnTimer = 0;
    this.propSpawnTimer = 0;

    this.setSavedPlayerName();
    this.applySelectedDifficulty();
    this.applySelectedTheme();
    this.applySelectedCarType();
    this.bindEvents();
    this.updateLeaderboardUI();
    this.updateHud();

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  bindEvents() {
    this.playButton.addEventListener("click", () => this.startGame());
    this.restartButton.addEventListener("click", () => this.startGame());
    this.exportButton.addEventListener("click", () => this.exportProjectZip());
    this.difficultySelect.addEventListener("change", () => this.applySelectedDifficulty());
    this.themeSelect.addEventListener("change", () => this.applySelectedTheme());
    this.carTypeSelect.addEventListener("change", () => this.applySelectedCarType());

    this.playerNameInput.addEventListener("change", () => {
      this.savePlayerName(this.getPlayerName());
    });

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (key === "escape") {
        this.togglePause();
        return;
      }
      if (this.state !== "running") return;
      this.mouseControl.active = false;
      if (key === "arrowleft" || key === "a") this.keys.left = true;
      if (key === "arrowright" || key === "d") this.keys.right = true;
    });

    window.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") this.keys.left = false;
      if (key === "arrowright" || key === "d") this.keys.right = false;
    });

    this.bindTouch(this.touchLeft, "left");
    this.bindTouch(this.touchRight, "right");
    this.bindMouseControls();
  }

  bindTouch(button, side) {
    const down = (event) => {
      event.preventDefault();
      this.keys[side] = true;
      this.sound.init();
    };
    const up = (event) => {
      event.preventDefault();
      this.keys[side] = false;
    };

    button.addEventListener("touchstart", down, { passive: false });
    button.addEventListener("touchend", up, { passive: false });
    button.addEventListener("touchcancel", up, { passive: false });
    button.addEventListener("mousedown", down);
    button.addEventListener("mouseup", up);
    button.addEventListener("mouseleave", up);
  }

  bindMouseControls() {
    const handlePointer = (event) => {
      if (this.state !== "running") return;
      const rect = this.canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      this.mouseControl.targetX = this.getPlayerXFromPointer(pointerX, rect.width);
      this.mouseControl.active = true;
    };

    this.canvas.addEventListener("mousemove", handlePointer);
    this.canvas.addEventListener("mouseenter", handlePointer);
    this.canvas.addEventListener("mousedown", (event) => {
      handlePointer(event);
      this.sound.init();
    });
    this.canvas.addEventListener("mouseleave", () => {
      this.mouseControl.active = false;
    });
  }

  getPlayerName() {
    return (this.playerNameInput.value || "Игрок").trim().slice(0, 16) || "Игрок";
  }

  setSavedPlayerName() {
    try {
      const name = localStorage.getItem(STORAGE_KEYS.playerName);
      if (name) this.playerNameInput.value = name;
    } catch {
      this.playerNameInput.value = "Игрок";
    }
  }

  savePlayerName(name) {
    try {
      localStorage.setItem(STORAGE_KEYS.playerName, name);
    } catch {
      // Игнорируем если запись недоступна.
    }
  }

  loadBestScore() {
    try {
      return Number(localStorage.getItem(STORAGE_KEYS.best)) || 0;
    } catch {
      return 0;
    }
  }

  saveBestScore(value) {
    this.bestScore = value;
    try {
      localStorage.setItem(STORAGE_KEYS.best, String(value));
    } catch {
      // Игнорируем если запись недоступна.
    }
  }

  loadLeaderboard() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.leaderboard);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((entry) => typeof entry?.name === "string" && Number.isFinite(entry?.score))
        .map((entry) => ({ name: entry.name.slice(0, 16), score: Math.floor(entry.score) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } catch {
      return [];
    }
  }

  saveLeaderboard() {
    try {
      localStorage.setItem(STORAGE_KEYS.leaderboard, JSON.stringify(this.leaderboard));
    } catch {
      // Игнорируем если запись недоступна.
    }
  }

  updateLeaderboardUI() {
    this.leaderboardListEl.innerHTML = "";
    if (!this.leaderboard.length) {
      const empty = document.createElement("li");
      empty.className = "leaderboard-empty";
      empty.textContent = "Пока нет результатов";
      this.leaderboardListEl.appendChild(empty);
      return;
    }

    this.leaderboard.forEach((entry) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${entry.name}</span><strong>${entry.score}</strong>`;
      this.leaderboardListEl.appendChild(li);
    });
  }

  registerScore(name, score) {
    const rounded = Math.floor(score);
    this.leaderboard.push({ name, score: rounded });
    this.leaderboard.sort((a, b) => b.score - a.score);
    this.leaderboard = this.leaderboard.slice(0, 5);

    const rank = this.leaderboard.findIndex((entry) => entry.name === name && entry.score === rounded) + 1;
    this.saveLeaderboard();
    this.updateLeaderboardUI();

    if (rounded > this.bestScore) this.saveBestScore(rounded);
    return rank > 0 ? rank : null;
  }

  applySelectedDifficulty() {
    const config = DIFFICULTY[this.difficultySelect.value] || DIFFICULTY.normal;
    this.baseSpeed = config.baseSpeed;
    this.maxSpeed = config.maxSpeed;
    this.acceleration = config.acceleration;
    this.spawnFactor = config.spawnFactor;
    this.scoreFactor = config.scoreFactor;
    this.applySelectedCarType();
  }

  applySelectedTheme() {
    this.theme = THEMES[this.themeSelect.value] || THEMES.neon;
  }

  applySelectedCarType() {
    this.carType = CAR_TYPES[this.carTypeSelect.value] || CAR_TYPES.balanced;
    this.player.moveSpeed = 1.85 * this.carType.controlMult;
    this.player.width = 58 * this.carType.sizeMult;
    this.player.height = 108 * this.carType.sizeMult;
    if (this.state === "running") {
      this.maxSpeed = Math.floor((DIFFICULTY[this.difficultySelect.value] || DIFFICULTY.normal).maxSpeed * this.carType.speedMult);
      this.acceleration = (DIFFICULTY[this.difficultySelect.value] || DIFFICULTY.normal).acceleration * this.carType.accelMult;
    }
  }

  getPlayerColor() {
    const base = this.theme.playerCar;
    if (!base.startsWith("#") || base.length !== 7) return base;
    const shift = this.carType.colorShift;
    const r = Math.min(255, Math.max(0, parseInt(base.slice(1, 3), 16) + shift));
    const g = Math.min(255, Math.max(0, parseInt(base.slice(3, 5), 16) + shift));
    const b = Math.min(255, Math.max(0, parseInt(base.slice(5, 7), 16) + shift));
    return `rgb(${r}, ${g}, ${b})`;
  }

  getPlayerXFromPointer(pointerX, canvasClientWidth) {
    const canvasX = (pointerX / canvasClientWidth) * this.canvas.width;
    const y = this.player.y;
    const roadWidth = this.getRoadWidthAt(y);
    const center = this.getRoadCenterAt(y);
    const normalized = (canvasX - center) / (roadWidth * 0.41);
    return Math.max(-0.92, Math.min(0.92, normalized));
  }

  startGame() {
    this.sound.init();
    if (this.sound.audioContext?.state === "suspended") this.sound.audioContext.resume();
    this.applySelectedDifficulty();
    this.applySelectedTheme();
    this.applySelectedCarType();
    this.savePlayerName(this.getPlayerName());

    const base = DIFFICULTY[this.difficultySelect.value] || DIFFICULTY.normal;
    this.maxSpeed = Math.floor(base.maxSpeed * this.carType.speedMult);
    this.acceleration = base.acceleration * this.carType.accelMult;

    this.state = "running";
    this.keys.left = false;
    this.keys.right = false;
    this.lastTime = 0;
    this.distance = 0;
    this.score = 0;
    this.speed = Math.floor(base.baseSpeed * this.carType.speedMult);
    this.roadScroll = 0;
    this.crashFlash = 0;
    this.playerTilt = 0;
    this.cameraShake = 0;
    this.player.x = 0;
    this.mouseControl.active = false;
    this.mouseControl.targetX = 0;

    this.traffic = [];
    this.bonuses = [];
    this.props = [];
    this.spawnTimer = 0.5;
    this.bonusSpawnTimer = 1;
    this.propSpawnTimer = 0;

    this.setOverlay(this.startScreen, false);
    this.setOverlay(this.pauseScreen, false);
    this.setOverlay(this.gameOverScreen, false);
    this.updateHud();
  }

  endGame() {
    this.state = "gameover";
    this.crashFlash = 1;
    this.sound.playCrash();

    const finalScore = Math.floor(this.score);
    const rank = this.registerScore(this.getPlayerName(), finalScore);
    this.finalScoreEl.textContent = finalScore;
    this.finalBestScoreEl.textContent = this.bestScore;
    this.finalRankTextEl.textContent = rank ? `${rank} / 5` : "вне топ-5";

    this.setOverlay(this.gameOverScreen, true);
    this.updateHud();
  }

  togglePause() {
    if (this.state === "running") {
      this.state = "paused";
      this.keys.left = false;
      this.keys.right = false;
      this.setOverlay(this.pauseScreen, true);
      return;
    }
    if (this.state === "paused") {
      this.state = "running";
      this.setOverlay(this.pauseScreen, false);
    }
  }

  setOverlay(element, visible) {
    element.classList.toggle("visible", visible);
  }

  async exportProjectZip() {
    if (!window.JSZip) {
      alert("Не удалось загрузить JSZip. Проверь подключение к интернету.");
      return;
    }

    const button = this.exportButton;
    const initialText = button.textContent;
    button.disabled = true;
    button.textContent = "Экспорт...";

    try {
      const fileNames = ["index.html", "style.css", "script.js"];
      const zip = new window.JSZip();
      const folder = zip.folder("neon-runner");

      for (const fileName of fileNames) {
        const response = await fetch(fileName, { cache: "no-store" });
        if (!response.ok) throw new Error(`Не удалось прочитать ${fileName}`);
        folder.file(fileName, await response.text());
      }

      folder.file(
        "README.txt",
        "Neon Runner\n\nЗапуск:\n1) Открой index.html в браузере.\n2) Или запусти через Live Server.\n"
      );

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "neon-runner.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Экспорт не удался. Запусти игру через локальный сервер (например, Live Server) и попробуй снова.");
    } finally {
      button.disabled = false;
      button.textContent = initialText;
    }
  }

  update(delta) {
    if (this.state !== "running") return;

    this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * delta);
    this.distance += this.speed * delta;
    this.score += this.speed * delta * this.scoreFactor;
    this.roadScroll += this.speed * delta;

    this.movePlayer(delta);
    this.spawnTimer += delta;
    this.bonusSpawnTimer += delta;
    this.propSpawnTimer += delta;

    const trafficInterval = Math.max(0.42, (1.22 - this.speed / 430) * this.spawnFactor);
    if (this.spawnTimer > trafficInterval) {
      this.spawnTrafficCar();
      this.spawnTimer = 0;
    }

    if (this.bonusSpawnTimer > 2.7) {
      this.spawnBonus();
      this.bonusSpawnTimer = 0;
    }

    if (this.propSpawnTimer > 0.33) {
      this.spawnRoadsideObject();
      this.propSpawnTimer = 0;
    }

    this.updateWorldObjects(delta);
    this.checkCollisions();
    this.updateCameraEffects(delta);
    this.updateHud();
  }

  movePlayer(delta) {
    const input = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    const prevX = this.player.x;

    if (this.mouseControl.active) {
      const lerpFactor = Math.min(1, delta * 10);
      this.player.x += (this.mouseControl.targetX - this.player.x) * lerpFactor;
    } else {
      this.player.x += input * this.player.moveSpeed * delta;
    }

    this.player.x = Math.max(-0.92, Math.min(0.92, this.player.x));
    const lateralSpeed = (this.player.x - prevX) / Math.max(delta, 0.0001);
    const targetTilt = Math.max(-0.23, Math.min(0.23, lateralSpeed * 0.12));
    this.playerTilt += (targetTilt - this.playerTilt) * Math.min(1, delta * 9);
  }

  spawnTrafficCar() {
    const laneIndex = Math.floor(Math.random() * this.lanes.length);
    const lane = this.lanes[laneIndex];
    this.traffic.push({
      z: 0.02,
      laneOffset: lane + (Math.random() - 0.5) * 0.04,
      targetLaneOffset: lane,
      speedFactor: 0.7 + Math.random() * 0.8,
      color: `hsl(${Math.floor(Math.random() * 360)}, 78%, 62%)`,
      laneChangeTimer: 1.4 + Math.random() * 1.9,
      rect: null,
    });
  }

  spawnBonus() {
    const lane = this.lanes[Math.floor(Math.random() * this.lanes.length)];
    const type = Math.random() < 0.58 ? "score" : "boost";
    this.bonuses.push({
      z: 0.04,
      laneOffset: lane + (Math.random() - 0.5) * 0.05,
      spin: Math.random() * Math.PI * 2,
      type,
      rect: null,
    });
  }

  spawnRoadsideObject() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const kind = Math.random() < 0.84 ? "tree" : "sign";

    // Для деревьев иногда создаём маленькие кластеры (2-3 дерева).
    const clusterCount = kind === "tree" && Math.random() < 0.52 ? 2 + Math.floor(Math.random() * 2) : 1;
    for (let i = 0; i < clusterCount; i += 1) {
      this.props.push({
        z: 0.03 - i * 0.012,
        side,
        kind,
        wobble: Math.random() * Math.PI * 2,
        variant: Math.floor(Math.random() * 3),
        sideOffset: kind === "tree" ? (Math.random() - 0.5) * 0.3 : 0,
      });
    }
  }

  updateWorldObjects(delta) {
    const speedScale = this.speed / 320;

    for (const traffic of this.traffic) {
      traffic.z += delta * speedScale * traffic.speedFactor;
      traffic.laneChangeTimer -= delta;

      if (traffic.laneChangeTimer <= 0 && Math.random() < 0.66) {
        const nearestLane = this.getNearestLaneIndex(traffic.targetLaneOffset);
        const dir = Math.random() < 0.5 ? -1 : 1;
        const nextIndex = Math.max(0, Math.min(this.lanes.length - 1, nearestLane + dir));
        traffic.targetLaneOffset = this.lanes[nextIndex];
        traffic.laneChangeTimer = 1.2 + Math.random() * 2;
      }

      const laneLerp = Math.min(1, delta * (1.4 + traffic.speedFactor * 0.8));
      traffic.laneOffset += (traffic.targetLaneOffset - traffic.laneOffset) * laneLerp;
    }

    for (const bonus of this.bonuses) {
      bonus.z += delta * speedScale * 0.95;
      bonus.spin += delta * 8;
    }

    for (const prop of this.props) {
      prop.z += delta * speedScale * 0.92;
      prop.wobble += delta * 3;
    }

    this.traffic = this.traffic.filter((item) => item.z < 1.12);
    this.bonuses = this.bonuses.filter((item) => item.z < 1.12);
    this.props = this.props.filter((item) => item.z < 1.15);
  }

  getNearestLaneIndex(offset) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < this.lanes.length; i += 1) {
      const distance = Math.abs(this.lanes[i] - offset);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  updateCameraEffects(delta) {
    const speedRatio = this.speed / this.maxSpeed;
    const targetShake = speedRatio > 0.72 ? (speedRatio - 0.72) * 5.4 : 0;
    this.cameraShake += (targetShake - this.cameraShake) * Math.min(1, delta * 4.5);
  }

  getRoadCenterAt(y) {
    const t = (y - this.horizonY) / (this.canvas.height - this.horizonY);
    const curve =
      Math.sin(this.distance * 0.0022 + (1 - t) * 3.1) * 24 * (1 - t) +
      Math.sin(this.distance * 0.0014 + (1 - t) * 6.4) * 8;
    return this.canvas.width / 2 + curve;
  }

  getRoadWidthAt(y) {
    const t = (y - this.horizonY) / (this.canvas.height - this.horizonY);
    return this.roadTopWidth + (this.roadBottomWidth - this.roadTopWidth) * Math.max(0, t);
  }

  projectObject(z, laneOffset, laneScale = 0.32) {
    const clampedZ = Math.max(0, z);
    const perspective = Math.pow(clampedZ, 1.55);
    const y = this.horizonY + (this.canvas.height - this.horizonY) * perspective;
    const roadWidth = this.getRoadWidthAt(y);
    const center = this.getRoadCenterAt(y);
    const x = center + laneOffset * roadWidth * laneScale;
    const scale = 0.28 + clampedZ * 0.95;
    return { x, y, scale, roadWidth };
  }

  getPlayerRenderRect() {
    const y = this.player.y;
    const roadWidth = this.getRoadWidthAt(y);
    const center = this.getRoadCenterAt(y);
    const x = center + this.player.x * roadWidth * 0.41;
    return { x: x - this.player.width / 2, y, width: this.player.width, height: this.player.height };
  }

  collides(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  checkCollisions() {
    const carHitbox = {
      x: this.playerRect.x + this.playerRect.width * 0.12,
      y: this.playerRect.y + this.playerRect.height * 0.14,
      width: this.playerRect.width * 0.76,
      height: this.playerRect.height * 0.76,
    };

    for (const traffic of this.traffic) {
      if (traffic.rect && this.collides(carHitbox, traffic.rect)) {
        this.endGame();
        return;
      }
    }

    this.bonuses = this.bonuses.filter((bonus) => {
      if (!bonus.rect || !this.collides(carHitbox, bonus.rect)) return true;
      if (bonus.type === "score") this.score += 170;
      if (bonus.type === "boost") this.speed = Math.min(this.maxSpeed, this.speed + 80);
      this.sound.playBonus();
      return false;
    });
  }

  updateHud() {
    this.scoreValueEl.textContent = Math.floor(this.score);
    this.bestScoreValueEl.textContent = this.bestScore;
    this.speedValueEl.textContent = `${Math.floor(this.speed)} км/ч`;
  }

  drawRoundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width * 0.5, height * 0.5);
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  drawBackground() {
    const { ctx, canvas, theme } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, this.horizonY);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, this.horizonY + 2);

    ctx.fillStyle = "#202738";
    ctx.fillRect(0, this.horizonY, canvas.width, canvas.height - this.horizonY);

    const skylineY = this.horizonY - 6;
    const skylineShiftBack = (this.distance * 0.02) % 68;
    for (let x = -68 + skylineShiftBack; x < canvas.width + 68; x += 34) {
      const h = 22 + ((x * 31) % 48);
      ctx.fillStyle = "rgba(20, 30, 52, 0.84)";
      ctx.fillRect(x, skylineY - h, 28, h);
    }

    const skylineShiftFront = (this.distance * 0.05) % 54;
    for (let x = -54 + skylineShiftFront; x < canvas.width + 54; x += 27) {
      const h = 16 + ((x * 19) % 36);
      ctx.fillStyle = "rgba(26, 38, 66, 0.92)";
      ctx.fillRect(x, skylineY - h, 22, h);
      if (h > 24) {
        ctx.fillStyle = "rgba(255, 224, 160, 0.25)";
        ctx.fillRect(x + 4, skylineY - h + 5, 2, 2);
        ctx.fillRect(x + 10, skylineY - h + 11, 2, 2);
        ctx.fillRect(x + 16, skylineY - h + 17, 2, 2);
      }
    }

    ctx.fillStyle = "rgba(14, 20, 36, 0.95)";
    ctx.fillRect(0, this.horizonY + 10, canvas.width, 10);
    ctx.globalAlpha = 1;
  }

  drawRoadAndShoulders() {
    const { ctx, canvas, theme } = this;
    const dashCycle = 58;
    const dashLength = 30;
    const shoulderSegments = 18;

    for (let y = Math.floor(this.horizonY); y < canvas.height; y += 2) {
      const roadWidth = this.getRoadWidthAt(y);
      const center = this.getRoadCenterAt(y);
      const left = center - roadWidth / 2;
      const right = center + roadWidth / 2;
      const shoulderWidth = roadWidth * 0.12;
      const laneWidth = roadWidth / 3;

      // Лесная земля/трава по краям дороги.
      const forestBand = ((y + this.roadScroll * 0.9) % 42) < 21;
      ctx.fillStyle = forestBand ? "#2e5f3e" : "#265336";
      ctx.fillRect(0, y, canvas.width, 2);

      // Уплотненная грунтовая полоса между лесом и обочиной.
      ctx.fillStyle = "#5a4b3a";
      ctx.fillRect(left - shoulderWidth - roadWidth * 0.1, y, roadWidth * 0.1, 2);
      ctx.fillRect(right + shoulderWidth, y, roadWidth * 0.1, 2);

      const shoulderAlt =
        ((Math.floor((y + this.roadScroll) / shoulderSegments) + (y % 2)) % 2) === 0 ? theme.shoulder : theme.shoulderAlt;
      ctx.fillStyle = shoulderAlt;
      ctx.fillRect(left - shoulderWidth, y, shoulderWidth, 2);
      ctx.fillRect(right, y, shoulderWidth, 2);

      ctx.fillStyle = theme.road;
      ctx.fillRect(left, y, roadWidth, 2);

      if (((y + this.roadScroll * 1.6) % dashCycle) < dashLength && y > this.horizonY + 12) {
        ctx.fillStyle = theme.laneMark;
        ctx.fillRect(left + laneWidth - 1, y, 2, 2);
        ctx.fillRect(left + laneWidth * 2 - 1, y, 2, 2);
      }
    }
  }

  drawTreeProp(x, y, scale, variant, side) {
    const { ctx } = this;
    const trunkW = Math.max(2.4, scale * 5.2);
    const trunkH = scale * (17 + variant * 1.2);
    const crownW = scale * (27 + variant * 4.4);
    const colorMain = side > 0 ? "#2b9f5b" : "#2aa356";
    const colorShadow = side > 0 ? "#227d48" : "#24864b";

    ctx.fillStyle = "#684726";
    ctx.fillRect(x - trunkW / 2, y - trunkH, trunkW, trunkH);

    for (let layer = 0; layer < 3; layer += 1) {
      const topY = y - trunkH - scale * 2.5 - layer * scale * 8.2;
      const width = crownW - layer * scale * 4.5;
      ctx.beginPath();
      ctx.moveTo(x, topY - scale * 13);
      ctx.lineTo(x - width * 0.5, topY + scale * 5.2);
      ctx.lineTo(x + width * 0.5, topY + scale * 5.2);
      ctx.closePath();
      ctx.fillStyle = layer % 2 ? colorShadow : colorMain;
      ctx.fill();
    }
  }

  drawSignProp(x, y, scale) {
    const { ctx } = this;
    const plateW = scale * 10;
    const plateH = scale * 6.5;
    ctx.fillStyle = "#d9ecff";
    this.drawRoundedRect(x - plateW / 2, y - scale * 19, plateW, plateH, 3);
    ctx.fill();
    ctx.fillStyle = "#314a6e";
    ctx.fillRect(x - 1.6, y - scale * 13, 3.2, scale * 13);
    ctx.fillStyle = "#2a3750";
    ctx.fillRect(x - plateW / 4, y - scale * 16.4, plateW / 2, 1.2);
  }

  drawRoadsideProps() {
    for (const prop of this.props) {
      const p = this.projectObject(prop.z, prop.side * 1.35 + (prop.sideOffset || 0), 0.5);
      const scale = p.scale;
      const x = p.x;
      const y = p.y + Math.sin(prop.wobble) * 0.3 * scale;
      if (prop.kind === "tree") this.drawTreeProp(x, y, scale, prop.variant, prop.side);
      else this.drawSignProp(x, y, scale);
    }
  }

  drawCarShadow(centerX, baseY, width, height, opacity = 0.32) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.ellipse(centerX, baseY, width * 0.38, height * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawCarSprite(x, y, width, height, color, isPlayer = false, tilt = 0) {
    const { ctx } = this;
    const roofColor = isPlayer ? "#c9f7ff" : "#e7f0ff";
    const glassColor = isPlayer ? "#15374c" : "#1f2f4b";

    ctx.save();
    ctx.translate(x + width / 2, y + height * 0.56);
    ctx.rotate(tilt);
    ctx.translate(-(x + width / 2), -(y + height * 0.56));

    this.drawRoundedRect(x, y, width, height, width * 0.2);
    ctx.fillStyle = color;
    ctx.fill();

    this.drawRoundedRect(x + width * 0.11, y + height * 0.16, width * 0.78, height * 0.27, width * 0.12);
    ctx.fillStyle = glassColor;
    ctx.fill();

    this.drawRoundedRect(x + width * 0.2, y + height * 0.45, width * 0.6, height * 0.3, width * 0.14);
    ctx.fillStyle = roofColor;
    ctx.fill();

    const wheelW = width * 0.16;
    const wheelH = height * 0.2;
    ctx.fillStyle = "#0d1320";
    ctx.fillRect(x - 1, y + height * 0.2, wheelW, wheelH);
    ctx.fillRect(x + width - wheelW + 1, y + height * 0.2, wheelW, wheelH);
    ctx.fillRect(x - 1, y + height * 0.62, wheelW, wheelH);
    ctx.fillRect(x + width - wheelW + 1, y + height * 0.62, wheelW, wheelH);

    ctx.fillStyle = "#fff5d9";
    ctx.fillRect(x + width * 0.12, y + 4, width * 0.18, height * 0.11);
    ctx.fillRect(x + width * 0.7, y + 4, width * 0.18, height * 0.11);
    ctx.fillStyle = "#ff6e64";
    ctx.fillRect(x + width * 0.14, y + height - 8, width * 0.16, 4);
    ctx.fillRect(x + width * 0.7, y + height - 8, width * 0.16, 4);
    ctx.restore();
  }

  drawTrafficAndBonuses() {
    for (const car of this.traffic) {
      const projection = this.projectObject(car.z, car.laneOffset);
      const width = 26 + projection.scale * 32;
      const height = 44 + projection.scale * 56;
      const x = projection.x - width / 2;
      const y = projection.y - height;
      car.rect = { x: x + width * 0.12, y: y + height * 0.14, width: width * 0.76, height: height * 0.76 };
      const tilt = (car.targetLaneOffset - car.laneOffset) * 0.8;
      this.drawCarShadow(projection.x, projection.y - 2, width, height, 0.25);
      this.drawCarSprite(x, y, width, height, car.color, false, tilt);
    }

    const { ctx } = this;
    for (const bonus of this.bonuses) {
      const projection = this.projectObject(bonus.z, bonus.laneOffset);
      const size = 15 + projection.scale * 18;
      const x = projection.x - size / 2;
      const y = projection.y - size * 1.05;
      bonus.rect = { x, y, width: size, height: size };

      ctx.save();
      ctx.beginPath();
      ctx.arc(projection.x, projection.y - size * 0.53, size * 0.58 + Math.sin(bonus.spin) * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = bonus.type === "score" ? "#79f595" : "#ffd369";
      ctx.shadowColor = bonus.type === "score" ? "#79f595" : "#ffd369";
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#0b111d";
      ctx.font = `bold ${Math.max(10, size * 0.46)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(bonus.type === "score" ? "+" : "S", projection.x, projection.y - size * 0.53 + 0.5);
      ctx.restore();
    }
  }

  drawPlayerCar() {
    this.playerRect = this.getPlayerRenderRect();
    const { x, y, width, height } = this.playerRect;
    this.drawCarShadow(x + width / 2, y + height - 8, width * 1.1, height * 1.1, 0.32);
    this.drawCarSprite(x, y, width, height, this.getPlayerColor(), true, this.playerTilt);
  }

  drawCrashEffect(delta) {
    if (this.crashFlash <= 0) return;
    this.crashFlash = Math.max(0, this.crashFlash - delta * 2.35);
    this.ctx.fillStyle = `rgba(255, 90, 90, ${this.crashFlash * 0.5})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(delta) {
    const shakeX = this.cameraShake > 0.01 ? (Math.random() * 2 - 1) * this.cameraShake : 0;
    const shakeY = this.cameraShake > 0.01 ? (Math.random() * 2 - 1) * this.cameraShake * 0.7 : 0;

    this.ctx.save();
    this.ctx.translate(shakeX, shakeY);
    this.drawBackground();
    this.drawRoadAndShoulders();
    this.drawRoadsideProps();
    this.drawTrafficAndBonuses();
    this.drawPlayerCar();
    this.ctx.restore();
    this.drawCrashEffect(delta);
  }

  loop(timestamp) {
    if (!this.lastTime) this.lastTime = timestamp;
    const delta = Math.min(0.033, (timestamp - this.lastTime) / 1000);
    this.lastTime = timestamp;
    this.update(delta);
    this.render(delta);
    requestAnimationFrame(this.loop);
  }
}

new Game();
