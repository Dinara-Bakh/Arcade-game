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
    this.beep({ freq: 860, duration: 0.12, type: "triangle", gain: 0.04 });
  }

  playCrash() {
    this.beep({ freq: 140, duration: 0.25, type: "sawtooth", gain: 0.06 });
  }
}

const DIFFICULTY = {
  easy: {
    baseSpeed: 160,
    maxSpeed: 360,
    acceleration: 4.2,
    spawnFactor: 1.15,
    scoreFactor: 0.08,
  },
  normal: {
    baseSpeed: 180,
    maxSpeed: 420,
    acceleration: 6,
    spawnFactor: 1,
    scoreFactor: 0.09,
  },
  hard: {
    baseSpeed: 210,
    maxSpeed: 500,
    acceleration: 8.2,
    spawnFactor: 0.85,
    scoreFactor: 0.11,
  },
};

const THEMES = {
  neon: {
    sky: "#0f1423",
    road: "#1f2538",
    roadLine: "#d5d7dd",
    laneLine: "rgba(242, 242, 242, 0.7)",
    carColor: "#56f3ff",
    borderColor: "#d5d7dd",
  },
  sunset: {
    sky: "#2a1734",
    road: "#3a2948",
    roadLine: "#ffe6a7",
    laneLine: "rgba(255, 227, 160, 0.72)",
    carColor: "#ff7f66",
    borderColor: "#ffcf7a",
  },
  midnight: {
    sky: "#070b16",
    road: "#1a202f",
    roadLine: "#9aa7c7",
    laneLine: "rgba(174, 193, 230, 0.65)",
    carColor: "#8ac6ff",
    borderColor: "#9aa7c7",
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

    this.startScreen = document.getElementById("startScreen");
    this.pauseScreen = document.getElementById("pauseScreen");
    this.gameOverScreen = document.getElementById("gameOverScreen");
    this.playButton = document.getElementById("playButton");
    this.restartButton = document.getElementById("restartButton");
    this.difficultySelect = document.getElementById("difficultySelect");
    this.themeSelect = document.getElementById("themeSelect");

    this.touchLeft = document.getElementById("touchLeft");
    this.touchRight = document.getElementById("touchRight");

    this.sound = new SoundEngine();

    this.keys = {
      left: false,
      right: false,
    };

    this.state = "menu";
    this.lastTime = 0;
    this.roadOffset = 0;
    this.spawnTimer = 0;
    this.bonusSpawnTimer = 0;
    this.distance = 0;
    this.score = 0;
    this.speed = 180;
    this.baseSpeed = 180;
    this.maxSpeed = 420;
    this.acceleration = 6;
    this.scoreFactor = 0.09;
    this.spawnFactor = 1;
    this.crashFlash = 0;
    this.bestScore = this.loadBestScore();
    this.selectedDifficulty = "normal";
    this.selectedTheme = "neon";
    this.theme = THEMES.neon;

    this.obstacles = [];
    this.bonuses = [];

    this.laneCount = 3;
    this.roadWidth = this.canvas.width * 0.72;
    this.roadX = (this.canvas.width - this.roadWidth) / 2;

    this.car = {
      width: 42,
      height: 76,
      lane: 1,
      x: 0,
      y: this.canvas.height - 120,
      color: this.theme.carColor,
      moveSpeed: 340,
    };

    this.updateCarX();
    this.bindEvents();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  bindEvents() {
    this.playButton.addEventListener("click", () => this.startGame());
    this.restartButton.addEventListener("click", () => this.startGame());
    this.difficultySelect.addEventListener("change", () => this.applySelectedDifficulty());
    this.themeSelect.addEventListener("change", () => this.applySelectedTheme());

    window.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (key === "escape") {
        this.togglePause();
        return;
      }

      if (this.state !== "running") return;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") this.keys.left = true;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") this.keys.right = true;
    });

    window.addEventListener("keyup", (event) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") this.keys.left = false;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") this.keys.right = false;
    });

    this.bindTouch(this.touchLeft, "left");
    this.bindTouch(this.touchRight, "right");
    this.updateHud();
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

  startGame() {
    this.sound.init();
    if (this.sound.audioContext?.state === "suspended") this.sound.audioContext.resume();
    this.applySelectedDifficulty();
    this.applySelectedTheme();

    this.state = "running";
    this.lastTime = 0;
    this.roadOffset = 0;
    this.spawnTimer = 0;
    this.bonusSpawnTimer = 0;
    this.distance = 0;
    this.score = 0;
    this.speed = this.baseSpeed;
    this.crashFlash = 0;
    this.obstacles = [];
    this.bonuses = [];
    this.car.lane = 1;
    this.car.color = this.theme.carColor;
    this.updateCarX();
    this.setOverlay(this.startScreen, false);
    this.setOverlay(this.pauseScreen, false);
    this.setOverlay(this.gameOverScreen, false);
    this.updateHud();
  }

  endGame() {
    this.state = "gameover";
    this.crashFlash = 1;
    this.sound.playCrash();
    this.checkAndSaveBestScore();
    this.finalScoreEl.textContent = Math.floor(this.score);
    this.finalBestScoreEl.textContent = this.bestScore;
    this.setOverlay(this.gameOverScreen, true);
  }

  togglePause() {
    if (this.state === "running") {
      this.state = "paused";
      this.setOverlay(this.pauseScreen, true);
      this.keys.left = false;
      this.keys.right = false;
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

  loadBestScore() {
    try {
      return Number(localStorage.getItem("neon-runner-best-score")) || 0;
    } catch {
      return 0;
    }
  }

  checkAndSaveBestScore() {
    const rounded = Math.floor(this.score);
    if (rounded <= this.bestScore) return;
    this.bestScore = rounded;
    try {
      localStorage.setItem("neon-runner-best-score", String(this.bestScore));
    } catch {
      // Игнорируем недоступность localStorage в приватном режиме.
    }
  }

  applySelectedDifficulty() {
    const selected = this.difficultySelect.value in DIFFICULTY ? this.difficultySelect.value : "normal";
    this.selectedDifficulty = selected;
    const config = DIFFICULTY[selected];
    this.baseSpeed = config.baseSpeed;
    this.maxSpeed = config.maxSpeed;
    this.acceleration = config.acceleration;
    this.spawnFactor = config.spawnFactor;
    this.scoreFactor = config.scoreFactor;
  }

  applySelectedTheme() {
    const selected = this.themeSelect.value in THEMES ? this.themeSelect.value : "neon";
    this.selectedTheme = selected;
    this.theme = THEMES[selected];
    this.car.color = this.theme.carColor;
  }

  updateCarX() {
    const laneWidth = this.roadWidth / this.laneCount;
    const laneCenter = this.roadX + laneWidth * this.car.lane + laneWidth / 2;
    this.car.x = laneCenter - this.car.width / 2;
  }

  addObstacle() {
    const lane = Math.floor(Math.random() * this.laneCount);
    const laneWidth = this.roadWidth / this.laneCount;
    const x = this.roadX + lane * laneWidth + laneWidth / 2 - 20;
    const speedBoost = 40 + Math.random() * 80;
    this.obstacles.push({
      x,
      y: -90,
      width: 40,
      height: 72,
      speed: this.speed + speedBoost,
      color: `hsl(${Math.floor(Math.random() * 360)}, 85%, 60%)`,
    });
  }

  addBonus() {
    const lane = Math.floor(Math.random() * this.laneCount);
    const laneWidth = this.roadWidth / this.laneCount;
    const x = this.roadX + lane * laneWidth + laneWidth / 2 - 15;
    const type = Math.random() < 0.5 ? "score" : "boost";
    this.bonuses.push({
      x,
      y: -50,
      width: 30,
      height: 30,
      speed: this.speed + 70,
      type,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  movePlayer(delta) {
    const moveDelta = this.car.moveSpeed * delta;
    if (this.keys.left) this.car.x -= moveDelta;
    if (this.keys.right) this.car.x += moveDelta;

    const minX = this.roadX + 8;
    const maxX = this.roadX + this.roadWidth - this.car.width - 8;
    this.car.x = Math.max(minX, Math.min(maxX, this.car.x));
  }

  update(delta) {
    if (this.state !== "running") return;

    this.speed = Math.min(this.maxSpeed, this.speed + delta * this.acceleration);
    this.distance += this.speed * delta * 0.1;
    this.score += this.speed * delta * this.scoreFactor;
    this.roadOffset += this.speed * delta;

    this.spawnTimer += delta;
    this.bonusSpawnTimer += delta;

    if (this.spawnTimer > Math.max(0.38, (1.35 - this.speed / 350) * this.spawnFactor)) {
      this.addObstacle();
      this.spawnTimer = 0;
    }

    if (this.bonusSpawnTimer > 3.2) {
      this.addBonus();
      this.bonusSpawnTimer = 0;
    }

    this.movePlayer(delta);
    this.updateObjects(delta);
    this.checkCollisions();
    this.updateHud();
  }

  updateObjects(delta) {
    const offscreenY = this.canvas.height + 120;

    for (const obstacle of this.obstacles) obstacle.y += obstacle.speed * delta;
    for (const bonus of this.bonuses) {
      bonus.y += bonus.speed * delta;
      bonus.pulse += delta * 8;
    }

    this.obstacles = this.obstacles.filter((item) => item.y < offscreenY);
    this.bonuses = this.bonuses.filter((item) => item.y < offscreenY);
  }

  collides(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  checkCollisions() {
    const carBox = {
      x: this.car.x + 4,
      y: this.car.y + 6,
      width: this.car.width - 8,
      height: this.car.height - 12,
    };

    for (const obstacle of this.obstacles) {
      if (this.collides(carBox, obstacle)) {
        this.endGame();
        return;
      }
    }

    this.bonuses = this.bonuses.filter((bonus) => {
      if (!this.collides(carBox, bonus)) return true;

      if (bonus.type === "score") this.score += 120;
      if (bonus.type === "boost") this.speed = Math.min(this.maxSpeed, this.speed + 65);
      this.sound.playBonus();
      return false;
    });
  }

  updateHud() {
    this.scoreValueEl.textContent = Math.floor(this.score);
    this.bestScoreValueEl.textContent = this.bestScore;
    this.speedValueEl.textContent = `${Math.floor(this.speed)} км/ч`;
  }

  drawRoad() {
    const { ctx, canvas, roadX, roadWidth } = this;
    ctx.fillStyle = this.theme.sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = this.theme.road;
    ctx.fillRect(roadX, 0, roadWidth, canvas.height);

    ctx.fillStyle = this.theme.borderColor;
    ctx.fillRect(roadX - 4, 0, 4, canvas.height);
    ctx.fillRect(roadX + roadWidth, 0, 4, canvas.height);

    const laneWidth = roadWidth / this.laneCount;
    ctx.strokeStyle = this.theme.laneLine;
    ctx.lineWidth = 3;
    ctx.setLineDash([26, 24]);
    ctx.lineDashOffset = -this.roadOffset;
    for (let i = 1; i < this.laneCount; i += 1) {
      const laneX = roadX + laneWidth * i;
      ctx.beginPath();
      ctx.moveTo(laneX, 0);
      ctx.lineTo(laneX, canvas.height);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  drawPlayer() {
    const { ctx, car } = this;
    ctx.save();
    ctx.fillStyle = car.color;
    ctx.fillRect(car.x, car.y, car.width, car.height);

    ctx.fillStyle = "#0d1323";
    ctx.fillRect(car.x + 8, car.y + 12, car.width - 16, 22);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(car.x + 5, car.y + 6, 8, 13);
    ctx.fillRect(car.x + car.width - 13, car.y + 6, 8, 13);
    ctx.restore();
  }

  drawObstacle(obstacle) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = obstacle.color;
    ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    ctx.fillStyle = "#151b2d";
    ctx.fillRect(obstacle.x + 7, obstacle.y + 10, obstacle.width - 14, 20);
    ctx.restore();
  }

  drawBonus(bonus) {
    const { ctx } = this;
    const grow = 3 + Math.sin(bonus.pulse) * 2;
    const cx = bonus.x + bonus.width / 2;
    const cy = bonus.y + bonus.height / 2;

    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = bonus.type === "score" ? "#75f08a" : "#ffd166";
    ctx.arc(cx, cy, 11 + grow * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#09111f";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(bonus.type === "score" ? "+" : "S", cx, cy + 0.5);
    ctx.restore();
  }

  drawCrashEffect(delta) {
    if (this.crashFlash <= 0) return;
    this.crashFlash = Math.max(0, this.crashFlash - delta * 2.2);
    const alpha = this.crashFlash * 0.45;
    this.ctx.fillStyle = `rgba(255, 80, 80, ${alpha})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(delta) {
    this.drawRoad();
    for (const obstacle of this.obstacles) this.drawObstacle(obstacle);
    for (const bonus of this.bonuses) this.drawBonus(bonus);
    this.drawPlayer();
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
