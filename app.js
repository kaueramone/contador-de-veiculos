/**
 * Vehicle Counter — Live Traffic Camera (v3.0 - YOLOv8n)
 * =======================================================
 * Uses HLS.js for live stream, ONNX Runtime Web + YOLOv8n
 * for superior vehicle detection precision.
 */

(function () {
    'use strict';

    // ===== CONFIG =====
    const CONFIG = {
        // Model
        modelPath: './yolov5nu.onnx',
        inputShape: [1, 3, 640, 640],

        // HLS Stream
        streamUrl: 'https://34.104.32.249.nip.io/SP055-KM110A/stream.m3u8',

        // Detection
        detectionInterval: 300,       // ms between detection frames
        confidenceThreshold: 0.25,    // YOLOv8 is more precise, can use higher confidence
        iouThreshold: 0.45,           // Non-Maximum Suppression threshold
        // YOLOv8 Coco classes: 2:car, 3:motorcycle, 5:bus, 7:truck
        vehicleClasses: [2, 3, 5, 7],
        classNames: { 2: 'car', 3: 'motorcycle', 5: 'bus', 7: 'truck' },

        // Counting line (normalized 0-1)
        countingLine: {
            x1: 0.05,
            y1: 0.45,
            x2: 0.85,
            y2: 0.45
        },

        // Tracking
        crossingZoneHeight: 60,
        trackingMaxAge: 4000,
        trackingDistThreshold: 150,
        minMovementPixels: 15,        // Filter stationary vehicles

        // Timer
        timerDuration: 5 * 60,

        // UI
        lineColor: '#00e68a',
        lineWidth: 3,
        boxColor: '#4d9fff',
        zoneColor: 'rgba(0, 230, 138, 0.08)'
    };

    // ===== STATE =====
    const state = {
        session: null,
        hls: null,
        isDetecting: false,
        showDetection: true,
        lastDetectionTime: 0,
        totalCount: 0,
        timerRunning: false,
        timerRemaining: CONFIG.timerDuration,
        timerInterval: null,
        timerStartTime: null,
        trackedVehicles: [],
        nextTrackId: 1,
        frameCount: 0,
        lastFpsUpdate: 0,
        fps: 0
    };

    // ===== DOM ELEMENTS =====
    const $ = (id) => document.getElementById(id);
    const el = {
        video: $('videoElement'),
        canvas: $('overlayCanvas'),
        prepCanvas: $('prepCanvas'),
        loadingOverlay: $('loadingOverlay'),
        loadingText: $('loadingText'),
        statusBadge: $('statusBadge'),
        statusText: $('statusText'),
        liveBadge: $('liveBadge'),
        timerDisplay: $('timerDisplay'),
        btnStart: $('btnStartTimer'),
        btnStop: $('btnStopTimer'),
        btnResetTimer: $('btnResetTimer'),
        timerProgress: $('timerProgressBar'),
        btnToggleDetection: $('btnToggleDetection'),
        btnResetCount: $('btnResetCount'),
        fpsValue: $('fpsValue'),
        totalCount: $('totalCount'),
        vehiclesPerMin: $('vehiclesPerMin'),
        currentDetections: $('currentDetections'),
        trackedCount: $('trackedCount'),
        modelStatus: $('modelStatus'),
        inferenceTime: $('inferenceTime'),
        logContainer: $('logContainer')
    };

    const ctx = el.canvas.getContext('2d');
    const pCtx = el.prepCanvas.getContext('2d', { willReadFrequently: true });

    // ===== LOGGING =====
    function addLog(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        const time = new Date().toLocaleTimeString('pt-BR');
        entry.textContent = `[${time}] ${message}`;
        el.logContainer.prepend(entry);
        while (el.logContainer.children.length > 50) el.logContainer.removeChild(el.logContainer.lastChild);
    }

    // ===== HLS PLAYER =====
    function initHLS() {
        addLog('Iniciando player HLS...', 'info');
        if (Hls.isSupported()) {
            state.hls = new Hls({ lowLatencyMode: true });
            state.hls.loadSource(CONFIG.streamUrl);
            state.hls.attachMedia(el.video);
            state.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                addLog('Stream HLS conectado ✓', 'info');
                el.video.play().catch(() => { });
                el.liveBadge.style.display = 'flex';
            });
        }
    }

    // ===== MODEL LOADING =====
    async function loadModel() {
        addLog('Carregando YOLOv5u (ONNX)...', 'info');
        el.modelStatus.textContent = 'ORT...';

        // Set WASM paths explicitly for CDN use
        const ortVersion = '1.18.0';
        ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ortVersion}/dist/`;

        // Prioritize WASM for compatibility, fallback to WebGL
        const providers = ['wasm', 'webgl'];

        for (const provider of providers) {
            try {
                addLog(`Tentando provedor: ${provider}...`, 'info');
                const options = {
                    executionProviders: [provider],
                    graphOptimizationLevel: 'all'
                };

                if (provider === 'wasm') {
                    ort.env.wasm.numThreads = 2; // Use 2 threads for better performance
                    ort.env.wasm.simd = true;    // Enable SIMD if available
                }

                state.session = await ort.InferenceSession.create(CONFIG.modelPath, options);
                addLog(`YOLOv5u carregado ✓ (${provider})`, 'info');
                el.modelStatus.textContent = `YOLOv5u (${provider})`;
                el.loadingOverlay.classList.add('hidden');
                el.statusBadge.classList.add('ready');
                el.statusText.textContent = 'Pronto';
                el.btnToggleDetection.disabled = false;
                state.isDetecting = true;
                requestAnimationFrame(detectionLoop);
                return; // Success!
            } catch (err) {
                addLog(`Falha no provedor ${provider}: ${err.message}`, 'warning');
                console.error(`ORT Error (${provider}):`, err);
            }
        }

        addLog('Falha crítica: Nenhum provedor ORT disponível.', 'error');
        el.modelStatus.textContent = 'Erro ✗';
    }

    // ===== DRAWING =====
    function getLinePixels() {
        return {
            x1: CONFIG.countingLine.x1 * el.canvas.width,
            y1: CONFIG.countingLine.y1 * el.canvas.height,
            x2: CONFIG.countingLine.x2 * el.canvas.width,
            y2: CONFIG.countingLine.y2 * el.canvas.height
        };
    }

    function drawCountingZone() {
        const line = getLinePixels();
        const halfZone = CONFIG.crossingZoneHeight / 2;
        ctx.save();
        ctx.fillStyle = CONFIG.zoneColor;
        ctx.fillRect(line.x1, line.y1 - halfZone, line.x2 - line.x1, CONFIG.crossingZoneHeight);
        ctx.shadowColor = CONFIG.lineColor;
        ctx.shadowBlur = 12;
        ctx.strokeStyle = CONFIG.lineColor;
        ctx.lineWidth = CONFIG.lineWidth;
        ctx.setLineDash([12, 6]);
        ctx.beginPath();
        ctx.moveTo(line.x1, line.y1);
        ctx.lineTo(line.x2, line.y2);
        ctx.stroke();
        ctx.restore();
    }

    function drawTrackedVehicles() {
        if (!state.showDetection) return;
        state.trackedVehicles.forEach(track => {
            if (!track.bbox || !track.isMoving) return;
            const { sx, sy, sw, sh } = track.bbox;
            const color = track.counted ? '#00e68a' : CONFIG.boxColor;
            const age = Date.now() - track.lastSeen;
            const opacity = Math.max(0.3, 1 - age / CONFIG.trackingMaxAge);

            ctx.save();
            ctx.globalAlpha = opacity;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, sw, sh);

            // Label
            const label = `#${track.id}`;
            ctx.font = '700 11px Inter, sans-serif';
            ctx.fillStyle = color;
            ctx.fillRect(sx, sy - 18, ctx.measureText(label).width + 10, 18);
            ctx.fillStyle = '#000';
            ctx.fillText(label, sx + 5, sy - 5);
            ctx.restore();
        });
    }

    // ===== PRE & POST PROCESSING =====
    function preprocess(video) {
        pCtx.drawImage(video, 0, 0, 640, 640);
        const imageData = pCtx.getImageData(0, 0, 640, 640);
        const { data } = imageData;

        // Float32Array for ORT: [R, G, B, R, G, B, ...]
        // We need NCHW: [channel, height, width]
        const float32Data = new Float32Array(3 * 640 * 640);
        for (let i = 0; i < 640 * 640; i++) {
            float32Data[i] = data[i * 4] / 255.0;           // R
            float32Data[i + 640 * 640] = data[i * 4 + 1] / 255.0; // G
            float32Data[i + 2 * 640 * 640] = data[i * 4 + 2] / 255.0; // B
        }
        return new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);
    }

    function postprocess(output, threshold, iouThreshold) {
        // Output from YOLOv8n: [1, 84, 8400]
        const boxes = [];
        const data = output.data;
        const numClasses = 80;
        const totalCandidates = 8400;

        for (let i = 0; i < totalCandidates; i++) {
            let maxScore = -1;
            let classId = -1;

            for (let c = 0; c < numClasses; c++) {
                const score = data[(4 + c) * totalCandidates + i];
                if (score > maxScore) {
                    maxScore = score;
                    classId = c;
                }
            }

            if (maxScore > threshold && CONFIG.vehicleClasses.includes(classId)) {
                // YOLO output is cx, cy, w, h
                const cx = data[0 * totalCandidates + i];
                const cy = data[1 * totalCandidates + i];
                const w = data[2 * totalCandidates + i];
                const h = data[3 * totalCandidates + i];

                const x1 = cx - w / 2;
                const y1 = cy - h / 2;

                boxes.push({
                    bbox: [x1, y1, w, h],
                    score: maxScore,
                    class: classId
                });
            }
        }

        return nms(boxes, iouThreshold);
    }

    function nms(boxes, iouThreshold) {
        boxes.sort((a, b) => b.score - a.score);
        const result = [];
        const selected = new Array(boxes.length).fill(true);

        for (let i = 0; i < boxes.length; i++) {
            if (!selected[i]) continue;
            result.push(boxes[i]);
            for (let j = i + 1; j < boxes.length; j++) {
                if (!selected[j]) continue;
                if (iou(boxes[i].bbox, boxes[j].bbox) > iouThreshold) {
                    selected[j] = false;
                }
            }
        }
        return result;
    }

    function iou(box1, box2) {
        const [x1, y1, w1, h1] = box1;
        const [x2, y2, w2, h2] = box2;
        const interX1 = Math.max(x1, x2);
        const interY1 = Math.max(y1, y2);
        const interX2 = Math.min(x1 + w1, x2 + w2);
        const interY2 = Math.min(y1 + h1, y2 + h2);
        const interW = Math.max(0, interX2 - interX1);
        const interH = Math.max(0, interY2 - interY1);
        const interArea = interW * interH;
        const area1 = w1 * h1;
        const area2 = w2 * h2;
        return interArea / (area1 + area2 - interArea);
    }

    // ===== TRACKING & COUNTING =====
    function sideOfLine(px, py, x1, y1, x2, y2) {
        return (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
    }

    function updateTracking(vehicles, countCrossings) {
        const now = Date.now();
        const line = getLinePixels();
        const scaleX = el.canvas.width / 640;
        const scaleY = el.canvas.height / 640;

        const used = new Set();
        const usedPreds = new Set();
        const matches = [];

        vehicles.forEach((pred, predIdx) => {
            const [x, y, w, h] = pred.bbox;
            const center = { x: (x + w / 2) * scaleX, y: (y + h / 2) * scaleY };
            state.trackedVehicles.forEach(track => {
                const dist = Math.sqrt((center.x - track.lastPos.x) ** 2 + (center.y - track.lastPos.y) ** 2);
                if (dist < CONFIG.trackingDistThreshold) matches.push({ predIdx, trackId: track.id, dist, center, pred });
            });
        });

        matches.sort((a, b) => a.dist - b.dist);
        matches.forEach(match => {
            if (used.has(match.trackId) || usedPreds.has(match.predIdx)) return;
            used.add(match.trackId);
            usedPreds.add(match.predIdx);
            const track = state.trackedVehicles.find(t => t.id === match.trackId);
            const [x, y, w, h] = match.pred.bbox;
            const prevSide = sideOfLine(track.lastPos.x, track.lastPos.y, line.x1, line.y1, line.x2, line.y2);
            const currSide = sideOfLine(match.center.x, match.center.y, line.x1, line.y1, line.x2, line.y2);

            track.lastPos = match.center;
            track.bbox = { sx: x * scaleX, sy: y * scaleY, sw: w * scaleX, sh: h * scaleY };
            track.lastSeen = now;
            track.positions.push(match.center);
            if (track.positions.length > 30) track.positions.shift();

            if (!track.isMoving) {
                const dist = Math.sqrt((track.positions[0].x - match.center.x) ** 2 + (track.positions[0].y - match.center.y) ** 2);
                if (dist > CONFIG.minMovementPixels) track.isMoving = true;
            }
            if (countCrossings && track.isMoving && !track.counted && prevSide * currSide < 0) {
                track.counted = true;
                state.totalCount++;
                updateCounterUI();
                flashLine();
                addLog(`🚗 Veículo #${track.id} cruzou a linha!`, 'count');
            }
        });

        vehicles.forEach((pred, predIdx) => {
            if (!usedPreds.has(predIdx)) {
                const [x, y, w, h] = pred.bbox;
                const center = { x: (x + w / 2) * scaleX, y: (y + h / 2) * scaleY };
                state.trackedVehicles.push({
                    id: state.nextTrackId++,
                    lastPos: center,
                    bbox: { sx: x * scaleX, sy: y * scaleY, sw: w * scaleX, sh: h * scaleY },
                    lastSeen: now,
                    counted: false,
                    isMoving: false,
                    positions: [center]
                });
            }
        });
        state.trackedVehicles = state.trackedVehicles.filter(t => now - t.lastSeen < CONFIG.trackingMaxAge);
        el.trackedCount.textContent = state.trackedVehicles.length;
    }

    function updateCounterUI() {
        el.totalCount.textContent = state.totalCount;
        if (state.timerStartTime) {
            const elapsed = (Date.now() - state.timerStartTime) / 1000 / 60;
            if (elapsed > 0) el.vehiclesPerMin.textContent = (state.totalCount / elapsed).toFixed(1);
        }
    }

    function flashLine() {
        const flash = $('lineFlash');
        flash.classList.add('active');
        setTimeout(() => flash.classList.remove('active'), 400);
    }

    // ===== DETECTION LOOP =====
    async function detectionLoop(timestamp) {
        if (!state.isDetecting) return;
        const rect = el.video.getBoundingClientRect();
        el.canvas.width = rect.width; el.canvas.height = rect.height;
        ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
        drawCountingZone();

        if (state.session && el.video.readyState >= 2 && timestamp - state.lastDetectionTime >= CONFIG.detectionInterval) {
            state.lastDetectionTime = timestamp;
            const start = performance.now();
            try {
                const input = preprocess(el.video);
                const results = await state.session.run({ images: input });
                const predictions = postprocess(results.output0, CONFIG.confidenceThreshold, CONFIG.iouThreshold);
                el.currentDetections.textContent = predictions.length;
                updateTracking(predictions, state.timerRunning);
            } catch (e) { console.error(e); }
            el.inferenceTime.textContent = (performance.now() - start).toFixed(0);

            state.frameCount++;
            if (timestamp - state.lastFpsUpdate >= 1000) {
                el.fpsValue.textContent = state.frameCount;
                state.frameCount = 0;
                state.lastFpsUpdate = timestamp;
            }
        }
        drawTrackedVehicles();
        requestAnimationFrame(detectionLoop);
    }

    // ===== TIMER & EVENTS =====
    function startTimer() {
        state.timerRunning = true;
        state.timerStartTime = state.timerStartTime || Date.now();
        el.btnStart.style.display = 'none'; el.btnStop.style.display = 'inline-flex';
        state.timerInterval = setInterval(() => {
            state.timerRemaining--;
            el.timerDisplay.textContent = Math.floor(state.timerRemaining / 60).toString().padStart(2, '0') + ':' + (state.timerRemaining % 60).toString().padStart(2, '0');
            el.timerProgress.style.width = (state.timerRemaining / CONFIG.timerDuration * 100) + '%';
            if (state.timerRemaining <= 0) { clearInterval(state.timerInterval); state.timerRunning = false; }
        }, 1000);
    }

    async function init() {
        el.btnStart.addEventListener('click', startTimer);
        el.btnStop.addEventListener('click', () => { clearInterval(state.timerInterval); state.timerRunning = false; el.btnStart.style.display = 'inline-flex'; el.btnStop.style.display = 'none'; });
        el.btnResetCount.addEventListener('click', () => { state.totalCount = 0; state.trackedVehicles = []; updateCounterUI(); });
        initHLS();
        el.video.addEventListener('playing', loadModel, { once: true });
    }

    init();
})();
