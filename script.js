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
    this.beep({ freq: 820, duration: 0.11, type: "triangle", gain: 0.04 });
  }

  playCrash() {
    this.beep({ freq: 120, duration: 0.28, type: "sawtooth", gain: 0.06 });
  }
}

const DIFFICULTY = {
  easy: {
    baseSpeed: 155,
    maxSpeed: 360,
    acceleration: 4.2,
    spawnFactor: 1.22,
    scoreFactor: 0.08,
  },
  normal: {
    baseSpeed: 185,
    maxSpeed: 430,
    acceleration: 6,
    spawnFactor: 1,
    scoreFactor: 0.095,
  },
  hard: {
    baseSpeed: 220,
    maxSpeed: 520,
    acceleration: 8.4,
    spawnFactor: 0.84,
    scoreFactor: 0.115,
  },
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

    this.keys = { left: false, right: false };
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
    this.crashFlash = 0;
    this.playerTilt = 0;
    this.cameraShake = 0;
    this.mouseControl = {
      active: false,
      targetX: 0,
    };

    this.theme = THEMES.neon;
    this.player = {
      x: 0,
      y: this.canvas.height - 148,
      width: 58,
      height: 108,
      moveSpeed: 1.85,
    };
    this.playerRect = { x: 0, y: 0, width: 0, height: 0 };

    this.horizonY = 126;
    this.roadTopWidth = 128;
    this.roadBottomWidth = this.canvas.width * 0.86;
    this.roadScroll = 0;

    this.traffic = [];
    this.bonuses = [];
    this.props = [];
    this.spawnTimer = 0;
    this.bonusSpawnTimer = 0;
    this.propSpawnTimer = 0;

    this.applySelectedDifficulty();
    this.applySelectedTheme();
    this.bindEvents();
    this.updateHud();

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

  getPlayerXFromPointer(pointerX, canvasClientWidth) {
    const canvasX = (pointerX / canvasClientWidth) * this.canvas.width;
    const y = this.player.y;
    const roadWidth = this.getRoadWidthAt(y);
    const center = this.getRoadCenterAt(y);
    const normalized = (canvasX - center) / (roadWidth * 0.36);
    return Math.max(-0.85, Math.min(0.85, normalized));
  }

  applySelectedDifficulty() {
    const value = this.difficultySelect?.value;
    const config = DIFFICULTY[value] || DIFFICULTY.normal;
    this.baseSpeed = config.baseSpeed;
    this.maxSpeed = config.maxSpeed;
    this.acceleration = config.acceleration;
    this.spawnFactor = config.spawnFactor;
    this.scoreFactor = config.scoreFactor;
  }

  applySelectedTheme() {
    const value = this.themeSelect?.value;
    this.theme = THEMES[value] || THEMES.neon;
  }

  startGame() {
    this.sound.init();
    if (this.sound.audioContext?.state === "suspended") this.sound.audioContext.resume();
    this.applySelectedDifficulty();
    this.applySelectedTheme();

    this.state = "running";
    this.keys.left = false;
    this.keys.right = false;
    this.lastTime = 0;
    this.distance = 0;
    this.score = 0;
    this.speed = this.baseSpeed;
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
    this.checkAndSaveBestScore();

    this.finalScoreEl.textContent = Math.floor(this.score);
    this.finalBestScoreEl.textContent = this.bestScore;
    this.setOverlay(this.gameOverScreen, true);
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
      // Если localStorage отключен, просто пропускаем сохранение.
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

    const trafficInterval = Math.max(0.46, (1.24 - this.speed / 420) * this.spawnFactor);
    if (this.spawnTimer > trafficInterval) {
      this.spawnTrafficCar();
      this.spawnTimer = 0;
    }

    if (this.bonusSpawnTimer > 2.7) {
      this.spawnBonus();
      this.bonusSpawnTimer = 0;
    }

    if (this.propSpawnTimer > 0.35) {
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
      const lerpFactor = Math.min(1, delta * 9.5);
      this.player.x += (this.mouseControl.targetX - this.player.x) * lerpFactor;
    } else {
      this.player.x += input * this.player.moveSpeed * delta;
    }

    this.player.x = Math.max(-0.85, Math.min(0.85, this.player.x));
    const lateralSpeed = (this.player.x - prevX) / Math.max(delta, 0.0001);
    const targetTilt = Math.max(-0.22, Math.min(0.22, lateralSpeed * 0.12));
    this.playerTilt += (targetTilt - this.playerTilt) * Math.min(1, delta * 9);
  }

  spawnTrafficCar() {
    const lanes = [-0.62, 0, 0.62];
    this.traffic.push({
      z: 0.02,
      laneOffset: lanes[Math.floor(Math.random() * lanes.length)] + (Math.random() - 0.5) * 0.09,
      speedFactor: 0.72 + Math.random() * 0.75,
      color: `hsl(${Math.floor(Math.random() * 360)}, 75%, 62%)`,
      rect: null,
    });
  }

  spawnBonus() {
    const lanes = [-0.62, 0, 0.62];
    const type = Math.random() < 0.58 ? "score" : "boost";
    this.bonuses.push({
      z: 0.04,
      laneOffset: lanes[Math.floor(Math.random() * lanes.length)] + (Math.random() - 0.5) * 0.05,
      spin: Math.random() * Math.PI * 2,
      type,
      rect: null,
    });
  }

  spawnRoadsideObject() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const kind = Math.random() < 0.7 ? "tree" : "sign";
    this.props.push({
      z: 0.03,
      side,
      kind,
      wobble: Math.random() * Math.PI * 2,
    });
  }

  updateWorldObjects(delta) {
    const speedScale = this.speed / 320;

    for (const traffic of this.traffic) {
      traffic.z += delta * speedScale * traffic.speedFactor;
    }
    for (const bonus of this.bonuses) {
      bonus.z += delta * speedScale * 0.95;
      bonus.spin += delta * 8;
    }
    for (const prop of this.props) {
      prop.z += delta * speedScale * (0.85 + (prop.kind === "tree" ? 0 : 0.1));
      prop.wobble += delta * 3;
    }

    this.traffic = this.traffic.filter((item) => item.z < 1.12);
    this.bonuses = this.bonuses.filter((item) => item.z < 1.12);
    this.props = this.props.filter((item) => item.z < 1.15);
  }

  updateCameraEffects(delta) {
    const speedRatio = this.speed / this.maxSpeed;
    const targetShake = speedRatio > 0.72 ? (speedRatio - 0.72) * 5.2 : 0;
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
    const x = center + this.player.x * roadWidth * 0.36;
    const width = this.player.width;
    const height = this.player.height;
    return { x: x - width / 2, y, width, height };
  }

  collides(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  checkCollisions() {
    const playerRect = this.playerRect;
    const carHitbox = {
      x: playerRect.x + 7,
      y: playerRect.y + 12,
      width: playerRect.width - 14,
      height: playerRect.height - 18,
    };

    for (const traffic of this.traffic) {
      if (!traffic.rect) continue;
      if (this.collides(carHitbox, traffic.rect)) {
        this.endGame();
        return;
      }
    }

    this.bonuses = this.bonuses.filter((bonus) => {
      if (!bonus.rect) return true;
      if (!this.collides(carHitbox, bonus.rect)) return true;

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

    ctx.fillStyle = theme.grassDark;
    ctx.fillRect(0, this.horizonY, canvas.width, canvas.height - this.horizonY);

    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 4; i += 1) {
      const peak = 48 + i * 18;
      ctx.beginPath();
      ctx.moveTo(i * 130 - 40, this.horizonY);
      ctx.lineTo(i * 130 + 60, this.horizonY - peak);
      ctx.lineTo(i * 130 + 160, this.horizonY);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? "#1c2f25" : "#24382c";
      ctx.fill();
    }

    const skylineY = this.horizonY - 12;
    const skylineShift = (this.distance * 0.03) % 44;
    for (let x = -44 + skylineShift; x < canvas.width + 44; x += 26) {
      const h = 9 + ((x * 17) % 24);
      ctx.fillStyle = "rgba(16, 24, 42, 0.76)";
      ctx.fillRect(x, skylineY - h, 18, h);
      if (h > 14) {
        ctx.fillStyle = "rgba(255, 240, 180, 0.25)";
        ctx.fillRect(x + 4, skylineY - h + 4, 2, 2);
        ctx.fillRect(x + 10, skylineY - h + 9, 2, 2);
      }
    }
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

      const shoulderWidth = roadWidth * 0.13;
      const laneWidth = roadWidth / 3;

      const grassBand = ((y + this.roadScroll * 0.9) % 42) < 21;
      ctx.fillStyle = grassBand ? theme.grass : theme.grassDark;
      ctx.fillRect(0, y, canvas.width, 2);

      const shoulderAlt =
        ((Math.floor((y + this.roadScroll) / shoulderSegments) + (y % 2)) % 2) === 0
          ? theme.shoulder
          : theme.shoulderAlt;
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

  drawRoadsideProps() {
    const { ctx } = this;
    for (const prop of this.props) {
      const p = this.projectObject(prop.z, prop.side * 1.35, 0.5);
      const base = 8 + p.scale * 26;
      const trunkW = Math.max(2, p.scale * 5);
      const trunkH = p.scale * 15;

      if (prop.kind === "tree") {
        ctx.fillStyle = "#593b24";
        ctx.fillRect(p.x - trunkW / 2, p.y - trunkH, trunkW, trunkH);
        ctx.beginPath();
        ctx.fillStyle = prop.side > 0 ? "#2ba35f" : "#32b46b";
        ctx.arc(p.x, p.y - trunkH - base * 0.5, base * 0.75, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#d8e8f8";
        this.drawRoundedRect(p.x - base * 0.35, p.y - base * 1.45, base * 0.7, base * 0.55, 3);
        ctx.fill();
        ctx.fillStyle = "#2f3f5d";
        ctx.fillRect(p.x - 1.5, p.y - base * 0.9, 3, base * 0.9);
      }
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
    const bodyColor = color;
    const roofColor = isPlayer ? "#c6f7ff" : "#e7f0ff";
    const glassColor = isPlayer ? "#15374c" : "#1f2f4b";

    ctx.save();
    ctx.translate(x + width / 2, y + height * 0.56);
    ctx.rotate(tilt);
    ctx.translate(-(x + width / 2), -(y + height * 0.56));

    this.drawRoundedRect(x, y, width, height, width * 0.2);
    ctx.fillStyle = bodyColor;
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
      this.drawCarShadow(projection.x, projection.y - 2, width, height, 0.24);
      this.drawCarSprite(x, y, width, height, car.color, false, 0);
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
    this.drawCarSprite(x, y, width, height, this.theme.playerCar, true, this.playerTilt);
  }

  drawCrashEffect(delta) {
    if (this.crashFlash <= 0) return;
    this.crashFlash = Math.max(0, this.crashFlash - delta * 2.35);
    const alpha = this.crashFlash * 0.5;
    this.ctx.fillStyle = `rgba(255, 90, 90, ${alpha})`;
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
