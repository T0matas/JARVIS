const express  = require('express');
const si        = require('systeminformation');
const { exec, execFile } = require('child_process');
const cors      = require('cors');
const fs        = require('fs');
const path      = require('path');
const app       = express();
const PORT      = 3001;

app.use(cors());
app.use(express.json());

// ─── STATS ───────────────────────────────────────────────────────────────────
let lastCpu = 0;
app.get('/api/stats', async (req, res) => {
    try {
        // Fetching real hardware data
        const [mem, disk, load, graphics, processes, network, temp] = await Promise.all([
            si.mem(), 
            si.fsSize(), 
            si.currentLoad(),
            si.graphics(),
            si.processes(),
            si.networkInterfaces(),
            si.cpuTemperature()
        ]);

        // Real IP Detection
        const activeNet = network.find(n => n.operstate === 'up' && !n.internal && n.ip4);
        const mainIp = activeNet ? activeNet.ip4 : '127.0.0.1';

        // Real GPU Detection
        const gpu = (graphics.controllers && graphics.controllers.length > 0) ? graphics.controllers[0] : null;
        let gpuLoad = 0;
        if (gpu) {
            gpuLoad = gpu.utilizationGpu != null ? gpu.utilizationGpu : (gpu.memoryUsed ? (gpu.memoryUsed / gpu.memoryTotal) * 100 : 0);
        }
        
        const cpuVal = load.currentLoad != null ? parseFloat(load.currentLoad.toFixed(1)) : lastCpu;
        lastCpu = cpuVal;

        // Find top process
        const topProc = processes.list && processes.list.length > 0 
            ? processes.list.sort((a, b) => b.cpu - a.cpu)[0] 
            : { name: 'System', cpu: 0 };
        
        res.json({ 
            cpu: cpuVal, 
            memory: mem.total > 0 ? Math.round((mem.active / mem.total) * 100) : 0, 
            disk: (disk && disk[0]) ? Math.round(disk[0].use || 0) : 0,
            gpu: parseFloat((gpuLoad || 0).toFixed(1)),
            gpuName: gpu ? (gpu.model || 'N/A') : 'None',
            processes: processes.all || processes.list.length || 0,
            topProcess: topProc.name,
            topProcessCpu: Math.round(topProc.cpu),
            ip: mainIp,
            temp: temp.main || 0
        });
    } catch (e) { 
        res.json({ cpu: 0, memory: 0, disk: 0, gpu: 0, processes: 0, ip: '127.0.0.1', temp: 0, topProcess: 'N/A' });
    }
});

// Media keys via PowerShell SendKeys
const MEDIA_KEYS = {
    play:  '(new-object -com wscript.shell).SendKeys([char]179)',
    pause: '(new-object -com wscript.shell).SendKeys([char]179)',
    next:  '(new-object -com wscript.shell).SendKeys([char]176)',
    prev:  '(new-object -com wscript.shell).SendKeys([char]177)',
};
app.post('/api/media', (req, res) => {
    const { action } = req.body;
    const ps = MEDIA_KEYS[action];
    if (!ps) return res.status(400).json({ success: false });
    exec(`powershell -NoProfile -Command "${ps}"`, (err) =>
        res.json({ success: !err })
    );
});

// Volume control via PowerShell
app.post('/api/volume', (req, res) => {
    const { direction } = req.body;
    const key = direction === 'up' ? '[char]175' : '[char]174';
    // Send volume key 5 times for noticeable change
    const ps = `$wsh = new-object -com wscript.shell; for($i=0;$i-lt5;$i++){$wsh.SendKeys(${key})}`;
    exec(`powershell -NoProfile -Command "${ps}"`, (err) =>
        res.json({ success: !err })
    );
});

// Screenshot via Win+PrtScn
app.post('/api/screenshot', (req, res) => {
    const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('%{PRTSC}')`;
    exec(`powershell -NoProfile -Command "${ps}"`, (err) =>
        res.json({ success: !err })
    );
});

// Close specific app
app.post('/api/close', (req, res) => {
    const raw = (req.body.app || '').trim().replace(/['"]/g, '');
    if (!raw) return res.status(400).json({ success: false });

    const scriptPath = path.join(require('os').tmpdir(), 'jarvis_close.ps1');
    const script = `Get-Process | Where-Object { $_.Name -match "${raw}" -or $_.MainWindowTitle -match "${raw}" } | Stop-Process -Force`;
    fs.writeFileSync(scriptPath, script, 'utf8');

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, (err) =>
        res.json({ success: true })
    );
});

// ─── HARDCODED SHORTCUTS ─────────────────────────────────────────────────────
const SHORTCUTS = {
    'google':       'start chrome',
    'chrome':       'start chrome',
    'browser':      'start chrome',
    'spotify':      'start spotify:',
    'discord':      'start discord:',
    'whatsapp':     'start whatsapp:',
    'telegram':     'start telegram:',
    'roblox':       'start roblox-player:',
    'steam':        'start steam:',
    'fortnite':     'start com.epicgames.launcher://apps/Fortnite?action=launch&silent=true',
    'cs2':          'start steam://rungameid/730',
    'counterstrike':'start steam://rungameid/730',
    'valorant':     'start rclient://',
    'epicgames':    'start com.epicgames.launcher://',
    'epic':         'start com.epicgames.launcher://',
    'vscode':       'code .',
    'code':         'code .',
    'terminal':     'start powershell',
    'powershell':   'start powershell',
    'notepad':      'start notepad',
    'calculator':   'start calc',
    'calc':         'start calc',
    'paint':        'start mspaint',
    'explorer':     'start explorer',
    'files':        'start explorer',
    'lock':         'rundll32.exe user32.dll,LockWorkStation',
    'shutdown':     'shutdown /s /t 5',
    'restart':      'shutdown /r /t 5',
};

// ─── WEB SEARCH ───────────────────────────────────────────────────────────────
app.post('/api/websearch', (req, res) => {
    const q = (req.body.query || '').trim();
    if (!q) return res.status(400).json({ success: false });
    
    // Attempt to open in Chrome first, then fallback to default browser
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    exec(`start chrome "${url}"`, (err) => {
        if (err) {
            // Important: 'start' treats the first quoted argument as a title. 
            // Use an empty title "" to ensure the URL opens correctly.
            exec(`start "" "${url}"`, (err2) => {
                res.json({ success: !err2 });
            });
        } else {
            res.json({ success: true });
        }
    });
});

// ─── OPEN ENDPOINT ────────────────────────────────────────────────────────────
app.post('/api/open', (req, res) => {
    const raw = (req.body.app || '').trim();
    if (!raw) return res.status(400).json({ success: false, error: 'No app name' });

    const normalized = raw.toLowerCase().replace(/\s+/g, '');

    // 1. Exact shortcut
    if (SHORTCUTS[normalized]) {
        return runCmd(SHORTCUTS[normalized], raw, res, () => searchAndLaunch(raw, res));
    }

    // 2. Partial shortcut match
    const shortcutKey = Object.keys(SHORTCUTS).find(k => normalized.includes(k) || k.includes(normalized));
    if (shortcutKey) {
        return runCmd(SHORTCUTS[shortcutKey], raw, res, () => searchAndLaunch(raw, res));
    }

    // 3. Search for it on disk / registry
    searchAndLaunch(raw, res);
});

// ─── SEARCH ALL INSTALLED APPS VIA REGISTRY + PATHS ──────────────────────────
function searchAndLaunch(appName, res) {
    // Write a PowerShell script to a temp file to avoid all escaping issues
    const scriptPath = path.join(require('os').tmpdir(), 'jarvis_find.ps1');
    const appNameEscaped = appName.replace(/['"]/g, '');

    const pf86 = '${env:ProgramFiles(x86)}';
    const script = `
$name = "${appNameEscaped}"
$found = $null

# Search Start Menu shortcuts (.lnk) and Desktop internet shortcuts (.url)
$locations = @(
    "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
    "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
    "$env:PUBLIC\\Desktop",
    "$env:USERPROFILE\\Desktop"
)

foreach ($loc in $locations) {
    if (Test-Path $loc) {
        $lnk = Get-ChildItem -Path $loc -Recurse -Include "*.lnk", "*.url" -ErrorAction SilentlyContinue |
               Where-Object { $_.BaseName -like "*$name*" } |
               Select-Object -First 1
        if ($lnk) {
            $found = $lnk.FullName
            break
        }
    }
}

# Search executables in Program Files
if (-not $found) {
    $exeDirs = @(
        "$env:ProgramFiles",
        "${pf86}",
        "$env:LOCALAPPDATA\\Programs",
        "$env:LOCALAPPDATA"
    )
    foreach ($dir in $exeDirs) {
        if (Test-Path $dir) {
            $exe = Get-ChildItem -Path $dir -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue -Depth 3 |
                   Where-Object { $_.BaseName -like "*$name*" -and $_.BaseName -notlike "*unins*" -and $_.BaseName -notlike "*setup*" } |
                   Select-Object -First 1
            if ($exe) {
                $found = $exe.FullName
                break
            }
        }
    }
}

if ($found) {
    Write-Output "FOUND:$found"
    Start-Process -FilePath "$found"
} else {
    Write-Output "NOT_FOUND"
}
`.trim();

    fs.writeFileSync(scriptPath, script, 'utf8');

    exec(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${scriptPath}"`,
        { timeout: 15000 },
        (err, stdout, stderr) => {
            const out = (stdout || '').trim();
            console.log(`[SEARCH] "${appName}" → ${out.substring(0, 80)}`);

            if (out.startsWith('FOUND:')) {
                return res.json({ success: true });
            }
            res.status(404).json({ success: false, error: 'not_found' });
        }
    );
}

// ─── RUN COMMAND ─────────────────────────────────────────────────────────────
function runCmd(cmd, label, res, fallback) {
    console.log(`[RUN] ${cmd}`);
    exec(cmd, { timeout: 8000 }, (err) => {
        if (err) {
            console.error(`[FAIL] ${label}: ${err.message}`);
            if (fallback) return fallback();
            return res.status(500).json({ success: false, error: 'exec_failed' });
        }
        res.json({ success: true });
    });
}

// ─── GOOGLE INTEGRATION ───────────────────────────────────────────────────────
const { google } = require('googleapis');
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/gmail.readonly'];
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function getGoogleAuth() {
    if (!fs.existsSync(CREDENTIALS_PATH)) return null;
    const content = fs.readFileSync(CREDENTIALS_PATH);
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.web || credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    if (!fs.existsSync(TOKEN_PATH)) return 'NEED_AUTH';
    oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH)));
    return oAuth2Client;
}

app.get('/api/google/calendar', async (req, res) => {
    const auth = await getGoogleAuth();
    if (!auth) return res.json({ success: false, error: 'NO_CREDENTIALS' });
    if (auth === 'NEED_AUTH') return res.json({ success: false, error: 'NEED_AUTH' });

    const calendar = google.calendar({ version: 'v3', auth });
    try {
        const r = await calendar.events.list({
            calendarId: 'primary',
            timeMin: (new Date()).toISOString(),
            maxResults: 5,
            singleEvents: true,
            orderBy: 'startTime',
        });
        const events = r.data.items;
        res.json({ success: true, events: events.map(e => ({ summary: e.summary, start: e.start.dateTime || e.start.date })) });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

app.get('/api/google/gmail', async (req, res) => {
    const auth = await getGoogleAuth();
    if (!auth) return res.json({ success: false, error: 'NO_CREDENTIALS' });
    if (auth === 'NEED_AUTH') return res.json({ success: false, error: 'NEED_AUTH' });

    const gmail = google.gmail({ version: 'v1', auth });
    try {
        const r = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 5 });
        const messages = r.data.messages || [];
        const result = [];
        for (const m of messages) {
            const detail = await gmail.users.messages.get({ userId: 'me', id: m.id });
            const subject = detail.data.payload.headers.find(h => h.name === 'Subject')?.value || 'No Subject';
            const from = detail.data.payload.headers.find(h => h.name === 'From')?.value || 'Unknown';
            result.push({ subject, from });
        }
        res.json({ success: true, emails: result });
    } catch (e) { res.json({ success: false, error: e.message }); }
});

// ─── NOTIFICATIONS STATE ─────────────────────────────────────────────────────
const NOTIF_STORE = path.join(__dirname, 'last_notification.json');
let lastEmailId = null;

// Load persisted ID on startup
if (fs.existsSync(NOTIF_STORE)) {
    try { lastEmailId = JSON.parse(fs.readFileSync(NOTIF_STORE, 'utf8')).lastEmailId; } catch(e) {}
}

app.get('/api/notifications', async (req, res) => {
    const auth = await getGoogleAuth();
    if (!auth || auth === 'NEED_AUTH') return res.json({ success: false, notifications: [] });

    const gmail = google.gmail({ version: 'v1', auth });
    try {
        const r = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 1 });
        const messages = r.data.messages || [];
        
        if (messages.length === 0) return res.json({ success: true, notifications: [] });

        const latest = messages[0];

        // Quiet Initialization: if we never checked before, just save the current one and return empty
        if (lastEmailId === null) {
            lastEmailId = latest.id;
            fs.writeFileSync(NOTIF_STORE, JSON.stringify({ lastEmailId }), 'utf8');
            return res.json({ success: true, notifications: [] });
        }

        if (latest.id === lastEmailId) return res.json({ success: true, notifications: [] });

        // New notification!
        lastEmailId = latest.id;
        fs.writeFileSync(NOTIF_STORE, JSON.stringify({ lastEmailId }), 'utf8');

        const detail = await gmail.users.messages.get({ userId: 'me', id: latest.id });
        const subject = detail.data.payload.headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = detail.data.payload.headers.find(h => h.name === 'From')?.value || 'Unknown';
        const senderName = from.split('<')[0].trim() || from;

        res.json({ 
            success: true, 
            notifications: [{
                type: 'GMAIL',
                title: 'New Email',
                body: `${senderName}: ${subject}`,
                voice: `Sir, new email from ${senderName}. Subject: ${subject}`
            }] 
        });
    } catch (e) { res.json({ success: false, notifications: [] }); }
});

// ─── NEWS TICKER (REAL HEADLINES - MULTI-SOURCE) ──────────────────────────────
const cheerio = require('cheerio');

const NEWS_FEEDS = {
    en: [
        'https://feeds.bbci.co.uk/news/world/rss.xml',
        'https://feeds.bbci.co.uk/news/technology/rss.xml',
        'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
        'https://feeds.skynews.com/feeds/rss/world.xml',
        'https://www.aljazeera.com/xml/rss/all.xml',
    ],
    pt: [
        'https://g1.globo.com/rss/g1/',
        'https://g1.globo.com/rss/g1/brasil/',
        'https://g1.globo.com/rss/g1/politica/',
        'https://g1.globo.com/rss/g1/economia/',
        'https://g1.globo.com/rss/g1/mundo/',
    ]
};

// Cache so we don't hammer APIs
let newsCache = { en: [], pt: [], fetchedAt: 0 };
const NEWS_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

app.get('/api/news', async (req, res) => {
    const lang = (req.query.lang || 'en') === 'pt' ? 'pt' : 'en';
    
    // Return cache if still fresh
    if (newsCache[lang].length > 0 && Date.now() - newsCache.fetchedAt < NEWS_CACHE_TTL) {
        console.log(`[NEWS] Cache hit — ${newsCache[lang].length} headlines`);
        return res.json({ success: true, news: newsCache[lang] });
    }

    const feeds = NEWS_FEEDS[lang];
    console.log(`[NEWS] Fetching ${feeds.length} feeds for lang=${lang}`);

    const results = await Promise.allSettled(
        feeds.map(url => axios.get(url, {
            timeout: 8000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; JarvisHUD/2.0; RSS reader)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            }
        }))
    );

    const headlines = [];
    results.forEach((result, idx) => {
        if (result.status !== 'fulfilled') {
            console.warn(`[NEWS] Feed ${idx} failed: ${result.reason?.message}`);
            return;
        }
        try {
            const $ = cheerio.load(result.value.data, { xmlMode: true });
            $('item').each((i, el) => {
                if (i >= 5) return;
                const title = $(el).find('title').first().text().trim()
                    .replace(/<!\[CDATA\[|\]\]>/g, '').trim();
                const pubDate = $(el).find('pubDate').first().text().trim();
                const date = pubDate ? new Date(pubDate) : new Date();
                if (title && title.length > 10) {
                    headlines.push({ title, date });
                    console.log(`[NEWS] ✓ ${title.slice(0, 60)}`);
                }
            });
        } catch (e) {
            console.warn(`[NEWS] Parse error: ${e.message}`);
        }
    });

    // Sort newest first, deduplicate
    headlines.sort((a, b) => b.date - a.date);
    const unique = headlines
        .filter((h, i, arr) => arr.findIndex(x => x.title.slice(0, 40) === h.title.slice(0, 40)) === i)
        .slice(0, 20)
        .map(h => h.title);

    if (unique.length > 0) {
        newsCache[lang] = unique;
        newsCache.fetchedAt = Date.now();
        console.log(`[NEWS] Done — ${unique.length} headlines cached`);
        return res.json({ success: true, news: unique });
    }
    
    console.error('[NEWS] All feeds failed, returning empty');
    res.json({ success: false, news: [] });
});

// ─── KNOWLEDGE BRAIN (AI / SEARCH) ──────────────────────────────────────────
const axios = require('axios');

app.post('/api/ask', async (req, res) => {
    const { query, lang } = req.body;
    console.log(`[BRAIN] Query: "${query}" | Lang: ${lang}`);

    try {
        const q = (query || '').toLowerCase().trim();

        // ── 1. Math Evaluation ──────────────────────────────────────────────
        const mathMatch = query.replace(/[^-()\d/*+.]/g, '');
        if (/^[\d+\-*/().\s]+$/.test(mathMatch) && /[+\-*/]/.test(mathMatch)) {
            try {
                const result = Function(`"use strict"; return (${mathMatch})`)();
                const answer = lang === 'pt' ? `O resultado é ${result}.` : `The result is ${result}.`;
                console.log(`[BRAIN] Math: ${result}`);
                return res.json({ success: true, answer });
            } catch(e) { /* not math */ }
        }

        // ── 2. OLLAMA (Primary Brain) ───────────────────────────────────────
        try {
            const systemPrompt = lang === 'pt' 
                ? "Você é o J.A.R.V.I.S., um assistente de IA sofisticado e britânico. Responda de forma concisa, educada e sempre chame o usuário de 'senhor' ou 'sir'. Não use emojis."
                : "You are J.A.R.V.I.S., a sophisticated British AI assistant. Answer concisely, politely, and always address the user as 'sir'. Do not use emojis.";

            const ollamaRes = await axios.post('http://127.0.0.1:11434/api/generate', {
                model: 'llama3', // ou 'mistral'
                prompt: `${systemPrompt}\n\nUser: ${query}\nAssistant:`,
                stream: false,
                options: {
                    num_predict: 150, // Mantém respostas curtas para o HUD
                    temperature: 0.7
                }
            }, { timeout: 12000 });

            if (ollamaRes.data && ollamaRes.data.response) {
                console.log(`[BRAIN] Ollama Hit`);
                return res.json({ success: true, answer: ollamaRes.data.response.trim() });
            }
        } catch (e) {
            console.warn(`[OLLAMA] Offline or failed: ${e.message}`);
            // If Ollama fails, we continue to Wikipedia/DDG fallbacks
        }

        // ── Clean the query — strip question words ──────────────────────────
        const cleanQuery = query
            .replace(/^(who is|who was|who created|what is|what was|tell me about|explain|describe|search for|google|quem é|quem foi|quem criou|o que é|me fale sobre|pesquise sobre|sobre)\s+/gi, '')
            .trim();
        const wikiLang = lang === 'pt' ? 'pt' : 'en';
        console.log(`[BRAIN] Falling back to Wikipedia/DDG for: "${cleanQuery}"`);

        // ── 3. Wikipedia REST — direct page summary ─────────────────────────
        try {
            const url = `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery)}`;
            const r = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'JarvisHUD/1.0' } });
            if (r.data && r.data.extract && r.data.extract.length > 20) {
                return res.json({ success: true, answer: r.data.extract.substring(0, 600) });
            }
        } catch(e) {}

        // ── 4. Wikipedia OpenSearch ─────────────────────────────────────────
        try {
            const searchUrl = `https://${wikiLang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleanQuery)}&limit=3&namespace=0&format=json&origin=*`;
            const searchRes = await axios.get(searchUrl, { timeout: 8000 });
            const titles = (searchRes.data && searchRes.data[1]) ? searchRes.data[1] : [];
            for (const title of titles) {
                const sumUrl = `https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
                const sumRes = await axios.get(sumUrl, { timeout: 8000 });
                if (sumRes.data && sumRes.data.extract && sumRes.data.extract.length > 20) {
                    return res.json({ success: true, answer: sumRes.data.extract.substring(0, 600) });
                }
            }
        } catch(e) {}

        // ── 5. Built-in conversational responses (Emergency Fallback) ───────
        const R = {
            en: {
                who: "I am J.A.R.V.I.S., a Just A Rather Very Intelligent System, created to assist you with your daily operations.",
                how: "My systems are functioning within optimal parameters, sir. Thank you for asking.",
                thanks: "At your service, sir.",
                hello: "Hello, sir. How can I assist you today?"
            },
            pt: {
                who: "Eu sou o J.A.R.V.I.S., um sistema de inteligência artificial avançado, criado para auxiliar em todas as suas operações.",
                how: "Meus sistemas estão operando dentro dos parâmetros ideais, senhor. Obrigado por perguntar.",
                thanks: "Às suas ordens, senhor.",
                hello: "Olá, senhor. Como posso ajudá-lo hoje?"
            }
        };
        const rl = lang === 'pt' ? R.pt : R.en;
        const ql = q.toLowerCase();
        if (ql.match(/\b(who are you|quem é você|quem e voce)\b/i)) return res.json({ success: true, answer: rl.who });
        if (ql.match(/\b(how are you|como você está|como voce esta|tudo bem)\b/i)) return res.json({ success: true, answer: rl.how });
        if (ql.match(/\b(thank|obrigado|valeu|thanks)\b/i)) return res.json({ success: true, answer: rl.thanks });
        if (ql.match(/\b(hello|olá|oi|ola)\b/i)) return res.json({ success: true, answer: rl.hello });

        res.json({ success: false, error: 'No data found' });

    } catch (e) {
        console.error(`[BRAIN ERROR] ${e.message}`);
        res.json({ success: false, error: 'Search failed' });
    }
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(`[FATAL] ${err.stack}`);
    res.status(500).send('Internal Server Error');
});

app.listen(PORT, '0.0.0.0', () => console.log(`[J.A.R.V.I.S.] Backend on http://127.0.0.1:${PORT}`));


