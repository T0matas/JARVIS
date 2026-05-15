// ─── STATE & DICTIONARY ──────────────────────────────────────────────────────
let currentLang = 'en';
let jarvisVolume = parseFloat(localStorage.getItem('jarvis_volume')) || 1.0;

function setLanguage(lang) {
    currentLang = lang;
    loadVoices(); // Update voice selection for the new language
    if (recognition) {
        recognition.stop();
        recognition.lang = lang === 'pt' ? 'pt-BR' : 'en-US';
        try { recognition.start(); } catch(e){}
    }
    speak(getString('langChange'));
}
let commandsEnabled = true;
let taskList = JSON.parse(localStorage.getItem('jarvis_tasks')) || [];
let globe, globeRenderer, globeScene, globeCamera;
let timerInterval = null;
let weatherMap = null;
let networkCanvas = null;
let networkCtx = null;
let nodes = [];

// Audio Visualizer Variables
let audioCtx, analyser, dataArray, source;
let isAudioInit = false;

const DICT = {
    en: {
        ready: "Systems online sir. Standing by.",
        greetingMorning: "Good morning sir. All systems are at your disposal.",
        greetingAfternoon: "Good afternoon sir. All systems are at your disposal.",
        greetingEvening: "Good evening sir. All systems are at your disposal.",
        date: "Today is {date} sir.",
        time: "The current time is {hours} {minutes} sir.",
        weatherInit: "Fetching current atmospheric data sir.",
        weatherRes: "Current conditions: {desc}, {temp} degrees, wind at {wind} km per hour.",
        weatherErr: "I'm unable to access sensors at this time sir.",
        searchWiki: "Searching the knowledge base for {topic} sir.",
        searchWeb: "Searching for {q} sir.",
        searchYT: "Opening YouTube for {q} sir.",
        opening: "Opening {app} sir.",
        notFound: "Sorry sir, I didn't find anything with that name.",
        offline: "Backend offline — restart server.js",
        lock: "Locking your workstation sir.",
        timerSet: "Timer set for {min} minutes sir.",
        timerUp: "Your {min} minute timer is up sir.",
        volUp: "Volume increased sir.",
        volDown: "Volume decreased sir.",
        play: "Resuming playback sir.",
        pause: "Pausing playback sir.",
        next: "Skipping to next track sir.",
        prev: "Going to previous track sir.",
        screenshot: "Screenshot captured sir.",
        closeAll: "Closing all background applications sir.",
        openingMap: "Opening map of {city} sir.",
        report: "System report. CPU {cpu}%, memory {mem}%. All systems nominal.",
        reportFallback: "All systems are operational sir. Neural link is stable.",
        math: "The answer is {res} sir.",
        mathErr: "I couldn't compute that sir.",
        langChange: "Language changed to English sir.",
        voiceChange: "This is my new voice sir. How does it sound?",
        fallback: "Accessing neural database for an answer sir.",
        thinking: "Searching my databases for {q} sir.",
        noInfo: "I couldn't find any data on that topic sir.",
        taskAdded: "Task added to the matrix sir.",
        taskCleared: "Task matrix cleared sir.",
        noteSaved: "Neural note recorded sir.",
        hudHidden: "Hiding interface sir. Eye-tracking still active.",
        hudShown: "Restoring systems sir. All modules online."
    },
    pt: {
        ready: "Sistemas online senhor. Aguardando ordens.",
        greetingMorning: "Bom dia senhor. Todos os sistemas à sua disposição.",
        greetingAfternoon: "Boa tarde senhor. Todos os sistemas à sua disposição.",
        greetingEvening: "Boa noite senhor. Todos os sistemas à sua disposição.",
        date: "Hoje é {date} senhor.",
        time: "A hora atual é {hours} e {minutes} senhor.",
        weatherInit: "Buscando dados atmosféricos senhor.",
        weatherRes: "Condições atuais: {desc}, {temp} graus, vento a {wind} km por hora.",
        weatherErr: "Não consigo acessar os sensores no momento senhor.",
        searchWiki: "Procurando no banco de dados por {topic} senhor.",
        searchWeb: "Pesquisando por {q} senhor.",
        searchYT: "Abrindo o YouTube para {q} senhor.",
        opening: "Abrindo {app} senhor.",
        notFound: "Desculpe senhor, não encontrei nada com esse nome.",
        offline: "Servidor offline — reinicie o server.js",
        lock: "Bloqueando o computador senhor.",
        timerSet: "Cronômetro definido para {min} minutos senhor.",
        timerUp: "Seu cronômetro de {min} minutos terminou senhor.",
        volUp: "Volume aumentado senhor.",
        volDown: "Volume diminuído senhor.",
        play: "Retomando a música senhor.",
        pause: "Pausando a música senhor.",
        next: "Próxima música senhor.",
        prev: "Música anterior senhor.",
        screenshot: "Captura de tela realizada senhor.",
        closeAll: "Fechando todos os aplicativos em segundo plano senhor.",
        openingMap: "Abrindo o mapa de {city} senhor.",
        report: "Relatório: CPU {cpu}%, memória {mem}%. Tudo operacional.",
        reportFallback: "Sistemas operacionais senhor. Conexão neural estável.",
        math: "A resposta é {res} senhor.",
        mathErr: "Não consegui calcular isso senhor.",
        langChange: "Idioma alterado para Português senhor.",
        voiceChange: "Esta é minha nova voz senhor. Como soa?",
        fallback: "Acessando banco de dados neural para uma resposta senhor.",
        thinking: "Pesquisando em meus bancos de dados por {q} senhor.",
        noInfo: "Não consegui encontrar dados sobre este assunto senhor.",
        taskAdded: "Tarefa adicionada à matriz senhor.",
        taskCleared: "Matriz de tarefas limpa senhor.",
        noteSaved: "Nota neural registrada senhor.",
        hudHidden: "Escondendo interface senhor. Rastreamento ocular ativo.",
        hudShown: "Restaurando sistemas senhor. Todos os módulos online."
    }
};

function getString(key, vars = {}) {
    let text = DICT[currentLang][key] || DICT['en'][key];
    for (const [k, v] of Object.entries(vars)) text = text.replace(`{${k}}`, v);
    return text;
}

// ─── BACKEND HELPER ─────────────────────────────────────────────────────────
async function callBackend(endpoint, body = {}) {
    try {
        const r = await fetch(`http://127.0.0.1:3001${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await r.json();
    } catch (e) {
        console.warn(`[BACKEND] ${endpoint} failed:`, e.message);
        return { success: false };
    }
}

// ─── CLOCK ───────────────────────────────────────────────────────────────────
function updateClock() {
    const clockEl = document.getElementById('main-clock');
    const dateEl  = document.getElementById('current-date');
    if (!clockEl) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });
    clockEl.textContent = timeStr;
    const idleClock = document.getElementById('idle-clock');
    if (idleClock) idleClock.textContent = timeStr;

    if (dateEl) {
        const locale = currentLang === 'pt' ? 'pt-BR' : 'en-US';
        const dateStr = now.toLocaleDateString(locale, { weekday:'long', day:'numeric', month:'long', year:'numeric' }).toUpperCase();
        dateEl.textContent = dateStr;
        const idleDate = document.getElementById('idle-date');
        if (idleDate) idleDate.textContent = dateStr;
    }
}

// ─── DIALOGUE LOG ────────────────────────────────────────────────────────────
function logDialogue(who, text) {
    const log = document.getElementById('dialogue-log');
    if (!log) return;
    const div = document.createElement('div');
    div.className = `dialogue-entry ${who.toLowerCase()}`;
    div.textContent = `[${who.toUpperCase()}]: ${text}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    
    // Limit log size
    if (log.childNodes.length > 20) log.removeChild(log.firstChild);
}

// ─── VISIBILITY CONTROL ──────────────────────────────────────────────────────
function toggleVisibility(id, show, name) {
    const el = document.getElementById(id);
    if (!el) return;
    
    el.style.transition = 'all 0.4s cubic-bezier(0.19, 1, 0.22, 1)';

    if (show === undefined) {
        show = el.style.display === 'none' || el.style.opacity === '0';
    }

    const isCore = id.includes('core');

    if (show) {
        el.style.display = '';
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = isCore ? 'translate(-50%, -50%) scale(1)' : 'scale(1)';
            el.style.pointerEvents = 'all';
        }, 10);
        speak(currentLang === 'pt' ? `Restaurando ${name} senhor.` : `Restoring ${name} sir.`);
    } else {
        el.style.opacity = '0';
        el.style.transform = isCore ? 'translate(-50%, -50%) scale(0.9)' : 'scale(0.95)';
        el.style.pointerEvents = 'none';
        setTimeout(() => { if (el.style.opacity === '0') el.style.display = 'none'; }, 400);
        speak(currentLang === 'pt' ? `Escondendo ${name} senhor.` : `Hiding ${name} sir.`);
    }
}

// ─── 3D GLOBE ───────────────────────────────────────────────────────────────
function init3DGlobe() {
    const container = document.getElementById('globe-3d');
    if (!container || globeRenderer) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    globeScene = new THREE.Scene();
    globeCamera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    globeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    globeRenderer.setSize(width, height);
    container.appendChild(globeRenderer.domElement);

    // Create a wireframe sphere for the holographic look
    const geometry = new THREE.SphereGeometry(5, 32, 32);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0x00f2ff, 
        wireframe: true, 
        transparent: true, 
        opacity: 0.1 
    });
    globe = new THREE.Mesh(geometry, material);
    globeScene.add(globe);

    // Add a glowing core
    const coreGeom = new THREE.SphereGeometry(4.8, 32, 32);
    const coreMat = new THREE.MeshBasicMaterial({ 
        color: 0x00f2ff, 
        transparent: true, 
        opacity: 0.05 
    });
    const core = new THREE.Mesh(coreGeom, coreMat);
    globeScene.add(core);

    globeCamera.position.z = 10;

    function animate() {
        requestAnimationFrame(animate);
        globe.rotation.y += 0.005;
        globe.rotation.x += 0.002;
        globeRenderer.render(globeScene, globeCamera);
    }
    animate();
}

// ─── TASK MANAGEMENT ─────────────────────────────────────────────────────────
function updateTaskList() {
    const list = document.getElementById('task-list');
    if (!list) return;
    if (taskList.length === 0) {
        list.innerHTML = '<div style="opacity: 0.5;">NO ACTIVE TASKS</div>';
        return;
    }
    list.innerHTML = taskList.map((t, i) => `
        <div class="task-item" style="margin-bottom: 5px; display: flex; justify-content: space-between;">
            <span>[${t.time}] ${t.text}</span>
            <span style="color: var(--cyan); cursor: pointer;" onclick="removeTask(${i})">✕</span>
        </div>
    `).join('');
}

function removeTask(index) {
    taskList.splice(index, 1);
    localStorage.setItem('jarvis_tasks', JSON.stringify(taskList));
    updateTaskList();
}

window.removeTask = removeTask; // Export to global for onclick

function addReminder(text, delayMin) {
    const time = new Date(Date.now() + delayMin * 60000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const newTask = { text, time, timestamp: Date.now() + delayMin * 60000 };
    taskList.push(newTask);
    localStorage.setItem('jarvis_tasks', JSON.stringify(taskList));
    updateTaskList();

    setTimeout(() => {
        speak(getString('timerUp', { min: delayMin }) + " " + text);
        // Find and remove the task
        const idx = taskList.findIndex(t => t.timestamp === newTask.timestamp);
        if (idx !== -1) removeTask(idx);
    }, delayMin * 60000);
}

// ─── NEWS FEED ───────────────────────────────────────────────────────────────
const NEWS_TOPICS = [
    "Quantum computing threshold surpassed in recent lab tests.",
    "Global satellite network confirms 99.9% uptime for J.A.R.V.I.S. link.",
    "Cybersecurity alert: Multiple zero-day exploits patched automatically.",
    "Weather patterns shifting: Arctic air moving towards lower latitudes.",
    "Stock market volatility detected in tech sectors.",
    "New AI ethics framework proposed by international committee."
];

function updateNews() {
    const feed = document.getElementById('news-feed');
    if (!feed) return;
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2,'0') + ":" + now.getMinutes().toString().padStart(2,'0');
    const topic = NEWS_TOPICS[Math.floor(Math.random() * NEWS_TOPICS.length)];
    
    const div = document.createElement('div');
    div.className = 'news-item';
    div.innerHTML = `<span class="time">[${timeStr}]</span> ${topic}`;
    feed.prepend(div);
    if (feed.childNodes.length > 5) feed.removeChild(feed.lastChild);
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
function showNotification(data) {
    const center = document.getElementById('notification-center');
    if (!center) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    const iconMap = {
        'GMAIL': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`,
        'WHATSAPP': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>`,
        'DEFAULT': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
    };
    
    const iconSvg = iconMap[data.type] || iconMap['DEFAULT'];
    
    toast.innerHTML = `
        <div class="toast-icon-container">
            <div class="toast-icon">${iconSvg}</div>
            <div class="icon-scanline"></div>
        </div>
        <div class="toast-content">
            <div class="toast-title">${data.title}</div>
            <div class="toast-body">${data.body}</div>
        </div>
        <div class="toast-progress"></div>
    `;

    center.appendChild(toast);

    if (data.voice) speak(data.voice);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 500);
    }, 8000);
}

async function checkNotifications() {
    try {
        const r = await fetch('http://127.0.0.1:3001/api/notifications');
        const d = await r.json();
        if (d.success && d.notifications.length > 0) {
            d.notifications.forEach(n => showNotification(n));
        }
    } catch (e) {}
}

// ─── TELEMETRY ───────────────────────────────────────────────────────────────
let startTime = Date.now();
let isAlertActive = false;
let lastAlertSpeak = 0;

function checkSystemAlerts(temp) {
    const threshold = 80; // High temp threshold
    const body = document.body;
    
    if (temp >= threshold) {
        if (!isAlertActive) {
            isAlertActive = true;
            body.classList.add('alert-mode');
            
            // Speak only every 5 minutes to avoid annoyance
            if (Date.now() - lastAlertSpeak > 300000) {
                speak(currentLang === 'pt' ? 
                    "Atenção senhor, detectando superaquecimento nos núcleos centrais. Temperatura em " + Math.round(temp) + " graus." : 
                    "Attention sir, detecting overheating in central cores. Temperature at " + Math.round(temp) + " degrees.");
                lastAlertSpeak = Date.now();
            }
        }
    } else if (temp < threshold - 5) { // Hysteresis to avoid flickering
        if (isAlertActive) {
            isAlertActive = false;
            body.classList.remove('alert-mode');
            speak(currentLang === 'pt' ? "Temperatura normalizada. Sistemas resfriados." : "Temperature normalized. Systems cooled down.");
        }
    }
}

async function updateTelemetry() {
    const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptimeSec / 3600).toString().padStart(2, '0');
    const m = Math.floor((uptimeSec % 3600) / 60).toString().padStart(2, '0');
    const s = (uptimeSec % 60).toString().padStart(2, '0');
    const uptimeEl = document.getElementById('uptime-top');
    if (uptimeEl) uptimeEl.textContent = `UPTIME: ${h}:${m}:${s}`;

    try {
        const r = await fetch('http://127.0.0.1:3001/api/stats');
        const d = await r.json();
        
        // CPU
        const cpuBar = document.getElementById('cpu-bar');
        const cpuLoad = document.getElementById('cpu-load');
        if (cpuBar) cpuBar.style.width = `${d.cpu}%`;
        if (cpuLoad) cpuLoad.textContent = `LOAD: ${d.cpu.toFixed(1)}%`;
        
        // GPU
        const gpuBar = document.getElementById('gpu-bar');
        const gpuLoad = document.getElementById('gpu-load');
        const gpuName = document.getElementById('gpu-name');
        if (gpuBar) gpuBar.style.width = `${d.gpu}%`;
        if (gpuLoad) gpuLoad.textContent = `GPU: ${d.gpu.toFixed(1)}%`;
        if (gpuName) gpuName.textContent = d.gpuName || 'NVIDIA GPU';
        
        // RAM & Tasks
        const ramBar = document.getElementById('ram-bar');
        const ramUsage = document.getElementById('ram-usage');
        if (ramBar) ramBar.style.width = `${d.memory}%`;
        if (ramUsage) ramUsage.textContent = `MEM: ${d.memory}%`;
        
        // Idle updates
        const idleCpu = document.getElementById('idle-cpu-val');
        if (idleCpu) idleCpu.textContent = `${Math.round(d.cpu)}%`;
        const idleMem = document.getElementById('idle-mem-val');
        if (idleMem) idleMem.textContent = `${d.memory}%`;
        
        const taskCount = document.getElementById('task-count');
        if (taskCount) taskCount.textContent = `TASKS: ${d.processes}`;
        
        const sysTemp = document.getElementById('sys-temp');
        if (sysTemp) sysTemp.textContent = `TEMP: ${d.temp}°C`;

        // Check for alert conditions
        checkSystemAlerts(d.temp);

        const netDisplay = document.getElementById('net-ping-display');
        if (netDisplay) {
            const ping = Math.floor(Math.random() * 15) + 5;
            // Mask IP for privacy: show only first octet
            const maskedIp = (d.ip || '127.0.0.1').replace(/(\d+\.\d+\.)(\d+\.\d+)/, '$1***.***');
            netDisplay.textContent = `PING: ${ping}ms | IP: ${maskedIp}`;
        }

    } catch (e) {
        console.warn('Backend telemetry unavailable');
    }
}

async function fetchNewsTicker() {
    const tickerEl = document.getElementById('news-ticker');
    if (!tickerEl) return;

    try {
        const r = await fetch(`http://127.0.0.1:3001/api/news?lang=${currentLang}`);
        const d = await r.json();
        
        if (d.success && d.news.length > 0) {
            tickerEl.innerHTML = d.news.map(title => `<span class="ticker-item">${title.toUpperCase()}</span>`).join('');
            // 12 seconds per headline for comfortable reading speed
            const duration = d.news.length * 12;
            tickerEl.style.animation = 'none';
            tickerEl.offsetHeight; // trigger reflow
            tickerEl.style.animation = `ticker-scroll ${duration}s linear infinite`;
        }
    } catch (e) {
        console.warn('News ticker update failed');
    }
}

// ─── WEATHER MAP ─────────────────────────────────────────────────────────────
function initWeatherMap() {
    if (weatherMap) return;
    weatherMap = L.map('weather-map', {
        zoomControl: false,
        attributionControl: false
    }).setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(weatherMap);
    
    // Auto-locate
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        weatherMap.setView([lat, lon], 10);
        L.circle([lat, lon], { radius: 2000, color: '#00f2ff', fillColor: '#00f2ff', fillOpacity: 0.5 }).addTo(weatherMap);
        updateWeatherInfo(lat, lon);
    });
}

async function updateWeatherInfo(lat, lon) {
    try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const d = await r.json();
        const cw = d.current_weather;
        document.getElementById('weather-temp-large').textContent = `${Math.round(cw.temperature)}°C`;
        document.getElementById('weather-details').textContent = weatherDesc(cw.weathercode).toUpperCase() + `\n WIND: ${cw.windspeed}KM/H`;
        
        // Idle updates
        const idleTemp = document.getElementById('idle-temp');
        if (idleTemp) idleTemp.textContent = `${Math.round(cw.temperature)}°C`;
        const idleDesc = document.getElementById('idle-weather-desc');
        if (idleDesc) idleDesc.textContent = weatherDesc(cw.weathercode).toUpperCase();
    } catch(e){}
}

function weatherDesc(code) {
    if (code === 0) return 'Clear';
    if (code <= 3) return 'Partly Cloudy';
    if (code <= 48) return 'Foggy';
    if (code <= 67) return 'Rainy';
    if (code <= 77) return 'Snowing';
    return 'Stormy';
}

// ─── NETWORK CANVAS ──────────────────────────────────────────────────────────
function initNetworkMap() {
    networkCanvas = document.getElementById('network-map');
    if (!networkCanvas) return;
    networkCtx = networkCanvas.getContext('2d');
    
    // Set size
    networkCanvas.width = networkCanvas.offsetWidth;
    networkCanvas.height = networkCanvas.offsetHeight;

    // Create random nodes
    for (let i = 0; i < 30; i++) {
        nodes.push({
            x: Math.random() * networkCanvas.width,
            y: Math.random() * networkCanvas.height,
            r: Math.random() * 2 + 1,
            pulse: Math.random() * Math.PI,
            speed: Math.random() * 0.05 + 0.02
        });
    }

    requestAnimationFrame(drawNetwork);
}

function drawNetwork() {
    if (!networkCtx) return;
    const ctx = networkCtx;
    const w = networkCanvas.width;
    const h = networkCanvas.height;

    ctx.clearRect(0, 0, w, h);
    
    // Draw connections
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
            if (dist < 60) {
                ctx.beginPath();
                ctx.moveTo(nodes[i].x, nodes[i].y);
                ctx.lineTo(nodes[j].x, nodes[j].y);
                ctx.stroke();
            }
        }
    }

    // Draw nodes
    nodes.forEach(n => {
        n.pulse += n.speed;
        const alpha = 0.2 + Math.sin(n.pulse) * 0.3;
        ctx.fillStyle = `rgba(0, 242, 255, ${alpha + 0.2})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
        
        // Glow
        if (alpha > 0.4) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#00f2ff';
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    });

    requestAnimationFrame(drawNetwork);
}

// ─── AUDIO VISUALIZER ────────────────────────────────────────────────────────
async function initAudioVisualizer() {
    if (isAudioInit) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        isAudioInit = true;
        animateVisualizer();
    } catch (err) {
        console.warn("Microphone access denied for visualizer:", err);
    }
}

function animateVisualizer() {
    if (!isAudioInit) return;
    requestAnimationFrame(animateVisualizer);
    
    analyser.getByteFrequencyData(dataArray);
    
    // Split frequencies for different rings
    // Bass (0-10), Mid (10-40), Treble (40-100)
    let bass = 0, mid = 0, treble = 0;
    
    for (let i = 0; i < 10; i++) bass += dataArray[i];
    for (let i = 10; i < 40; i++) mid += dataArray[i];
    for (let i = 40; i < 100; i++) treble += dataArray[i];
    
    bass = bass / 10 / 255;
    mid = mid / 30 / 255;
    treble = treble / 60 / 255;

    const ringOuter = document.querySelector('.ring-outer');
    const ringMid = document.querySelector('.ring-mid');
    const ringInner = document.querySelector('.ring-inner');
    const orb = document.querySelector('.orb');
    const voiceWaves = document.getElementById('voice-wave');

    if (ringOuter) ringOuter.style.setProperty('--s', 1 + bass * 0.15);
    if (ringMid) ringMid.style.setProperty('--s', 1 + mid * 0.2);
    if (ringInner) ringInner.style.setProperty('--s', 1 + treble * 0.25);
    if (orb) orb.style.setProperty('--s', 1 + bass * 0.1);

    // Also update the small voice waves at the bottom of the core
    if (voiceWaves && document.body.classList.contains('speaking-active')) {
        const spans = voiceWaves.querySelectorAll('span');
        spans.forEach((span, i) => {
            const val = dataArray[i * 4] || 0;
            const h = 5 + (val / 255) * 40;
            span.style.height = `${h}px`;
        });
    }
}

// ─── SPEECH SYNTHESIS ────────────────────────────────────────────────────────
const synthesis = window.speechSynthesis;
let voices = [], voiceIndex = 0;
function loadVoices() {
    voices = synthesis.getVoices();
    const langPrefix = currentLang.split('-')[0];
    const available = voices.filter(v => v.lang.startsWith(langPrefix));
    
    if (available.length > 0) {
        let pref = -1;
        if (langPrefix === 'en') {
            // Priority for natural British male voices
            pref = available.findIndex(v => 
                v.name.includes('Google UK English Male') || 
                v.name.includes('Microsoft Daniel') || 
                v.name.includes('Arthur') || 
                v.name.includes('Male')
            );
        } else if (langPrefix === 'pt') {
            // Prioridade total para vozes masculinas brasileiras
            // Tentamos encontrar especificamente o 'Antonio' ou qualquer uma que diga 'Male' e 'BR'
            pref = available.findIndex(v => v.name.includes('Antonio'));
            if (pref === -1) pref = available.findIndex(v => v.name.includes('Male') && (v.lang.includes('BR') || v.lang.includes('PT')));
            if (pref === -1) pref = available.findIndex(v => v.name.includes('Google português do Brasil'));
            if (pref === -1) pref = available.findIndex(v => v.name.includes('Daniel'));
        }
        voiceIndex = voices.indexOf(available[pref !== -1 ? pref : 0]);
    }
}
synthesis.onvoiceschanged = loadVoices;

function speak(text) {
    if (document.body.classList.contains('sleep-mode')) return;
    synthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    
    // Tweak for a more sophisticated, less robotic sound
    u.rate = 0.92;  // Slightly slower for more natural prosody
    u.pitch = 0.82; // Deeper tone for authority
    u.volume = jarvisVolume;

    
    if (voices[voiceIndex]) {
        u.voice = voices[voiceIndex];
        // Ajuste fino para vozes da Google que costumam ser mais agudas
        if (u.voice.name.includes('Google')) {
            u.pitch = 0.9;
            u.rate = 0.95;
        }
    }
    u.onstart = () => {
        document.body.classList.add('speaking-active');
        logDialogue('JARVIS', text);
    };
    u.onend = () => document.body.classList.remove('speaking-active');
    synthesis.speak(u);
}

function stopSpeaking() {
    synthesis.cancel();
    document.body.classList.remove('speaking-active');
}

// ─── COMMAND PARSER ──────────────────────────────────────────────────────────
// ─── COMMAND PARSER ──────────────────────────────────────────────────────────
async function handleVoiceCommand(text) {
    if (!commandsEnabled) return;
    
    // Noise & AI Hallucination Filter
    let t = text.toLowerCase().trim();
    
    // Remove self-references and common robotic prefixes
    t = t.replace(/^jarvis\s+|^ai\s+|^artificial intelligence\s+/gi, '');
    t = t.replace(/.*(?:especially my neck|i didn't find anything|searching my databases for)\s*/gi, '');
    t = t.trim();

    if (!t) return;
    
    // Check for Sleep Mode blocking
    const isWakeUp = /wake up|acordar|acorde|activar sistemas|ativar sistemas/.test(t);
    if (document.body.classList.contains('sleep-mode') && !isWakeUp) {
        return; 
    }
    
    logDialogue('USER', t);
    if (/mute|mutar|mudo|silence|quiet|meet me|stop listening|desativar microfone/.test(t)) {
        toggleMic();
        return;
    }
    if (/^(stop|parar|pare|silence|silêncio|shut up)$/i.test(t) || /stop.*talking|shut.*up|parar.*falar|silêncio|pare de falar/.test(t)) {
        stopSpeaking();
        return;
    }

    // 1. Priority: Hide Map (Strict)
    if (/^(hide map|close map|esconder mapa|fechar mapa|hide tactical map|fechar mapa tático)$/.test(t) || t === 'hide map' || t === 'esconder mapa') {
        const container = document.getElementById('map-container');
        if (container) {
            container.classList.remove('active');
            speak(currentLang === 'pt' ? 'Mapa recolhido, senhor.' : 'Map retracted, sir.');
            return;
        }
    }
    // 11. Language Switch
    if (/(?:switch|change|mudar|muda|trocar|troca|idioma|language|falar|fale).*(?:english|inglês)/i.test(t)) {
        setLanguage('en');
        return;
    }
    if (/(?:switch|change|mudar|muda|trocar|troca|idioma|language|falar|fale).*(?:portuguese|português)/i.test(t)) {
        setLanguage('pt');
        return;
    }
    
    // 1.1 Reminders & Timers
    const reminderMatch = t.match(/(?:remind me to|remember me to|lembra-me de|lembrar de) (.+) (?:in|em) (\d+) (?:minutes|minutos|minuto|minute)/);
    if (reminderMatch) {
        const task = reminderMatch[1].trim();
        const mins = parseInt(reminderMatch[2]);
        addReminder(task, mins);
        speak(getString('timerSet', { min: mins }));
        return;
    }

    // 1.2 Google Calendar & Gmail
    if (/agenda|calendar|o que tenho para hoje|compromissos/.test(t)) {
        speak(currentLang === 'pt' ? 'Consultando sua agenda, senhor.' : 'Accessing your calendar, sir.');
        try {
            const r = await fetch('http://127.0.0.1:3001/api/google/calendar');
            const d = await r.json();
            if (d.success) {
                if (d.events.length === 0) {
                    speak(currentLang === 'pt' ? 'Você não tem compromissos para hoje, senhor.' : 'You have no events scheduled for today, sir.');
                } else {
                    let msg = currentLang === 'pt' ? 'Seus próximos compromissos são: ' : 'Your upcoming events are: ';
                    d.events.forEach(e => { 
                        msg += `${e.summary}${currentLang === 'pt' ? ' em ' : ' on '} ${new Date(e.start).toLocaleDateString(currentLang === 'pt' ? 'pt-BR' : 'en-US')}. `; 
                    });
                    speak(msg);
                }
            } else if (d.error === 'NO_CREDENTIALS') {
                speak(currentLang === 'pt' ? 'A integração com o Google não foi configurada. Por favor, adicione o arquivo credentials.json.' : 'Google integration not configured. Please add the credentials.json file.');
            } else { speak(getString('noInfo')); }
        } catch (e) { speak(getString('noInfo')); }
        return;
    }

    if (/emails|gmail|e-mails|novos e-mails|tenho e-mails/.test(t)) {
        speak(currentLang === 'pt' ? 'Verificando sua caixa de entrada, senhor.' : 'Checking your inbox, sir.');
        try {
            const r = await fetch('http://127.0.0.1:3001/api/google/gmail');
            const d = await r.json();
            if (d.success) {
                if (d.emails.length === 0) {
                    speak(currentLang === 'pt' ? 'Você não tem e-mails novos, senhor.' : 'You have no new emails, sir.');
                } else {
                    let msg = currentLang === 'pt' ? `Você tem ${d.emails.length} e-mails novos. ` : `You have ${d.emails.length} new emails. `;
                    d.emails.forEach(e => { 
                        const sender = e.from.split('<')[0].trim();
                        if (currentLang === 'pt') {
                            msg += `De ${sender}, assunto: ${e.subject}. `; 
                        } else {
                            msg += `From ${sender}, subject: ${e.subject}. `;
                        }
                    });
                    speak(msg);
                }
            } else if (d.error === 'NO_CREDENTIALS') {
                speak(currentLang === 'pt' ? 'A integração com o Gmail não foi configurada.' : 'Gmail integration not configured.');
            } else { speak(getString('noInfo')); }
        } catch (e) { speak(getString('noInfo')); }
        return;
    }
    
    // ─── CRITICAL UI COMMANDS (TOP PRIORITY) ───
    if (/wake up|acordar|acorde|activar sistemas|ativar sistemas/.test(t)) {
        document.body.classList.remove('sleep-mode');
        // Visual boot-up sequence
        document.body.classList.add('booting-up');
        setTimeout(() => document.body.classList.remove('booting-up'), 800);

        // Update status labels
        const sysStatus = document.getElementById('system-status');
        if (sysStatus) sysStatus.textContent = 'SYSTEM: OPTIMAL';
        const idleStatus = document.querySelector('.idle-status');
        if (idleStatus) idleStatus.textContent = 'SYSTEM ONLINE';
        
        speak(currentLang === 'pt' ? "Sistemas ativados, senhor. Todos os módulos online." : "Systems activated, sir. All modules online.");
        return;
    }
    if (/go to sleep|dormir|desativar módulos|limpar interface/.test(t)) {
        document.body.classList.add('sleep-mode');
        const sysStatus = document.getElementById('system-status');
        if (sysStatus) sysStatus.textContent = 'SYSTEM: SLEEP MODE';
        const idleStatus = document.querySelector('.idle-status');
        if (idleStatus) idleStatus.textContent = 'SECURITY MONITORING ACTIVE';

        speak(currentLang === 'pt' ? "Entrando em modo de espera, senhor." : "Entering sleep mode, sir.");
        return;
    }

    if (/(?:hide|esconder|remover|limpar).*(?:everything|tudo|hud|interface|all)/i.test(t)) {
        // Hide only sidebars and modules, keep the CORE visible
        document.querySelectorAll('.module-card, .sidebar').forEach(el => {
            if (el.id) {
                const name = el.id.replace('module-', '');
                toggleVisibility(el.id, false, name);
            } else {
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
            }
        });
        speak(currentLang === 'pt' ? "Limpando interface senhor." : "Clearing interface sir.");
        return;
    }
    if (/(?:show|mostrar|exibir|restaurar|ativar).*(?:everything|tudo|hud|interface|all)/i.test(t)) {
        document.querySelectorAll('.module-card, .sidebar').forEach(el => {
            if (el.id) {
                const name = el.id.replace('module-', '');
                toggleVisibility(el.id, true, name);
            } else {
                el.style.display = '';
                el.style.opacity = '1';
                el.style.pointerEvents = 'all';
            }
        });
        const core = document.querySelector('.core-display');
        if (core) {
            core.style.display = '';
            core.style.opacity = '1';
            core.style.transform = 'translate(-50%, -50%) scale(1)';
            core.style.pointerEvents = 'all';
        }
        speak(currentLang === 'pt' ? "Restaurando todos os sistemas senhor." : "Restoring all systems sir.");
        return;
    }

    // ─── GREETINGS ───
     // 12. Visibility Commands (Specific Modules)
    const toggleMatch = t.match(/(hide|show|esconder|mostrar|remover|exibir) (.+)/i);
    if (toggleMatch) {
        const action = toggleMatch[1].toLowerCase();
        const target = toggleMatch[2].toLowerCase();
        const show = action === 'show' || action === 'mostrar' || action === 'exibir';
        
        const moduleMap = {
            'weather': 'module-weather', 'clima': 'module-weather', 'tempo': 'module-weather',
            'cpu': 'module-cpu', 'processador': 'module-cpu',
            'gpu': 'module-gpu', 'video': 'module-gpu', 'gráfica': 'module-gpu',
            'network': 'module-network', 'rede': 'module-network', 'internet': 'module-network',
            'memory': 'module-memory', 'ram': 'module-memory', 'memória': 'module-memory',
            'tasks': 'module-tasks', 'tarefas': 'module-tasks', 'matrix': 'module-tasks',
            'chat': 'module-chat', 'diálogo': 'module-chat', 'conversa': 'module-chat',
            'session': 'module-session', 'sessão': 'module-session', 'relógio': 'module-session',
            'volume': 'module-volume', 'som': 'module-volume',
            'sidebar left': 'sidebar-left', 'lateral esquerda': 'sidebar-left',
            'sidebar right': 'sidebar-right', 'lateral direita': 'sidebar-right',
            'core': 'core-display', 'núcleo': 'core-display', 'orb': 'core-display'
        };

        for (let key in moduleMap) {
            if (target.includes(key)) {
                toggleVisibility(moduleMap[key], show, key);
                return;
            }
        }
    }

    // 13. Global Hide/Show
    if (/hide all|esconder tudo|limpar interface/i.test(t)) {
        document.body.classList.add('hud-hidden');
        speak(currentLang === 'pt' ? "Limpando interface senhor." : "Clearing interface sir.");
        return;
    }
    if (/show all|mostrar tudo|restaurar interface/i.test(t)) {
        document.body.classList.remove('hud-hidden');
        speak(currentLang === 'pt' ? "Restaurando todos os sistemas senhor." : "Restoring all systems sir.");
        return;
    }

    // 2. Greetings
    if (/^(hello|hi|hey|ola|olá|bom dia|boa tarde|boa noite|wake up|acordar)/.test(t)) {
        const h = new Date().getHours();
        speak(getString(h < 12 ? 'greetingMorning' : h < 18 ? 'greetingAfternoon' : 'greetingEvening'));
        return;
    }

    // 3. System Status & Report
    if (/status|report|how.*system|diagnostics|relatório|como.*sistema/.test(t)) {
        try {
            const r = await fetch('http://127.0.0.1:3001/api/stats');
            const d = await r.json();
            speak(getString('report', { cpu: Math.round(d.cpu), mem: d.memory }));
        } catch (e) { speak(getString('reportFallback')); }
        return;
    }

    // 4. Weather (Expanded)
    if (/weather|temperature|clima|tempo|outside|temperatura/.test(t)) {
        const cityMatch = t.match(/(?:weather|temperature|clima|tempo|temperatura).*(?:in|of|em|de) (.+)/);
        
        if (cityMatch) {
            const city = cityMatch[1].trim();
            speak(currentLang === 'pt' ? `Buscando clima em ${city}, senhor.` : `Fetching weather for ${city}, sir.`);
            
            try {
                // Geocoding city name to coords
                const geoR = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`);
                const geoD = await geoR.json();
                
                if (geoD && geoD.length > 0) {
                    const { lat, lon } = geoD[0];
                    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
                    const d = await r.json();
                    const cw = d.current_weather;
                    speak(getString('weatherRes', { desc: weatherDesc(cw.weathercode), temp: Math.round(cw.temperature), wind: cw.windspeed }));
                    
                    // Update mini-map if active
                    if (weatherMap) weatherMap.setView([lat, lon], 10);
                    document.getElementById('weather-temp-large').textContent = `${Math.round(cw.temperature)}°C`;
                } else {
                    speak(currentLang === 'pt' ? `Não encontrei a localização de ${city}.` : `I couldn't locate ${city}, sir.`);
                }
            } catch(e) { speak(getString('weatherErr')); }
            return;
        }

        // Default Local Geolocation
        speak(getString('weatherInit'));
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude: lat, longitude: lon } = pos.coords;
            const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
            const d = await r.json();
            const cw = d.current_weather;
            speak(getString('weatherRes', { desc: weatherDesc(cw.weathercode), temp: Math.round(cw.temperature), wind: cw.windspeed }));
            document.getElementById('weather-temp-large').textContent = `${Math.round(cw.temperature)}°C`;
        }, () => speak(getString('weatherErr')));
        return;
    }

    // 5. Volume Control
    if (/volume up|turn.*up|louder|aumentar volume|mais alto/.test(t)) {
        await callBackend('/api/volume', { direction: 'up' });
        speak(getString('volUp'));
        return;
    }
    if (/volume down|turn.*down|quieter|mute|diminuir volume|abaixar volume|mais baixo/.test(t)) {
        await callBackend('/api/volume', { direction: 'down' });
        speak(getString('volDown'));
        return;
    }

    // Voice Volume (Specific)
    const voiceVolMatch = t.match(/(?:voice volume|volume da voz|volume voz|volume)[^\d]*(\d+)/i);
    if (voiceVolMatch && !/up|down|aumentar|diminuir|abaixar/.test(t)) {
        const val = parseInt(voiceVolMatch[1]);
        if (!isNaN(val)) {
            jarvisVolume = Math.min(100, Math.max(0, val)) / 100;
            localStorage.setItem('jarvis_volume', jarvisVolume);
            const slider = document.getElementById('voice-volume-slider');
            if (slider) slider.value = jarvisVolume;
            speak(currentLang === 'pt' ? `Volume da voz ajustado para ${val}% senhor.` : `Voice volume adjusted to ${val}% sir.`);
            return;
        }
    }


    // 6. Media Control
    if (/(play|resume|tocar|continuar a música)/.test(t) && !/(open|launch|start|abra)/.test(t)) {
        await callBackend('/api/media', { action: 'play' });
        speak(getString('play'));
        return;
    }
    if (/pause|stop music|stop playing|pausar|parar música/.test(t)) {
        await callBackend('/api/media', { action: 'pause' });
        speak(getString('pause'));
        return;
    }
    if (/next (song|track)|skip|próxima música|pular música/.test(t)) {
        await callBackend('/api/media', { action: 'next' });
        speak(getString('next'));
        return;
    }
    if (/previous (song|track)|back|música anterior|voltar música/.test(t)) {
        await callBackend('/api/media', { action: 'prev' });
        speak(getString('prev'));
        return;
    }

    // 7. Screenshot
    if (/screenshot|capture screen|print screen|captura de tela|tirar print/.test(t)) {
        await callBackend('/api/screenshot');
        speak(getString('screenshot'));
        return;
    }

    // 8. Apps: Launch & Close
    const closeMatch = t.match(/^(?:close|quit|kill|shutdown app|fechar|feche|encerrar|matar) (.+)/);
    if (closeMatch) {
        const app = closeMatch[1].trim();
        speak(currentLang === 'pt' ? `Encerrando ${app}, senhor.` : `Closing ${app}, sir.`);
        await callBackend('/api/close', { app });
        return;
    }

    const launchMatch = t.match(/^(?:open|launch|start|run|abra|abrir) (.+)/);
    if (launchMatch) {
        const app = launchMatch[1].trim();
        speak(getString('opening', { app }));
        await callBackend('/api/open', { app });
        return;
    }

    const searchMatch = t.match(/^(?:search for|search|google|pesquisar por|pesquise) (.+)/);
    if (searchMatch) {
        const q = searchMatch[1].trim();
        speak(getString('searchWeb', { q }));
        await callBackend('/api/websearch', { query: q });
        return;
    }

    // 9. Time & Date
    if (/what.*mean.*hours|meaning.*time|significa.*horas|para que serve.*relógio/i.test(t)) {
        speak(currentLang === 'pt' ? 
            "As horas indicam o tempo local sincronizado com seu sistema operacional, senhor. No topo, você também tem o tempo de atividade total da sessão." : 
            "The hours indicate the local time synchronized with your operating system, sir. At the top, you also have the total session uptime.");
        return;
    }

    if (/what.*time|tell.*time|current time|hours|horas|que horas/.test(t)) {
        const now = new Date();
        speak(getString('time', { hours: now.getHours(), minutes: now.getMinutes() }));
        return;
    }

    // 10. Map (Expanded)
    if (/(?:map 3d|3d map|mapa 3d|terra 3d)/i.test(t)) {
        const city = t.replace(/(?:map 3d|3d map|mapa 3d|terra 3d|of|de)/gi, '').trim() || 'London';
        speak(currentLang === 'pt' ? `Iniciando projeção 3D de ${city} senhor.` : `Initiating 3D projection of ${city} sir.`);
        
        // Update Custom UI
        document.getElementById('target-city').innerText = city.toUpperCase();
        
        // Show Container
        const mapCont = document.getElementById('map-container');
        mapCont.classList.add('active');
        mapCont.style.display = 'flex';

        // Geocoding via Nominatim (Free)
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${city}`)
            .then(r => r.json())
            .then(data => {
                if (data.length > 0) {
                    const lat = data[0].lat;
                    const lon = data[0].lon;
                    document.getElementById('target-coords').innerHTML = `LAT: ${parseFloat(lat).toFixed(4)}<br>LON: ${parseFloat(lon).toFixed(4)}`;
                    // Use OSMBuildings for real 3D buildings
                    document.getElementById('map-frame').src = `https://osmbuildings.org/?lat=${lat}&lon=${lon}&zoom=16&tilt=40`;
                } else {
                    document.getElementById('map-frame').src = `https://www.google.com/maps?q=${city}&t=k&z=17&output=embed`;
                }
            });
        
        init3DGlobe();
        return;
    }

    if (/map of|mapa de|onde fica|show me|me mostre/i.test(t)) {
        const city = t.split('of').pop().split('de').pop().split('me').pop().trim();
        speak(getString('openingMap', { city }));
        
        // Update Custom UI
        document.getElementById('target-city').innerText = city.toUpperCase();

        // Standard Satellite 2D
        document.getElementById('map-frame').src = `https://www.google.com/maps?q=${city}&output=embed&t=k`;
        
        const mapCont = document.getElementById('map-container');
        mapCont.classList.add('active');
        mapCont.style.display = 'flex';

        // Simulating coordinate scan for 2D map
        document.getElementById('target-coords').innerHTML = `LAT: ${ (Math.random() * 180 - 90).toFixed(4) }<br>LON: ${ (Math.random() * 360 - 180).toFixed(4) }`;
        
        init3DGlobe();
        return;
    }



    // ─── NEURAL BRAIN FALLBACK ─────────────────────────────────────────────
    // speak(getString('thinking', { q: t })); // Removed to prevent redundant speech
    try {
        const r = await fetch('http://127.0.0.1:3001/api/ask', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: t, lang: currentLang })
        });
        const d = await r.json();

        if (d.success && d.answer) {
            speak(d.answer);
        } else {
            speak(getString('noInfo'));
        }
    } catch (e) { 
        speak(getString('noInfo')); 
    }
}

// ─── MIC TOGGLE ─────────────────────────────────────────────────────────────
function toggleMic() {
    commandsEnabled = !commandsEnabled;
    const btn = document.getElementById('mute-btn');
    const status = document.getElementById('mic-status');
    
    if (commandsEnabled) {
        btn?.classList.remove('muted');
        if (status) { status.textContent = 'ACTIVE'; status.className = 'active'; }
        speak(getString('ready'));
    } else {
        btn?.classList.add('muted');
        if (status) { status.textContent = 'MUTED'; status.className = ''; }
        speak(currentLang === 'pt' ? 'Microfone desativado.' : 'Microphone muted.');
    }
}

// ─── SPEECH RECOGNITION ──────────────────────────────────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = currentLang === 'pt' ? 'pt-BR' : 'en-US';
    recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
        const cmd = transcript.replace(/hey\s+jarvis\s*/gi,'').replace(/jarvis\s*/gi,'').trim();
        
        // Allow unmuting even if commands are disabled
        if (!commandsEnabled) {
            if (/unmute|wake up|meet me|ativar microfone|acordar/.test(cmd)) {
                toggleMic();
            }
            return;
        }

        if (cmd.length > 1) {
            handleVoiceCommand(cmd);
        }
    };
    recognition.onend = () => { try { recognition.start(); } catch(e){} };
    recognition.start();
}

// ─── BOOT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('sleep-mode');
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(updateTelemetry, 2000);
    setInterval(updateNews, 15000);
    
    initWeatherMap();
    initNetworkMap();
    updateTelemetry();
    updateNews();
    updateTaskList();

    // Start Audio Visualizer on first interaction to comply with browser policies
    const startAudio = () => {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        initAudioVisualizer();
        document.removeEventListener('click', startAudio);
        document.removeEventListener('keydown', startAudio);
    };
    document.addEventListener('click', startAudio);
    document.addEventListener('keydown', startAudio);

    setInterval(checkNotifications, 15000); // Check every 15s
    fetchNewsTicker();
    setInterval(fetchNewsTicker, 900000); // Update ticker every 15 mins (feeds refresh ~hourly)


    document.getElementById('mute-btn').onclick = toggleMic;
    document.getElementById('close-map').onclick = () => {
        document.getElementById('map-container').classList.remove('active');
    };

    // Chat Input Listener
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                let cmd = chatInput.value.trim();
                if (cmd.length > 0) {
                    // Strip "jarvis" prefix if present
                    cmd = cmd.replace(/hey\s+jarvis\s*/gi,'').replace(/jarvis\s*/gi,'').trim();
                    handleVoiceCommand(cmd);
                    chatInput.value = '';
                }
            }
        });
    }

    // Voice Volume Slider
    const volSlider = document.getElementById('voice-volume-slider');
    if (volSlider) {
        volSlider.value = jarvisVolume;
        volSlider.oninput = (e) => {
            jarvisVolume = parseFloat(e.target.value);
            localStorage.setItem('jarvis_volume', jarvisVolume);
        };
        // Speaker test on change
        volSlider.onchange = () => {
            speak(currentLang === 'pt' ? "Teste de volume senhor." : "Volume test sir.");
        };
    }
});


