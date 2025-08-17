(function(){
	"use strict";

	const canvas = document.getElementById("game");
	const ctx = canvas.getContext("2d");

	// High-DPI scaling
	const devicePixelRatioSafe = Math.max(1, Math.floor(window.devicePixelRatio || 1));
	const logicalWidth = canvas.width;
	const logicalHeight = canvas.height;
	canvas.width = logicalWidth * devicePixelRatioSafe;
	canvas.height = logicalHeight * devicePixelRatioSafe;
	canvas.style.width = logicalWidth + "px";
	canvas.style.height = logicalHeight + "px";
	ctx.scale(devicePixelRatioSafe, devicePixelRatioSafe);

	// UI elements
	const pauseButton = document.getElementById("pauseBtn");
	const restartButton = document.getElementById("restartBtn");
	const aiSelect = document.getElementById("aiLevel");

	// Court and gameplay constants
	const court = { width: logicalWidth, height: logicalHeight };
	const netX = court.width / 2;
	const paddleWidth = 12;
	const paddleHeight = 96;
	const paddleMargin = 24;
	const ballRadius = 8;
	const baseBallSpeed = 5.25;
	const maxBallSpeed = 12.0;
	const speedIncreaseOnHit = 1.04;
	const playerPaddleSpeed = 7.0;
	const serveCountdownMs = 900;
	const pointsToWin = 11;
	const winBy = 2;

	const aiLevelToSpeed = {
		easy: 3.4,
		medium: 5.0,
		hard: 7.0
	};
	let aiMaxSpeed = aiLevelToSpeed[aiSelect.value] || aiLevelToSpeed.medium;

	// Game state
	const state = {
		playerY: court.height / 2 - paddleHeight / 2,
		aiY: court.height / 2 - paddleHeight / 2,
		ballX: netX,
		ballY: court.height / 2,
		ballVX: 0,
		ballVY: 0,
		ballSpeed: baseBallSpeed,
		scorePlayer: 0,
		scoreAI: 0,
		server: "player", // alternates every 2 points
		isPaused: false,
		isServing: true,
		serveStartTime: performance.now(),
		gameOver: false
	};

	const input = {
		up: false,
		down: false,
		pointerActive: false,
		pointerId: null
	};

	function resetBallForServe() {
		state.isServing = true;
		state.ballSpeed = baseBallSpeed;
		state.ballX = state.server === "player" ? paddleMargin + paddleWidth + ballRadius + 2 : court.width - paddleMargin - paddleWidth - ballRadius - 2;
		state.ballY = Math.random() * (court.height * 0.6) + court.height * 0.2;
		// Aim towards receiver with a slight random vertical component
		const directionX = state.server === "player" ? 1 : -1;
		state.ballVX = directionX * state.ballSpeed;
		state.ballVY = (Math.random() * 2 - 1) * (state.ballSpeed * 0.4);
		state.serveStartTime = performance.now();
	}

	function restartMatch() {
		state.playerY = court.height / 2 - paddleHeight / 2;
		state.aiY = court.height / 2 - paddleHeight / 2;
		state.scorePlayer = 0;
		state.scoreAI = 0;
		state.server = "player";
		state.gameOver = false;
		resetBallForServe();
	}

	function decideServerByTotalPoints() {
		const totalPoints = state.scorePlayer + state.scoreAI;
		const blockIndex = Math.floor(totalPoints / 2);
		state.server = (blockIndex % 2 === 0) ? "player" : "ai";
	}

	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value));
	}

	function movePlayer(dtMs) {
		if (input.up && !input.down) {
			state.playerY -= playerPaddleSpeed * (dtMs / 16.6667);
		} else if (input.down && !input.up) {
			state.playerY += playerPaddleSpeed * (dtMs / 16.6667);
		}
		state.playerY = clamp(state.playerY, 0, court.height - paddleHeight);
	}

	function moveAI(dtMs) {
		// Track only when ball is moving towards AI; otherwise slowly drift to center
		const dtScale = dtMs / 16.6667;
		const aiCenterY = state.aiY + paddleHeight / 2;
		let targetY = court.height / 2;
		if (state.ballVX > 0) {
			targetY = state.ballY;
		}
		const delta = targetY - aiCenterY;
		const step = clamp(delta, -aiMaxSpeed * dtScale, aiMaxSpeed * dtScale);
		state.aiY = clamp(state.aiY + step, 0, court.height - paddleHeight);
	}

	function updateBall(dtMs) {
		if (state.isServing) {
			// small freeze to telegraph the serve
			if (performance.now() - state.serveStartTime < serveCountdownMs) return;
			state.isServing = false;
		}

		const dtScale = dtMs / 16.6667;
		state.ballX += state.ballVX * dtScale;
		state.ballY += state.ballVY * dtScale;

		// Top/bottom bounce
		if (state.ballY - ballRadius <= 0 && state.ballVY < 0) {
			state.ballY = ballRadius;
			state.ballVY *= -1;
		}
		if (state.ballY + ballRadius >= court.height && state.ballVY > 0) {
			state.ballY = court.height - ballRadius;
			state.ballVY *= -1;
		}

		// Paddle collisions
		const leftPaddle = { x: paddleMargin, y: state.playerY, w: paddleWidth, h: paddleHeight };
		const rightPaddle = { x: court.width - paddleMargin - paddleWidth, y: state.aiY, w: paddleWidth, h: paddleHeight };

		// Left paddle
		if (state.ballVX < 0 && state.ballX - ballRadius <= leftPaddle.x + leftPaddle.w && state.ballX - ballRadius >= leftPaddle.x) {
			if (state.ballY >= leftPaddle.y && state.ballY <= leftPaddle.y + leftPaddle.h) {
				const relativeIntersectY = (state.ballY - (leftPaddle.y + leftPaddle.h / 2)) / (leftPaddle.h / 2);
				const bounceAngle = relativeIntersectY * (Math.PI * 0.35); // up to ~63 deg
				state.ballSpeed = Math.min(maxBallSpeed, state.ballSpeed * speedIncreaseOnHit);
				state.ballVX = Math.abs(Math.cos(bounceAngle) * state.ballSpeed);
				state.ballVY = Math.sin(bounceAngle) * state.ballSpeed;
				state.ballX = leftPaddle.x + leftPaddle.w + ballRadius + 0.01;
			}
		}
		// Right paddle
		if (state.ballVX > 0 && state.ballX + ballRadius >= rightPaddle.x && state.ballX + ballRadius <= rightPaddle.x + rightPaddle.w) {
			if (state.ballY >= rightPaddle.y && state.ballY <= rightPaddle.y + rightPaddle.h) {
				const relativeIntersectY = (state.ballY - (rightPaddle.y + rightPaddle.h / 2)) / (rightPaddle.h / 2);
				const bounceAngle = relativeIntersectY * (Math.PI * 0.35);
				state.ballSpeed = Math.min(maxBallSpeed, state.ballSpeed * speedIncreaseOnHit);
				state.ballVX = -Math.abs(Math.cos(bounceAngle) * state.ballSpeed);
				state.ballVY = Math.sin(bounceAngle) * state.ballSpeed;
				state.ballX = rightPaddle.x - ballRadius - 0.01;
			}
		}

		// Score check
		if (state.ballX + ballRadius < 0) {
			// AI scores
			state.scoreAI += 1;
			if (hasWinner()) {
				state.gameOver = true;
				state.isPaused = true;
				return;
			}
			decideServerByTotalPoints();
			resetBallForServe();
		}
		if (state.ballX - ballRadius > court.width) {
			// Player scores
			state.scorePlayer += 1;
			if (hasWinner()) {
				state.gameOver = true;
				state.isPaused = true;
				return;
			}
			decideServerByTotalPoints();
			resetBallForServe();
		}
	}

	function hasWinner() {
		const maxScore = Math.max(state.scorePlayer, state.scoreAI);
		const minScore = Math.min(state.scorePlayer, state.scoreAI);
		return maxScore >= pointsToWin && (maxScore - minScore) >= winBy;
	}

	function drawCourt() {
		// Background
		ctx.fillStyle = "#0f2a2f";
		ctx.fillRect(0, 0, court.width, court.height);

		// Court bounds
		ctx.strokeStyle = "#2dd4bf";
		ctx.lineWidth = 2;
		ctx.strokeRect(16, 16, court.width - 32, court.height - 32);

		// Center net
		ctx.setLineDash([8, 8]);
		ctx.beginPath();
		ctx.moveTo(netX, 0);
		ctx.lineTo(netX, court.height);
		ctx.stroke();
		ctx.setLineDash([]);

		// Kitchen lines (approx) 7 ft from net scaled to our height; stylized
		ctx.strokeStyle = "#86efac";
		ctx.lineWidth = 1.5;
		const kitchenOffset = 70;
		ctx.beginPath();
		ctx.moveTo(netX - kitchenOffset, 16);
		ctx.lineTo(netX - kitchenOffset, court.height - 16);
		ctx.moveTo(netX + kitchenOffset, 16);
		ctx.lineTo(netX + kitchenOffset, court.height - 16);
		ctx.stroke();
	}

	function drawPaddlesAndBall() {
		// Paddles
		ctx.fillStyle = "#d1fae5";
		ctx.fillRect(paddleMargin, state.playerY, paddleWidth, paddleHeight);
		ctx.fillStyle = "#93c5fd";
		ctx.fillRect(court.width - paddleMargin - paddleWidth, state.aiY, paddleWidth, paddleHeight);

		// Ball
		ctx.beginPath();
		ctx.arc(state.ballX, state.ballY, ballRadius, 0, Math.PI * 2);
		ctx.fillStyle = "#fde68a";
		ctx.fill();
	}

	function drawScoreboard() {
		ctx.font = "bold 22px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
		ctx.fillStyle = "#e2e8f0";
		ctx.textAlign = "center";
		ctx.fillText(`${state.scorePlayer} : ${state.scoreAI}`, court.width / 2, 36);

		ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
		ctx.fillStyle = "#94a3b8";
		ctx.fillText(`Server: ${state.server === "player" ? "You" : "AI"}`, court.width / 2, 54);
	}

	function drawOverlays() {
		if (state.isPaused) {
			ctx.fillStyle = "rgba(0,0,0,0.35)";
			ctx.fillRect(0, 0, court.width, court.height);
			ctx.fillStyle = "#e2e8f0";
			ctx.font = "bold 28px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
			ctx.textAlign = "center";
			ctx.fillText(state.gameOver ? (state.scorePlayer > state.scoreAI ? "You win!" : "AI wins!") : "Paused", court.width / 2, court.height / 2 - 10);
			if (!state.gameOver) {
				ctx.font = "14px system-ui, -apple-system, Segoe UI";
				ctx.fillStyle = "#cbd5e1";
				ctx.fillText("Press Pause or Space to resume", court.width / 2, court.height / 2 + 16);
			}
		}

		if (state.isServing && !state.isPaused) {
			ctx.fillStyle = "#93c5fd";
			ctx.font = "12px system-ui, -apple-system, Segoe UI";
			ctx.textAlign = "center";
			ctx.fillText("Serve", state.server === "player" ? paddleMargin + 40 : court.width - paddleMargin - 40, 32);
		}
	}

	let lastTime = performance.now();
	function loop(now) {
		const dtMs = Math.min(32, now - lastTime);
		lastTime = now;

		if (!state.isPaused) {
			movePlayer(dtMs);
			moveAI(dtMs);
			updateBall(dtMs);
		}

		drawCourt();
		drawPaddlesAndBall();
		drawScoreboard();
		drawOverlays();

		requestAnimationFrame(loop);
	}

	// Input handling
	window.addEventListener("keydown", (e) => {
		if (e.code === "KeyW" || e.code === "ArrowUp") input.up = true;
		if (e.code === "KeyS" || e.code === "ArrowDown") input.down = true;
		if (e.code === "Space") togglePause();
	});
	window.addEventListener("keyup", (e) => {
		if (e.code === "KeyW" || e.code === "ArrowUp") input.up = false;
		if (e.code === "KeyS" || e.code === "ArrowDown") input.down = false;
	});

	// Pointer controls (left half to control player)
	canvas.addEventListener("pointerdown", (e) => {
		const rect = canvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		if (x <= rect.width * 0.55) {
			input.pointerActive = true;
			input.pointerId = e.pointerId;
			canvas.setPointerCapture(e.pointerId);
			updatePlayerWithPointer(e);
		}
	});
	canvas.addEventListener("pointermove", (e) => {
		if (input.pointerActive && e.pointerId === input.pointerId) {
			updatePlayerWithPointer(e);
		}
	});
	canvas.addEventListener("pointerup", (e) => {
		if (input.pointerActive && e.pointerId === input.pointerId) {
			input.pointerActive = false;
			input.pointerId = null;
			canvas.releasePointerCapture(e.pointerId);
		}
	});
	function updatePlayerWithPointer(e) {
		const rect = canvas.getBoundingClientRect();
		const y = e.clientY - rect.top;
		state.playerY = clamp(y - paddleHeight / 2, 0, rect.height - paddleHeight);
		// Convert from CSS pixels to logical if canvas is scaled; we used layout pixels, so height matches logical via style. No change needed.
	}

	function togglePause() {
		state.isPaused = !state.isPaused;
		pauseButton.setAttribute("aria-pressed", state.isPaused ? "true" : "false");
	}

	pauseButton.addEventListener("click", () => {
		togglePause();
	});
	restartButton.addEventListener("click", () => {
		restartMatch();
		state.isPaused = false;
		pauseButton.setAttribute("aria-pressed", "false");
	});
	aiSelect.addEventListener("change", () => {
		aiMaxSpeed = aiLevelToSpeed[aiSelect.value] || aiLevelToSpeed.medium;
	});

	// Initialize
	restartMatch();
	requestAnimationFrame((t) => { lastTime = t; loop(t); });
})(); 