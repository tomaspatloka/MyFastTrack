/**
 * MyFastTrack V3 - Kompletní aplikační logika
 */

// Registrace Service Workeru
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW Error:', err));
}

// Výchozí nastavení
const defaultConfig = {
    startWeight: 100,
    targetWeight: 80,
    eatingStart: "12:00",
    eatingEnd: "18:00",
    longFastDay: 5,       // 5 = Pátek
    longFastDuration: 37
};

let appConfig = JSON.parse(localStorage.getItem('ft_config')) || defaultConfig;
let weightChartInstance = null;

// DATA PRO JÍDELNÍČEK (14 DNÍ)
// --- DATA PRO JÍDELNÍČEK (14 DNÍ) ---
// Výchozí data (fallback)
const defaultMealPlanData = [
    {
        day: 1, title: "Startovací den", meals: [
            { id: "d1_m1", type: "Oběd", name: "Kuřecí prsa s rýží", portion: "150g maso, 60g rýže", desc: "Na přírodno, dušená zelenina, lžíce olivového oleje." },
            { id: "d1_m2", type: "Svačina", name: "Řecký jogurt a ořechy", portion: "200g jogurtu, 20g mandlí", desc: "Bílý jogurt Milko/Pilos (0-5% tuku)." },
            { id: "d1_m3", type: "Večeře", name: "Míchaná vejce se šunkou", portion: "3 vejce, 50g šunky", desc: "Na cibulce, k tomu okurka. Bez pečiva." }
        ]
    },
    {
        day: 2, title: "Ryba a lehčí den", meals: [
            { id: "d2_m1", type: "Oběd", name: "Pečená ryba (Pstruh/Treska)", portion: "200g ryba, 250g brambory", desc: "Na másle a bylinkách. Brambory vařené." },
            { id: "d2_m2", type: "Svačina", name: "Proteinový shake / Tvaroh", portion: "1 dávka / 250g", desc: "Rychlá bílkovina." },
            { id: "d2_m3", type: "Večeře", name: "Mozzarella salát", portion: "125g mozzarella, rajčata", desc: "S bazalkou a balzamikovým octem." }
        ]
    },
    {
        day: 3, title: "Hovězí síla", meals: [
            { id: "d3_m1", type: "Oběd", name: "Mleté hovězí s těstovinami", portion: "150g maso, 60g těstoviny", desc: "Maso na cibulce s rajčatovým pyré." },
            { id: "d3_m2", type: "Svačina", name: "Kefír / Acidofilní mléko", portion: "400ml", desc: "Pro trávení." },
            { id: "d3_m3", type: "Večeře", name: "Tuňákový salát", portion: "Konzerva tuňáka, vejce", desc: "Ve vlastní šťávě, se zeleninou a vejcem." }
        ]
    }
];

// Automatické doplnění dnů 4 až 14
for (let i = 4; i <= 14; i++) {
    defaultMealPlanData.push({
        day: i,
        title: `Den ${i} (Udržovací)`,
        meals: [
            { id: `d${i}_m1`, type: "Oběd", name: "Maso + Příloha", portion: "150g maso, 60g příloha", desc: "Kuřecí/Krůtí/Hovězí + Rýže/Brambory/Pohanka." },
            { id: `d${i}_m2`, type: "Svačina", name: "Bílkovina + Tuky", portion: "Jogurt/Tvaroh/Ořechy", desc: "Nebo proteinová tyčinka." },
            { id: `d${i}_m3`, type: "Večeře", name: "Lehká bílkovina", portion: "Vejce / Ryba / Sýr", desc: "Velký zeleninový salát, bez těžkých sacharidů." }
        ]
    });
}

// Načtení jídelníčku (buď uložený nebo default)
let mealPlanData = JSON.parse(localStorage.getItem('ft_mealPlan')) || defaultMealPlanData;


// Spuštění aplikace
document.addEventListener('DOMContentLoaded', () => {
    initShoppingList();
    initRecipes();
    initWeightTracker();
    initSettingsForm();
    initNotifications(); // Check permissions

    updateTimer();
    setInterval(updateTimer, 1000);

    // Sync from Cloud if available (silent)
    syncFromCloud();

    window.switchTab('dashboard', document.querySelector('.tab.active'));

    // Modal Close handlers
    document.getElementById('mealEditForm').addEventListener('submit', saveMealEdit);
});


// --- NAVIGACE ---

window.switchTab = function (tabId, btnElement) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));

    const selected = document.getElementById('view-' + tabId);
    if (selected) {
        selected.classList.remove('hidden');
    }

    if (btnElement) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        btnElement.classList.add('active');
    }

    if (tabId === 'weight') {
        renderWeightChart();
    }
};


// --- TIMER LOGIKA ---

function updateTimer() {
    const now = new Date();
    const day = now.getDay();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const startEatingMins = timeToMins(appConfig.eatingStart);
    const endEatingMins = timeToMins(appConfig.eatingEnd);

    let isFasting = true;
    let elapsedMins = 0;
    let totalDuration = 0;
    let statusText = "";

    const longFastDay = appConfig.longFastDay;
    const recoveryDay = (longFastDay + 1) % 7;
    const longDurationMins = appConfig.longFastDuration * 60;

    const sosCard = document.getElementById('sosCard');

    // 1. DLOUHÝ PŮST
    if (day === longFastDay) {
        const minsYesterday = 1440 - endEatingMins;
        elapsedMins = minsYesterday + currentMins;

        isFasting = true;
        statusText = "DLOUHÝ PŮST";
        totalDuration = longDurationMins;

        if (elapsedMins > 1200) sosCard.classList.remove('hidden');
        else sosCard.classList.add('hidden');
    }
    // 2. DEN PO DLOUHÉM PŮSTU
    else if (day === recoveryDay) {
        const hoursFromThursdayNight = 24 - (endEatingMins / 60);
        const hoursTotalSoFar = hoursFromThursdayNight + 24;
        const hoursRemaining = appConfig.longFastDuration - hoursTotalSoFar;
        const fastEndsTodayAtMins = hoursRemaining * 60;

        if (currentMins < fastEndsTodayAtMins) {
            // JSME V DOBĚHU
            const minsDayBeforeYesterday = 1440 - endEatingMins;
            const minsYesterday = 1440;
            elapsedMins = minsDayBeforeYesterday + minsYesterday + currentMins;

            isFasting = true;
            statusText = "DOBĚH PŮSTU";
            totalDuration = longDurationMins;
            sosCard.classList.remove('hidden');
        } else {
            // PŮST SKONČIL
            sosCard.classList.add('hidden');
            if (currentMins < endEatingMins) {
                isFasting = false; // JÍDLO
                statusText = "RESTART / JÍDLO";
                elapsedMins = endEatingMins - currentMins;
                totalDuration = endEatingMins - fastEndsTodayAtMins;
            } else {
                isFasting = true; // Večer
                statusText = "SPALOVÁNÍ";
                elapsedMins = currentMins - endEatingMins;
                totalDuration = (1440 - endEatingMins) + startEatingMins;
            }
        }
    }
    // 3. BĚŽNÝ DEN
    else {
        sosCard.classList.add('hidden');
        if (currentMins >= startEatingMins && currentMins < endEatingMins) {
            isFasting = false;
            statusText = "JÍDLO";
            elapsedMins = endEatingMins - currentMins;
            totalDuration = endEatingMins - startEatingMins;
        } else {
            isFasting = true;
            statusText = "SPALOVÁNÍ";
            if (currentMins < startEatingMins) {
                const minsYesterday = 1440 - endEatingMins;
                elapsedMins = minsYesterday + currentMins;
            } else {
                elapsedMins = currentMins - endEatingMins;
            }
            totalDuration = (1440 - endEatingMins) + startEatingMins;
        }
    }

    // NOTIFIKACE Check (Simple implementation)
    checkNotifications(isFasting, statusText);

    // Render UI
    renderTimerUI(isFasting, elapsedMins, totalDuration, statusText);
}

function renderTimerUI(isFasting, elapsedMins, totalDuration, statusText) {
    const dashboardCard = document.getElementById('dashboardCard');
    const timerValue = document.getElementById('timerValue');
    const timerLabel = document.getElementById('timerLabel');
    const statusBadge = document.getElementById('statusBadge');
    const phaseContainer = document.getElementById('fastingPhaseContainer');
    const subTimerText = document.getElementById('subTimerText');

    statusBadge.innerText = statusText;

    if (isFasting) {
        dashboardCard.className = "card text-center status-fasting";
        timerLabel.innerText = "UPLYNULO";
        timerValue.innerText = formatTime(elapsedMins);

        phaseContainer.classList.remove('hidden');
        document.getElementById('fastingPhaseText').innerText = getFastingPhase(elapsedMins);

        const remaining = totalDuration - elapsedMins;
        if (remaining > 0) {
            subTimerText.innerText = `Cíl za: ${formatTime(remaining)}`;
        } else {
            subTimerText.innerText = "Cíl splněn! Pálíš tuky.";
        }
        setCircleProgress(elapsedMins, totalDuration, true);
    } else {
        dashboardCard.className = "card text-center status-eating";
        timerLabel.innerText = "ZBÝVÁ";
        timerValue.innerText = formatTime(elapsedMins);

        phaseContainer.classList.add('hidden');
        subTimerText.innerText = "Doplň kvalitní energii.";

        const passed = totalDuration - elapsedMins;
        setCircleProgress(passed, totalDuration, false);
    }
}

// Pomocná funkce: Určení fáze půstu
function getFastingPhase(mins) {
    const hours = mins / 60;
    if (hours < 4) return "Zpracování jídla (Insulin ↑)";
    if (hours < 8) return "Pokles cukru (Insulin ↓)";
    if (hours < 12) return "Vyčerpání glykogenu";
    if (hours < 18) return "Start Ketózy (Pálení tuku)";
    if (hours < 24) return "Hluboká Ketóza";
    if (hours < 36) return "Autofagie (Reparace buněk)";
    if (hours < 48) return "Růstový hormon (Peak)";
    return "Hluboká regenerace";
}

function formatTime(mins) {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return `${h}:${m < 10 ? '0' + m : m}`;
}

function timeToMins(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; }

function setCircleProgress(value, total, isFilling) {
    const circle = document.getElementById('timerCircle');
    let percent = (value / total) * 100;
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    let offset;
    if (isFilling) {
        offset = 283 - ((percent / 100) * 283);
    } else {
        offset = (percent / 100) * 283;
    }
    circle.style.strokeDashoffset = offset;
}


// --- MODUL RECEPTY ---

let isEditingMeals = false;

function initRecipes() {
    const container = document.getElementById('recipesContainer');
    if (!container) return;

    container.innerHTML = '';

    mealPlanData.forEach(day => {
        const allDone = day.meals.every(m => localStorage.getItem('recipe_' + m.id) === 'true');

        const dayHtml = `
            <div class="day-card ${isEditingMeals ? 'editing' : ''}" id="dayCard_${day.day}">
                <div class="day-header ${allDone ? 'completed' : ''}" onclick="toggleDay(${day.day})">
                    <span>${day.title || 'Den ' + day.day}</span>
                    <span class="material-symbols-outlined">${allDone ? 'check_circle' : 'expand_more'}</span>
                </div>
                <div class="day-content">
                    ${day.meals.map(meal => {
            const isChecked = localStorage.getItem('recipe_' + meal.id) === 'true';
            return `
                        <div class="recipe-item ${isChecked ? 'checked' : ''}" onclick="handleMealClick('${meal.id}', ${day.day})">
                            <div class="recipe-title">
                                ${isEditingMeals
                    ? '<span class="material-symbols-outlined" style="margin-right:10px; color:var(--color-primary)">edit</span>'
                    : '<div class="recipe-checkbox"></div>'}
                                <span>${meal.name}</span>
                            </div>
                            <div class="recipe-meta">${meal.type} • ${meal.portion}</div>
                            <div class="recipe-desc">${meal.desc}</div>
                        </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
        container.innerHTML += dayHtml;
    });
}

window.toggleDay = function (dayIndex) {
    const card = document.getElementById(`dayCard_${dayIndex}`);
    const wasOpen = card.classList.contains('open');
    document.querySelectorAll('.day-card').forEach(c => c.classList.remove('open'));
    if (!wasOpen) card.classList.add('open');
};

window.handleMealClick = function (mealId, dayIndex) {
    if (isEditingMeals) {
        // Edit mode
        openMealModal(mealId, dayIndex);
    } else {
        // Toggle Check
        toggleMeal(mealId, dayIndex);
    }
}

window.toggleMeal = function (mealId, dayIndex) {
    const key = 'recipe_' + mealId;
    localStorage.setItem(key, localStorage.getItem(key) === 'true' ? 'false' : 'true');
    initRecipes();
    document.getElementById(`dayCard_${dayIndex}`).classList.add('open');
};

// --- EDITACE JÍDEL ---

window.openMealEditor = function () {
    isEditingMeals = !isEditingMeals;
    initRecipes();
    // Otevřít první den pro přehlednost
    if (isEditingMeals) document.getElementById('dayCard_1').classList.add('open');
};

function openMealModal(mealId, dayIndex) {
    const day = mealPlanData.find(d => d.day === dayIndex);
    const meal = day.meals.find(m => m.id === mealId);

    document.getElementById('editMealId').value = meal.id;
    document.getElementById('editMealDay').value = day.day;
    document.getElementById('editMealName').value = meal.name;
    document.getElementById('editMealPortion').value = meal.portion;
    document.getElementById('editMealDesc').value = meal.desc;

    document.getElementById('mealEditModal').classList.remove('hidden');
}

window.closeMealEditor = function () {
    document.getElementById('mealEditModal').classList.add('hidden');
}

function saveMealEdit(e) {
    e.preventDefault();
    const id = document.getElementById('editMealId').value;
    const dayIndex = parseInt(document.getElementById('editMealDay').value);

    // Find and update
    const day = mealPlanData.find(d => d.day === dayIndex);
    const meal = day.meals.find(m => m.id === id);

    meal.name = document.getElementById('editMealName').value;
    meal.portion = document.getElementById('editMealPortion').value;
    meal.desc = document.getElementById('editMealDesc').value;

    // Save to Persistent Storage
    localStorage.setItem('ft_mealPlan', JSON.stringify(mealPlanData));
    syncToCloud(); // Attempt sync

    closeMealEditor();
    initRecipes();
    document.getElementById(`dayCard_${dayIndex}`).classList.add('open');
}

window.resetMealPlan = function () {
    if (confirm("Vymazat postup? (Jídelníček zůstane zachován, jen se odškrtnou položky)")) {
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('recipe_')) localStorage.removeItem(key);
        });
        initRecipes();
    }
};


// --- MODUL VÁHA ---

function initWeightTracker() {
    document.getElementById('dateInput').valueAsDate = new Date();
    document.getElementById('weightForm').addEventListener('submit', (e) => {
        e.preventDefault();
        addWeightEntry();
    });
    loadWeightData();
}

function getWeightHistory() {
    return JSON.parse(localStorage.getItem('ft_weight')) || [];
}

function addWeightEntry() {
    const wVal = parseFloat(document.getElementById('weightInput').value);
    const dVal = document.getElementById('dateInput').value;

    if (!wVal || !dVal) return;

    let history = getWeightHistory();
    const index = history.findIndex(x => x.date === dVal);
    if (index >= 0) history[index].weight = wVal;
    else history.push({ date: dVal, weight: wVal });

    history.sort((a, b) => new Date(a.date) - new Date(b.date));
    localStorage.setItem('ft_weight', JSON.stringify(history));
    syncToCloud();

    document.getElementById('weightInput').value = '';
    loadWeightData();
    alert('Váha uložena');
}

function loadWeightData() {
    const history = getWeightHistory();
    const current = history.length > 0 ? history[history.length - 1].weight : appConfig.startWeight;

    document.getElementById('headerWeight').innerText = `${current} kg`;

    const diff = (current - appConfig.startWeight).toFixed(1);
    const rem = (current - appConfig.targetWeight).toFixed(1);

    document.getElementById('statTarget').innerText = appConfig.targetWeight;

    const statTotalEl = document.getElementById('statTotal');
    statTotalEl.innerText = `${diff > 0 ? '+' : ''}${diff}`;
    statTotalEl.className = diff <= 0 ? 'text-success' : 'text-danger';

    document.getElementById('statRemaining').innerText = rem > 0 ? rem : "✓";

    if (!document.getElementById('view-weight').classList.contains('hidden')) {
        renderWeightChart();
    }
}

function renderWeightChart() {
    const ctx = document.getElementById('weightChart').getContext('2d');
    const history = getWeightHistory();

    if (weightChartInstance) weightChartInstance.destroy();
    if (history.length === 0) return;

    const viewData = history.slice(-14);

    weightChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: viewData.map(i => {
                const d = new Date(i.date);
                return `${d.getDate()}.${d.getMonth() + 1}.`;
            }),
            datasets: [{
                label: 'Váha',
                data: viewData.map(i => i.weight),
                borderColor: '#69f0ae',
                backgroundColor: 'rgba(105, 240, 174, 0.1)',
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: '#121212',
                pointBorderColor: '#69f0ae',
                fill: true,
                tension: 0.3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { grid: { color: '#333' }, ticks: { color: '#888' } },
                x: { grid: { display: false }, ticks: { color: '#888' } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

window.clearWeightData = function () {
    if (confirm('Opravdu smazat historii vážení?')) {
        localStorage.removeItem('ft_weight');
        loadWeightData();
        renderWeightChart();
        syncToCloud();
    }
};


// --- MODUL NÁKUP ---

function initShoppingList() {
    const proteins = ["Kuřecí prsa", "Mleté hovězí", "Ryba", "Vejce", "Šunka", "Tvaroh/Jogurt"];
    const others = ["Brambory", "Rýže", "Zelenina", "Ovoce", "Káva", "Sůl/Koření"];

    const render = (id, arr) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        arr.forEach(item => {
            const uid = 'shop_' + item.replace(/[^a-z0-9]/gi, '');
            const isChecked = localStorage.getItem(uid) === 'true';

            el.innerHTML += `
                <div class="shop-item ${isChecked ? 'checked' : ''}" onclick="toggleShop(this, '${uid}')">
                    <div class="checkbox-circle"></div>
                    <span>${item}</span>
                </div>
            `;
        });
    };
    render('shopList-protein', proteins);
    render('shopList-vege', others);
}

window.toggleShop = function (div, id) {
    div.classList.toggle('checked');
    localStorage.setItem(id, div.classList.contains('checked'));
};


// --- MODUL NASTAVENÍ ---

function initSettingsForm() {
    document.getElementById('cfgStartWeight').value = appConfig.startWeight;
    document.getElementById('cfgTargetWeight').value = appConfig.targetWeight;
    document.getElementById('cfgEatingStart').value = appConfig.eatingStart;
    document.getElementById('cfgEatingEnd').value = appConfig.eatingEnd;
    document.getElementById('cfgLongFastDay').value = appConfig.longFastDay;
    document.getElementById('cfgLongFastDuration').value = appConfig.longFastDuration;

    // Set Fasting Mode Dropdown
    const modeEl = document.getElementById('cfgFastingMode');
    if (appConfig.fastingMode) {
        modeEl.value = appConfig.fastingMode;
    } else {
        modeEl.value = 'custom'; // Default fallback
    }
}

window.updateFastingModeInputs = function () {
    const mode = document.getElementById('cfgFastingMode').value;
    const startEl = document.getElementById('cfgEatingStart');
    const endEl = document.getElementById('cfgEatingEnd');

    if (mode === '16:8') {
        startEl.value = "12:00";
        endEl.value = "20:00";
    } else if (mode === '18:6') {
        startEl.value = "12:00";
        endEl.value = "18:00";
    } else if (mode === '20:4') {
        startEl.value = "14:00";
        endEl.value = "18:00";
    }
    // custom - neděláme nic
};

window.saveSettings = function () {
    appConfig.startWeight = parseFloat(document.getElementById('cfgStartWeight').value) || 0;
    appConfig.targetWeight = parseFloat(document.getElementById('cfgTargetWeight').value) || 0;
    appConfig.eatingStart = document.getElementById('cfgEatingStart').value;
    appConfig.eatingEnd = document.getElementById('cfgEatingEnd').value;
    appConfig.longFastDay = parseInt(document.getElementById('cfgLongFastDay').value);
    appConfig.longFastDuration = parseInt(document.getElementById('cfgLongFastDuration').value);
    appConfig.fastingMode = document.getElementById('cfgFastingMode').value;

    localStorage.setItem('ft_config', JSON.stringify(appConfig));

    loadWeightData();
    updateTimer();
    syncToCloud();

    alert('Uloženo!');
    window.switchTab('dashboard', document.querySelector('.tabs-container .tab:first-child'));
};

window.factoryReset = function () {
    if (confirm('Opravdu resetovat celou aplikaci?')) {
        localStorage.clear();
        location.reload();
    }
};


// --- NOTIFIKACE ---

let notificationPermission = Notification.permission;
let lastNotifState = null; // 'fasting' or 'eating'

function initNotifications() {
    const btn = document.getElementById('btnNotifications');
    if (notificationPermission === 'granted') {
        btn.innerText = 'Aktivní';
        btn.disabled = true;
        btn.classList.add('btn-text');
    }
}

window.toggleNotifications = function () {
    if (!("Notification" in window)) {
        alert("Tento prohlížeč nepodporuje notifikace.");
        return;
    }

    Notification.requestPermission().then(permission => {
        notificationPermission = permission;
        initNotifications();
        if (permission === 'granted') {
            new Notification("MyFastTrack Notifikace", { body: "Upozornění byla aktivována." });
        }
    });
};

function checkNotifications(isFasting, statusText) {
    if (notificationPermission !== 'granted') return;

    // Simple state change detection
    // Note: This runs every second, so we need to be careful not to spam.
    // In a real app, we'd calculate exact time to next event and setTimeOut or use Service Worker Push.

    // Pro jednoduchost zde jen logujeme změnu stavu pokud bychom měli state machine.
    // Ale protože updateTimer běží každou vteřinu a nemáme persistentní state "lastStatus",
    // uděláme to jednoduše - pokud je čas přesně EatingStart nebo EatingEnd (+- 1s).

    const now = new Date();
    const timeStr = `${now.getHours()}:${now.getMinutes() < 10 ? '0' + now.getMinutes() : now.getMinutes()}`;
    const secs = now.getSeconds();

    if (secs === 0) {
        // Check only at full minute
        if (timeStr === appConfig.eatingStart) {
            new Notification("Čas jídla!", { body: "Začíná tvé stravovací okno. Dobrou chuť!" });
        }
        if (timeStr === appConfig.eatingEnd) {
            new Notification("Konec jídla", { body: "Začíná půst. Uvidíme se zítra!" });
        }
    }
}


// --- CLOUDFLARE KV SYNC ---

async function syncToCloud() {
    // Pokud nejsme na localhostu nebo pokud chceme testovat, odkomentujte
    const data = {
        config: appConfig,
        weight: JSON.parse(localStorage.getItem('ft_weight') || '[]'),
        mealPlan: mealPlanData
    };

    try {
        // Posíláme na API endpoint
        const res = await fetch('/api/sync', {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) console.log('Synced to Cloud');
    } catch (e) {
        // Tiché selhání - pravděpodobně offline nebo běžíme lokálně bez serveru
        console.log('Sync skipped (Offline/Local)');
    }
}

async function syncFromCloud() {
    if (!navigator.onLine) return;

    try {
        const res = await fetch('/api/sync');
        if (res.ok) {
            const data = await res.json();
            if (data) {
                if (data.config) {
                    appConfig = data.config;
                    localStorage.setItem('ft_config', JSON.stringify(appConfig));
                }
                if (data.weight) {
                    localStorage.setItem('ft_weight', JSON.stringify(data.weight));
                }
                if (data.mealPlan) {
                    mealPlanData = data.mealPlan;
                    localStorage.setItem('ft_mealPlan', JSON.stringify(mealPlanData));
                }
                // Refresh UI
                initSettingsForm();
                loadWeightData();
                initRecipes();
                updateTimer();
                console.log('Data loaded from Cloud');
            }
        }
    } catch (e) {
        console.log('Cloud load skipped');
    }
}