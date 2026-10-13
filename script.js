
const videoElement = document.getElementsByClassName('input_video')[0];
const canvasElement = document.getElementsByClassName('output_canvas')[0];
const canvasCtx = canvasElement.getContext('2d');
const canvasFrameElement = canvasElement.closest('.canvas-frame');
const playPauseButton = document.getElementById('btn-playpause');
const footageButton = document.getElementById('btn-footage');
const modeButton = document.getElementById('btn-mode');
const playerScoreElement = document.getElementById('player-score');
const aiScoreElement = document.getElementById('ai-score');
const trackingStatusElement = document.getElementById('tracking-status');
const trackingLabelElement = document.getElementById('status-label');
const trackingMessageElement = document.getElementById('status-message');
const liveBadgeElement = document.getElementById('live-badge');
const switchSidesButton = document.getElementById('btn-switch');
const restartButton = document.getElementById('btn-restart');
const playAgainButton = document.getElementById('btn-play-again');
const matchSettingsButton = document.getElementById('btn-match-settings');
const resultOverlayElement = document.getElementById('result-overlay');
const resultTitleElement = document.getElementById('result-title');
const resultMetaElement = document.getElementById('result-meta');
const finalPlayerScoreElement = document.getElementById('final-player-score');
const finalAiScoreElement = document.getElementById('final-ai-score');
const activeDifficultyElement = document.getElementById('active-difficulty');
const activeTargetElement = document.getElementById('active-target');
const settingsCardElement = document.querySelector('.settings-card');
const settingsStateElement = document.getElementById('settings-state');
const settingsNoteElement = document.getElementById('settings-note');
const audioButton = document.getElementById('btn-audio');
const scoreFeedbackElement = document.getElementById('score-feedback');
const playerScoreContainer = document.querySelector('.score-player');
const aiScoreContainer = document.querySelector('.score-ai');
const difficultyInputs = [...document.querySelectorAll('input[name="difficulty"]')];
const winningScoreInputs = [...document.querySelectorAll('input[name="winning-score"]')];

// --- REAL-TIME TRACKING STATUS ---
const TRACKING_READY_DURATION = 1800;
const HAND_LOST_GRACE_PERIOD = 800;
const HAND_CONFIRMATION_FRAMES = 2;
let trackingState = 'initializing';
let modelReadyAt = 0;
let lastHandSeenAt = 0;
let consecutiveHandFrames = 0;

const trackingCopy = {
    initializing: {
        label: 'Camera Initializing',
        message: 'Allow camera access while the sensor gets ready.',
        badge: 'Sensor starting'
    },
    ready: {
        label: 'Camera Ready',
        message: 'Camera and hand-tracking model are ready.',
        badge: 'Live tracking'
    },
    detected: {
        label: 'Hand Detected',
        message: 'Tracking is active. Move your index finger to play.',
        badge: 'Hand linked'
    },
    'not-detected': {
        label: 'Hand Not Detected',
        message: 'Show one hand clearly inside the camera frame.',
        badge: 'Live tracking'
    },
    error: {
        label: 'Camera Error',
        message: 'Camera access failed. Check browser permission and reload.',
        badge: 'Sensor offline'
    }
};

function setTrackingStatus(state, customMessage = '') {
    const copy = trackingCopy[state];
    if (!copy) return;

    const nextMessage = customMessage || copy.message;
    if (trackingState === state && trackingMessageElement.textContent === nextMessage) return;

    trackingState = state;
    trackingStatusElement.dataset.state = state;
    trackingLabelElement.textContent = copy.label;
    trackingMessageElement.textContent = nextMessage;
    liveBadgeElement.dataset.state = state;
    liveBadgeElement.querySelector('b').textContent = copy.badge;
}

function updateTrackingStatus(results) {
    if (trackingState === 'error') return;

    const now = performance.now();
    const hasHand = Boolean(results.multiHandLandmarks?.[0]?.[8]);

    if (!modelReadyAt) {
        modelReadyAt = now;
        setTrackingStatus('ready');
    }

    if (hasHand) {
        lastHandSeenAt = now;
        consecutiveHandFrames += 1;
        if (consecutiveHandFrames >= HAND_CONFIRMATION_FRAMES) {
            setTrackingStatus('detected');
        }
        return;
    }

    consecutiveHandFrames = 0;
    const handRecentlyVisible = lastHandSeenAt && now - lastHandSeenAt < HAND_LOST_GRACE_PERIOD;
    if (trackingState === 'detected' && handRecentlyVisible) return;

    if (lastHandSeenAt || now - modelReadyAt >= TRACKING_READY_DURATION) {
        setTrackingStatus('not-detected');
    }
}

function getCameraErrorMessage(error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
        return 'Camera permission was denied. Allow access in your browser, then reload.';
    }
    if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
        return 'No camera was found. Connect a camera, then reload the page.';
    }
    if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError') {
        return 'The camera is in use by another app. Close it there, then reload.';
    }
    return 'Camera or hand tracking could not start. Check access and reload the page.';
}

// --- AUDIO SYSTEM (Web Audio API) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;
let audioMasterGain;
const AUDIO_PREFERENCE_KEY = 'gesture-pong-muted';
let isMuted = readMutePreference();

function readMutePreference() {
    try {
        return window.localStorage.getItem(AUDIO_PREFERENCE_KEY) === 'true';
    } catch (error) {
        return false;
    }
}

function saveMutePreference() {
    try {
        window.localStorage.setItem(AUDIO_PREFERENCE_KEY, String(isMuted));
    } catch (error) {
        // Storage can be unavailable in privacy modes; audio still works for this session.
    }
}

function syncAudioControl() {
    audioButton.classList.toggle('is-muted', isMuted);
    audioButton.setAttribute('aria-pressed', String(isMuted));
    audioButton.setAttribute('aria-label', isMuted ? 'Unmute sound' : 'Mute sound');
    audioButton.querySelector('span').textContent = isMuted ? 'Muted' : 'Sound On';
}

function initAudio() {
    if (!AudioContext || isMuted) return;
    if (!audioCtx) {
        audioCtx = new AudioContext();
        audioMasterGain = audioCtx.createGain();
        audioMasterGain.gain.value = 1;
        audioMasterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
}

function playTone(freq, type, duration, vol = 0.1, freqSweep = null) {
    if (!audioCtx || !audioMasterGain || isMuted) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);

    if (freqSweep) {
        oscillator.frequency.exponentialRampToValueAtTime(freqSweep, audioCtx.currentTime + duration);
    }

    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioMasterGain);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

const sfx = {
    paddle: () => playTone(600, 'square', 0.1),
    wall: () => playTone(300, 'square', 0.1),
    // Friendly, happy double-beep for the player
    playerScore: () => {
        playTone(600, 'sine', 0.1, 0.15, 800);
        setTimeout(() => playTone(800, 'sine', 0.2, 0.15, 1200), 100);
    },
    // Dull, sad descending tone for the AI
    aiScore: () => playTone(150, 'sawtooth', 0.4, 0.2, 50),
    start: () => playTone(400, 'square', 0.3, 0.1, 800)
};

function setMuted(nextMuted) {
    isMuted = Boolean(nextMuted);
    if (!isMuted) initAudio();
    if (audioCtx && audioMasterGain) {
        audioMasterGain.gain.cancelScheduledValues(audioCtx.currentTime);
        audioMasterGain.gain.setTargetAtTime(isMuted ? 0 : 1, audioCtx.currentTime, 0.01);
    }
    saveMutePreference();
    syncAudioControl();
}

// --- FEATURE STATES ---
let showFootage = true;
let isVertical = false;
let isSwapped = true;

const MATCH_STATES = Object.freeze({
    IDLE: 'idle',
    PLAYING: 'playing',
    PAUSED: 'paused',
    FINISHED: 'finished'
});

const DIFFICULTY_LEVELS = Object.freeze({
    easy: Object.freeze({
        label: 'Easy',
        speed: 5,
        tolerance: 34,
        reactionDelay: 180,
        predictionFrames: 0,
        errorMargin: 24
    }),
    normal: Object.freeze({
        label: 'Normal',
        speed: 8,
        tolerance: 15,
        reactionDelay: 0,
        predictionFrames: 0,
        errorMargin: 0
    }),
    hard: Object.freeze({
        label: 'Hard',
        speed: 11,
        tolerance: 7,
        reactionDelay: 0,
        predictionFrames: 5,
        errorMargin: 0
    })
});

let matchState = MATCH_STATES.IDLE;
let activeDifficulty = 'normal';
let winningScore = 5;

const COUNTDOWN_STEPS = Object.freeze(['3', '2', '1', 'GO!']);
const COUNTDOWN_STEP_DURATION = 700;
const countdown = {
    active: false,
    stepIndex: 0,
    stepElapsed: 0,
    lastUpdatedAt: 0
};

const PADDLE_LONG = 100;
const PADDLE_SHORT = 20;

// --- KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'p') {
        document.getElementById('btn-playpause').click();
    }
});

// --- BUTTON EVENT LISTENERS ---
playPauseButton.addEventListener('click', () => {
    if (matchState === MATCH_STATES.FINISHED) return;

    initAudio();
    if (matchState === MATCH_STATES.PLAYING) {
        setMatchState(MATCH_STATES.PAUSED);
    } else if (matchState === MATCH_STATES.PAUSED) {
        setMatchState(MATCH_STATES.PLAYING);
        sfx.start();
    } else {
        beginCountdown();
        sfx.start();
    }
});

footageButton.addEventListener('click', () => {
    showFootage = !showFootage;
    footageButton.querySelector('span').textContent = showFootage ? 'Hide Camera' : 'Show Camera';
    footageButton.setAttribute('aria-pressed', String(showFootage));
});

modeButton.addEventListener('click', () => {
    cancelCountdown();
    isVertical = !isVertical;
    modeButton.setAttribute('aria-pressed', String(isVertical));
    modeButton.setAttribute('aria-label', isVertical ? 'Rotate screen to horizontal mode' : 'Rotate screen to vertical mode');
    updatePaddleDimensions();
    resetGame();
});

switchSidesButton.addEventListener('click', () => {
    cancelCountdown();
    isSwapped = !isSwapped;
    resetGame();
});

audioButton.addEventListener('click', () => {
    setMuted(!isMuted);
});

difficultyInputs.forEach((input) => {
    input.addEventListener('change', () => {
        if (matchState !== MATCH_STATES.IDLE || !DIFFICULTY_LEVELS[input.value]) return;
        activeDifficulty = input.value;
        updateMatchSummary();
        resetAiDecision();
    });
});

winningScoreInputs.forEach((input) => {
    input.addEventListener('change', () => {
        if (matchState !== MATCH_STATES.IDLE) return;
        const nextScore = Number(input.value);
        if (nextScore !== 5 && nextScore !== 10) return;
        winningScore = nextScore;
        updateMatchSummary();
    });
});

restartButton.addEventListener('click', () => {
    restartMatch(false);
});

playAgainButton.addEventListener('click', () => {
    initAudio();
    restartMatch(true);
    sfx.start();
});

matchSettingsButton.addEventListener('click', () => {
    restartMatch(false);
    document.querySelector(`input[name="difficulty"][value="${activeDifficulty}"]`)?.focus();
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
        canvasFrameElement.requestFullscreen().catch(err => {
            console.log(`Error attempting to enable fullscreen: ${err.message}`);
        });
    } else {
        document.exitFullscreen();
    }
});

document.addEventListener('fullscreenchange', () => {
    const fullscreenButton = document.getElementById('btn-fullscreen');
    fullscreenButton.querySelector('span').textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
    fullscreenButton.setAttribute('aria-pressed', String(Boolean(document.fullscreenElement)));
});

// --- PHYSICS SETTINGS ---
const SUBSTEPS = 10;

// --- POINTER TRACKING VARIABLES ---
let targetPointerX = 320;
let targetPointerY = 240;
let currentPointerX = 320;
let currentPointerY = 240;
const SMOOTHING_FACTOR = 0.5;

// --- GAME VARIABLES ---
const ball = { x: 320, y: 240, vx: 0, vy: 0, radius: 10, speed: 5, minSpeed: 6, maxSpeed: 30 };
const player = { width: PADDLE_SHORT, height: PADDLE_LONG, score: 0 };
const ai = {
    x: 600,
    y: 240,
    width: PADDLE_SHORT,
    height: PADDLE_LONG,
    score: 0,
    targetPosition: 240,
    lastDecisionAt: 0
};

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const MAX_TRAIL_POINTS = 14;
const MAX_PARTICLES = 42;
const MAX_IMPACT_PULSES = 8;
const ballTrail = [];
const particles = [];
const impactPulses = [];
let lastFrameAt = 0;
let scoreFeedbackRemaining = 0;

function beginCountdown() {
    clearScoreFeedback();
    clearGameplayEffects();
    countdown.active = true;
    countdown.stepIndex = 0;
    countdown.stepElapsed = 0;
    countdown.lastUpdatedAt = performance.now();
    setMatchState(MATCH_STATES.PLAYING);
}

function cancelCountdown() {
    countdown.active = false;
    countdown.stepIndex = 0;
    countdown.stepElapsed = 0;
    countdown.lastUpdatedAt = 0;
}

function updateCountdown(now) {
    if (!countdown.active) return;

    if (matchState !== MATCH_STATES.PLAYING) {
        countdown.lastUpdatedAt = now;
        return;
    }

    const elapsed = countdown.lastUpdatedAt ? now - countdown.lastUpdatedAt : 0;
    countdown.lastUpdatedAt = now;
    countdown.stepElapsed += Math.min(Math.max(elapsed, 0), 100);

    if (countdown.stepElapsed < COUNTDOWN_STEP_DURATION) return;

    countdown.stepElapsed -= COUNTDOWN_STEP_DURATION;
    countdown.stepIndex += 1;
    if (countdown.stepIndex >= COUNTDOWN_STEPS.length) {
        cancelCountdown();
    }
}

function drawCountdown() {
    if (!countdown.active) return;

    const progress = clamp(countdown.stepElapsed / COUNTDOWN_STEP_DURATION, 0, 1);
    const pulse = prefersReducedMotion.matches ? 1 : 0.88 + Math.sin(progress * Math.PI) * 0.14;
    const opacity = prefersReducedMotion.matches ? 1 : clamp(1 - Math.max(0, progress - 0.72) / 0.28, 0, 1);
    const label = COUNTDOWN_STEPS[countdown.stepIndex];

    canvasCtx.save();
    canvasCtx.fillStyle = 'rgba(5, 9, 20, 0.28)';
    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.translate(canvasElement.width / 2, canvasElement.height / 2);
    canvasCtx.scale(pulse, pulse);
    canvasCtx.globalAlpha = opacity;
    canvasCtx.textAlign = 'center';
    canvasCtx.textBaseline = 'middle';
    canvasCtx.font = `800 ${label === 'GO!' ? 74 : 92}px Inter, system-ui, sans-serif`;
    canvasCtx.fillStyle = label === 'GO!' ? '#38bdf8' : '#f8fafc';
    canvasCtx.shadowBlur = 24;
    canvasCtx.shadowColor = label === 'GO!' ? 'rgba(56, 189, 248, 0.72)' : 'rgba(167, 139, 250, 0.48)';
    canvasCtx.fillText(label, 0, 0);
    canvasCtx.restore();
}

function clearGameplayEffects() {
    ballTrail.length = 0;
    particles.length = 0;
    impactPulses.length = 0;
}

function spawnImpact(x, y, color, strength = 1) {
    if (prefersReducedMotion.matches) return;

    if (impactPulses.length >= MAX_IMPACT_PULSES) impactPulses.shift();
    impactPulses.push({ x, y, radius: 9, life: 1, color });

    const available = MAX_PARTICLES - particles.length;
    const count = Math.min(available, Math.round(5 + strength * 2));
    for (let i = 0; i < count; i += 1) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.45;
        const speed = 42 + Math.random() * 58 * strength;
        particles.push({
            x,
            y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 1.2 + Math.random() * 1.8,
            life: 1,
            color
        });
    }
}

function updateGameplayEffects(deltaMs) {
    const deltaSeconds = Math.min(deltaMs, 100) / 1000;

    for (let i = particles.length - 1; i >= 0; i -= 1) {
        const particle = particles[i];
        particle.x += particle.vx * deltaSeconds;
        particle.y += particle.vy * deltaSeconds;
        particle.life -= deltaSeconds * 3.5;
        if (particle.life <= 0) particles.splice(i, 1);
    }

    for (let i = impactPulses.length - 1; i >= 0; i -= 1) {
        const pulse = impactPulses[i];
        pulse.radius += deltaSeconds * 55;
        pulse.life -= deltaSeconds * 4;
        if (pulse.life <= 0) impactPulses.splice(i, 1);
    }

    if (scoreFeedbackRemaining > 0) {
        scoreFeedbackRemaining -= Math.min(deltaMs, 100);
        if (scoreFeedbackRemaining <= 0) clearScoreFeedback();
    }
}

function captureBallTrail() {
    if (prefersReducedMotion.matches || countdown.active || matchState !== MATCH_STATES.PLAYING) return;
    if (ballTrail.length >= MAX_TRAIL_POINTS) ballTrail.shift();
    ballTrail.push({ x: ball.x, y: ball.y, speed: ball.speed });
}

function drawGameplayEffects() {
    if (ballTrail.length > 1) {
        for (let i = 0; i < ballTrail.length; i += 1) {
            const point = ballTrail[i];
            const progress = (i + 1) / ballTrail.length;
            const speedRatio = clamp((point.speed - ball.minSpeed) / (ball.maxSpeed - ball.minSpeed), 0, 1);
            canvasCtx.beginPath();
            canvasCtx.arc(point.x, point.y, ball.radius * (0.2 + progress * 0.55), 0, Math.PI * 2);
            canvasCtx.fillStyle = `rgba(${speedRatio > 0.55 ? '167, 139, 250' : '56, 189, 248'}, ${progress * 0.22})`;
            canvasCtx.fill();
        }
    }

    impactPulses.forEach((pulse) => {
        canvasCtx.beginPath();
        canvasCtx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
        canvasCtx.strokeStyle = pulse.color;
        canvasCtx.globalAlpha = pulse.life * 0.55;
        canvasCtx.lineWidth = 2;
        canvasCtx.stroke();
    });

    particles.forEach((particle) => {
        canvasCtx.beginPath();
        canvasCtx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        canvasCtx.fillStyle = particle.color;
        canvasCtx.globalAlpha = particle.life * 0.8;
        canvasCtx.fill();
    });
    canvasCtx.globalAlpha = 1;
}

function showScoreFeedback(scorer) {
    const isPlayer = scorer === 'player';
    scoreFeedbackElement.textContent = isPlayer ? 'PLAYER SCORES!' : 'AI SCORES!';
    scoreFeedbackElement.dataset.scorer = scorer;
    scoreFeedbackElement.hidden = false;
    scoreFeedbackRemaining = 900;

    const scoreContainer = isPlayer ? playerScoreContainer : aiScoreContainer;
    playerScoreContainer.classList.remove('is-scoring');
    aiScoreContainer.classList.remove('is-scoring');
    void scoreContainer.offsetWidth;
    scoreContainer.classList.add('is-scoring');
}

function clearScoreFeedback() {
    scoreFeedbackRemaining = 0;
    scoreFeedbackElement.hidden = true;
    scoreFeedbackElement.removeAttribute('data-scorer');
    playerScoreContainer.classList.remove('is-scoring');
    aiScoreContainer.classList.remove('is-scoring');
}

function syncScoreboard() {
    if (playerScoreElement.textContent !== String(player.score)) {
        playerScoreElement.textContent = player.score;
    }
    if (aiScoreElement.textContent !== String(ai.score)) {
        aiScoreElement.textContent = ai.score;
    }
}

function updateMatchSummary() {
    const difficulty = DIFFICULTY_LEVELS[activeDifficulty];
    activeDifficultyElement.textContent = difficulty.label;
    activeTargetElement.textContent = winningScore;
}

function setSettingsLocked(isLocked) {
    [...difficultyInputs, ...winningScoreInputs].forEach((input) => {
        input.disabled = isLocked;
    });
    settingsCardElement.classList.toggle('is-locked', isLocked);

    if (!isLocked) {
        settingsStateElement.textContent = 'Ready';
        settingsNoteElement.textContent = 'Settings lock when the match starts.';
    } else if (matchState === MATCH_STATES.FINISHED) {
        settingsStateElement.textContent = 'Complete';
        settingsNoteElement.textContent = 'Play again or return to settings.';
    } else {
        settingsStateElement.textContent = 'Locked';
        settingsNoteElement.textContent = 'Restart the match to change these settings.';
    }
}

function setMatchState(nextState) {
    if (!Object.values(MATCH_STATES).includes(nextState)) return;

    matchState = nextState;
    if (countdown.active) countdown.lastUpdatedAt = performance.now();
    const isPlaying = matchState === MATCH_STATES.PLAYING;
    const isFinished = matchState === MATCH_STATES.FINISHED;
    const buttonLabels = {
        [MATCH_STATES.IDLE]: 'Start',
        [MATCH_STATES.PLAYING]: 'Pause',
        [MATCH_STATES.PAUSED]: 'Resume',
        [MATCH_STATES.FINISHED]: 'Finished'
    };

    playPauseButton.querySelector('span').textContent = buttonLabels[matchState];
    playPauseButton.classList.toggle('is-playing', isPlaying);
    playPauseButton.setAttribute('aria-pressed', String(isPlaying));
    playPauseButton.disabled = isFinished;
    modeButton.disabled = isFinished;
    switchSidesButton.disabled = isFinished;
    setSettingsLocked(matchState !== MATCH_STATES.IDLE);
}

function hideResultOverlay() {
    resultOverlayElement.hidden = true;
    resultOverlayElement.removeAttribute('data-winner');
}

function finishMatch(winner) {
    cancelCountdown();
    clearScoreFeedback();
    setMatchState(MATCH_STATES.FINISHED);
    resultTitleElement.textContent = winner === 'player' ? 'YOU WIN!' : 'YOU LOSE!';
    finalPlayerScoreElement.textContent = player.score;
    finalAiScoreElement.textContent = ai.score;
    resultMetaElement.textContent = `${DIFFICULTY_LEVELS[activeDifficulty].label} · First to ${winningScore}`;
    resultOverlayElement.dataset.winner = winner;
    resultOverlayElement.hidden = false;
    playAgainButton.focus();
}

function awardPoint(scorer) {
    if (matchState !== MATCH_STATES.PLAYING) return false;

    if (scorer === 'player') {
        player.score += 1;
        sfx.playerScore();
    } else if (scorer === 'ai') {
        ai.score += 1;
        sfx.aiScore();
    } else {
        return false;
    }

    syncScoreboard();
    if (player.score >= winningScore || ai.score >= winningScore) {
        finishMatch(player.score >= winningScore ? 'player' : 'ai');
        return true;
    }

    showScoreFeedback(scorer);
    resetBall();
    return false;
}

function resetAiDecision() {
    ai.targetPosition = isVertical ? ball.x : ball.y;
    ai.lastDecisionAt = 0;
}

function getAiMovement(now = performance.now()) {
    const config = DIFFICULTY_LEVELS[activeDifficulty];
    const ballPosition = isVertical ? ball.x : ball.y;
    const ballVelocity = isVertical ? ball.vx : ball.vy;
    const arenaLimit = isVertical ? canvasElement.width : canvasElement.height;

    if (!ai.lastDecisionAt || now - ai.lastDecisionAt >= config.reactionDelay) {
        const prediction = ballVelocity * config.predictionFrames;
        const aimError = config.errorMargin ? Math.sin(now / 650) * config.errorMargin : 0;
        ai.targetPosition = clamp(ballPosition + prediction + aimError, 0, arenaLimit);
        ai.lastDecisionAt = now;
    }

    const aiPosition = isVertical ? ai.x : ai.y;
    const distance = ai.targetPosition - aiPosition;
    if (Math.abs(distance) <= config.tolerance) return 0;
    return Math.sign(distance) * Math.min(config.speed, Math.abs(distance));
}

function updatePaddleDimensions() {
    player.width = isVertical ? PADDLE_LONG : PADDLE_SHORT;
    player.height = isVertical ? PADDLE_SHORT : PADDLE_LONG;
    ai.width = isVertical ? PADDLE_LONG : PADDLE_SHORT;
    ai.height = isVertical ? PADDLE_SHORT : PADDLE_LONG;
}

function resetGame() {
    clearScoreFeedback();
    player.score = 0;
    ai.score = 0;
    syncScoreboard();
    resetBall();
}

function restartMatch(startPlaying) {
    cancelCountdown();
    clearScoreFeedback();
    player.score = 0;
    ai.score = 0;
    syncScoreboard();
    hideResultOverlay();
    resetBall();
    setMatchState(MATCH_STATES.IDLE);
    if (startPlaying) beginCountdown();
}

function resetBall() {
    clearGameplayEffects();
    ball.x = canvasElement.width / 2;
    ball.y = canvasElement.height / 2;
    ball.speed = ball.minSpeed;

    if (!isVertical) {
        const directionX = isSwapped ? 1 : -1;
        ball.vx = directionX * ball.speed;
        ball.vy = (Math.random() * 2 - 1) * ball.speed * 0.7;
    } else {
        const directionY = isSwapped ? -1 : 1;
        ball.vy = directionY * ball.speed;
        ball.vx = (Math.random() * 2 - 1) * ball.speed * 0.7;
    }

    resetAiDecision();
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function getBallColor(currentSpeed, min, max) {
    const ratio = (currentSpeed - min) / (max - min);
    if (ratio < 0.5) {
        const normalized = ratio * 2;
        const blue = Math.round(255 * (1 - normalized));
        return `rgb(255, 255, ${blue})`;
    } else {
        const normalized = (ratio - 0.5) * 2;
        const green = Math.round(255 * (1 - normalized));
        return `rgb(255, ${green}, 0)`;
    }
}

function handleRectCollision(rectCenterX, rectCenterY, rectWidth, rectHeight, paddleVelocityX, paddleVelocityY, impactColor) {
    const left = rectCenterX - rectWidth / 2;
    const right = rectCenterX + rectWidth / 2;
    const top = rectCenterY - rectHeight / 2;
    const bottom = rectCenterY + rectHeight / 2;

    const closestX = clamp(ball.x, left, right);
    const closestY = clamp(ball.y, top, bottom);

    const distanceX = ball.x - closestX;
    const distanceY = ball.y - closestY;
    const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

    if (distanceSquared <= ball.radius * ball.radius) {
        let bounced = false;
        const overlapLeft = (ball.x + ball.radius) - left;
        const overlapRight = right - (ball.x - ball.radius);
        const overlapTop = (ball.y + ball.radius) - top;
        const overlapBottom = bottom - (ball.y - ball.radius);

        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

        if (minOverlap === overlapLeft) { ball.x = left - ball.radius; ball.vx = -Math.abs(ball.vx); bounced = true; }
        else if (minOverlap === overlapRight) { ball.x = right + ball.radius; ball.vx = Math.abs(ball.vx); bounced = true; }
        else if (minOverlap === overlapTop) { ball.y = top - ball.radius; ball.vy = -Math.abs(ball.vy); bounced = true; }
        else if (minOverlap === overlapBottom) { ball.y = bottom + ball.radius; ball.vy = Math.abs(ball.vy); bounced = true; }

        if (bounced) {
            sfx.paddle();
            spawnImpact(ball.x, ball.y, impactColor, 1.15);
        }

        ball.vx += paddleVelocityX * 0.7;
        ball.vy += paddleVelocityY * 0.7;

        if (!isVertical && (minOverlap === overlapLeft || minOverlap === overlapRight)) {
            const relativeIntersectY = (rectCenterY - ball.y) / (rectHeight / 2);
            ball.vy -= relativeIntersectY * 4;
        } else if (isVertical && (minOverlap === overlapTop || minOverlap === overlapBottom)) {
            const relativeIntersectX = (rectCenterX - ball.x) / (rectWidth / 2);
            ball.vx -= relativeIntersectX * 4;
        }

        let rawSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        ball.speed = clamp(rawSpeed, ball.minSpeed, ball.maxSpeed);

        ball.vx = (ball.vx / rawSpeed) * ball.speed;
        ball.vy = (ball.vy / rawSpeed) * ball.speed;
    }
}

function drawArenaBackground(results) {
    if (showFootage) {
        canvasCtx.save();
        canvasCtx.scale(-1, 1);
        canvasCtx.drawImage(results.image, -canvasElement.width, 0, canvasElement.width, canvasElement.height);
        canvasCtx.restore();

        canvasCtx.fillStyle = 'rgba(5, 10, 24, 0.56)';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    } else {
        const arenaGradient = canvasCtx.createLinearGradient(0, 0, canvasElement.width, canvasElement.height);
        arenaGradient.addColorStop(0, '#091426');
        arenaGradient.addColorStop(1, '#100d24');
        canvasCtx.fillStyle = arenaGradient;
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    }

    canvasCtx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(8, 8, canvasElement.width - 16, canvasElement.height - 16);
}

function drawPaddle(x, y, width, height, color, glowColor) {
    canvasCtx.save();
    canvasCtx.shadowBlur = 14;
    canvasCtx.shadowColor = glowColor;
    canvasCtx.fillStyle = color;
    canvasCtx.fillRect(x - width / 2, y - height / 2, width, height);
    canvasCtx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
    canvasCtx.lineWidth = 1.5;
    canvasCtx.strokeRect(x - width / 2, y - height / 2, width, height);
    canvasCtx.restore();
}

function onResults(results) {
    updateTrackingStatus(results);
    const now = performance.now();
    const frameDelta = lastFrameAt ? Math.min(Math.max(now - lastFrameAt, 0), 100) : 0;
    lastFrameAt = now;
    updateCountdown(now);
    updateGameplayEffects(frameDelta);
    const isRoundActive = matchState === MATCH_STATES.PLAYING && !countdown.active;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    drawArenaBackground(results);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        if (landmarks && landmarks[8]) {
            const indexTip = landmarks[8];
            targetPointerX = (1 - indexTip.x) * canvasElement.width;
            targetPointerY = indexTip.y * canvasElement.height;
        }
    }

    let totalPaddleDx = (targetPointerX - currentPointerX) * SMOOTHING_FACTOR;
    let totalPaddleDy = (targetPointerY - currentPointerY) * SMOOTHING_FACTOR;

    if (isRoundActive && ball.speed > ball.minSpeed) {
        ball.speed = Math.max(ball.minSpeed, ball.speed * 0.997);
        const currentVectorSpeed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        ball.vx = (ball.vx / currentVectorSpeed) * ball.speed;
        ball.vy = (ball.vy / currentVectorSpeed) * ball.speed;
    }

    let totalAiDx = 0;
    let totalAiDy = 0;
    if (isRoundActive) {
        const aiMovement = getAiMovement(now);
        if (!isVertical) totalAiDy = aiMovement;
        else totalAiDx = aiMovement;
    }

    for (let i = 0; i < SUBSTEPS; i++) {
        currentPointerX += totalPaddleDx / SUBSTEPS;
        currentPointerY += totalPaddleDy / SUBSTEPS;

        ai.x += totalAiDx / SUBSTEPS;
        ai.y += totalAiDy / SUBSTEPS;

        if (!isVertical) {
            ai.x = isSwapped ? 40 : 600;
            ai.y = Math.max(ai.height / 2, Math.min(canvasElement.height - ai.height / 2, ai.y));
        } else {
            ai.y = isSwapped ? 440 : 40;
            ai.x = Math.max(ai.width / 2, Math.min(canvasElement.width - ai.width / 2, ai.x));
        }

        if (isRoundActive) {
            ball.x += ball.vx / SUBSTEPS;
            ball.y += ball.vy / SUBSTEPS;

            if (!isVertical) {
                if (ball.y - ball.radius <= 0) {
                    ball.vy = Math.abs(ball.vy);
                    ball.y = ball.radius;
                    sfx.wall();
                    spawnImpact(ball.x, ball.y, 'rgba(56, 189, 248, 0.9)', 0.75);
                } else if (ball.y + ball.radius >= canvasElement.height) {
                    ball.vy = -Math.abs(ball.vy);
                    ball.y = canvasElement.height - ball.radius;
                    sfx.wall();
                    spawnImpact(ball.x, ball.y, 'rgba(56, 189, 248, 0.9)', 0.75);
                }

                if (ball.x < 0) {
                    awardPoint(isSwapped ? 'player' : 'ai');
                    break;
                } else if (ball.x > canvasElement.width) {
                    awardPoint(isSwapped ? 'ai' : 'player');
                    break;
                }
            } else {
                if (ball.x - ball.radius <= 0) {
                    ball.vx = Math.abs(ball.vx);
                    ball.x = ball.radius;
                    sfx.wall();
                    spawnImpact(ball.x, ball.y, 'rgba(56, 189, 248, 0.9)', 0.75);
                } else if (ball.x + ball.radius >= canvasElement.width) {
                    ball.vx = -Math.abs(ball.vx);
                    ball.x = canvasElement.width - ball.radius;
                    sfx.wall();
                    spawnImpact(ball.x, ball.y, 'rgba(56, 189, 248, 0.9)', 0.75);
                }

                if (ball.y < 0) {
                    awardPoint(isSwapped ? 'ai' : 'player');
                    break;
                } else if (ball.y > canvasElement.height) {
                    awardPoint(isSwapped ? 'player' : 'ai');
                    break;
                }
            }

            handleRectCollision(currentPointerX, currentPointerY, player.width, player.height, totalPaddleDx, totalPaddleDy, 'rgba(56, 189, 248, 0.95)');
            handleRectCollision(ai.x, ai.y, ai.width, ai.height, 0, 0, 'rgba(167, 139, 250, 0.95)');
        }
    }

    if (isRoundActive) captureBallTrail();

    syncScoreboard();

    canvasCtx.beginPath();
    if (!isVertical) {
        canvasCtx.moveTo(canvasElement.width / 2, 0);
        canvasCtx.lineTo(canvasElement.width / 2, canvasElement.height);
    } else {
        canvasCtx.moveTo(0, canvasElement.height / 2);
        canvasCtx.lineTo(canvasElement.width, canvasElement.height / 2);
    }
    canvasCtx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
    canvasCtx.setLineDash([8, 12]);
    canvasCtx.lineWidth = 1.5;
    canvasCtx.stroke();
    canvasCtx.setLineDash([]);

    drawGameplayEffects();

    drawPaddle(currentPointerX, currentPointerY, player.width, player.height, '#38bdf8', 'rgba(56, 189, 248, 0.75)');
    drawPaddle(ai.x, ai.y, ai.width, ai.height, '#a78bfa', 'rgba(167, 139, 250, 0.68)');

    canvasCtx.save();
    canvasCtx.beginPath();
    canvasCtx.arc(ball.x, ball.y, ball.radius, 0, 2 * Math.PI);
    canvasCtx.fillStyle = getBallColor(ball.speed, ball.minSpeed, ball.maxSpeed);
    canvasCtx.shadowBlur = 16;
    canvasCtx.shadowColor = canvasCtx.fillStyle;
    canvasCtx.fill();
    canvasCtx.restore();

    canvasCtx.font = '700 17px Inter, system-ui, sans-serif';
    canvasCtx.fillStyle = '#38bdf8';
    canvasCtx.fillText(`PLAYER  ${player.score}`, 24, 38);

    canvasCtx.fillStyle = '#a78bfa';
    const aiText = `AI  ${ai.score}`;
    const textMetrics = canvasCtx.measureText(aiText);
    canvasCtx.fillText(aiText, canvasElement.width - textMetrics.width - 24, 38);

    drawCountdown();

    if (matchState === MATCH_STATES.IDLE || matchState === MATCH_STATES.PAUSED) {
        canvasCtx.fillStyle = 'rgba(5, 9, 20, 0.68)';
        canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);

        canvasCtx.textAlign = 'center';

        canvasCtx.font = '800 44px Inter, system-ui, sans-serif';
        canvasCtx.fillStyle = '#f8fafc';
        canvasCtx.fillText(matchState === MATCH_STATES.IDLE ? 'READY?' : 'PAUSED', canvasElement.width / 2, canvasElement.height / 2 - 18);

        canvasCtx.font = '500 15px Inter, system-ui, sans-serif';
        canvasCtx.fillStyle = '#aab5c8';
        canvasCtx.fillText('Move your index finger to control the blue paddle', canvasElement.width / 2, canvasElement.height / 2 + 24);
        canvasCtx.fillText(
            matchState === MATCH_STATES.IDLE
                ? "Press 'P' or Start when you're ready"
                : countdown.active ? 'Countdown will continue from this number' : "Press 'P' or Resume to continue",
            canvasElement.width / 2,
            canvasElement.height / 2 + 49
        );

        canvasCtx.textAlign = 'left';
    }

    canvasCtx.restore();
}

updatePaddleDimensions();
resetBall();
updateMatchSummary();
syncAudioControl();
setMatchState(MATCH_STATES.IDLE);

function drawInitialCanvas(message = 'INITIALIZING SENSOR') {
    const gradient = canvasCtx.createLinearGradient(0, 0, canvasElement.width, canvasElement.height);
    gradient.addColorStop(0, '#091426');
    gradient.addColorStop(1, '#100d24');
    canvasCtx.fillStyle = gradient;
    canvasCtx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(8, 8, canvasElement.width - 16, canvasElement.height - 16);
    canvasCtx.fillStyle = '#91a0b8';
    canvasCtx.font = '700 16px Inter, system-ui, sans-serif';
    canvasCtx.textAlign = 'center';
    canvasCtx.fillText(message, canvasElement.width / 2, canvasElement.height / 2);
    canvasCtx.textAlign = 'left';
}

let hands;
let camera;

async function initializeHandTracking() {
    setTrackingStatus('initializing');
    drawInitialCanvas();

    try {
        if (typeof Hands === 'undefined' || typeof Camera === 'undefined') {
            throw new Error('MediaPipe libraries did not load.');
        }

        hands = new Hands({locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }});

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 0,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        hands.onResults(onResults);

        camera = new Camera(videoElement, {
            onFrame: async () => {
                if (trackingState === 'error') return;
                try {
                    await hands.send({image: videoElement});
                } catch (error) {
                    setTrackingStatus('error', getCameraErrorMessage(error));
                    drawInitialCanvas('TRACKING UNAVAILABLE');
                    console.error('Hand tracking frame failed:', error);
                }
            },
            width: 640,
            height: 480
        });

        await camera.start();
        if (trackingState === 'initializing') {
            trackingMessageElement.textContent = 'Camera connected. Loading the hand-tracking model…';
        }
    } catch (error) {
        setTrackingStatus('error', getCameraErrorMessage(error));
        drawInitialCanvas('CAMERA UNAVAILABLE');
        console.error('Camera initialization failed:', error);
    }
}

initializeHandTracking();
