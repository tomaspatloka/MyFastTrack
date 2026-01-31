/**
 * MyFastTrack V3 - Kompletní aplikační logika
 */

const APP_VERSION = '1.3.0';

// Načtení motivu ihned (před DOMContentLoaded pro zamezení probliknutí)
(function() {
    const savedTheme = localStorage.getItem('ft_theme') || 'dark';
    document.body.classList.remove('dark-mode', 'light-mode');
    document.body.classList.add(savedTheme + '-mode');
})();

// Přepínání motivu
window.toggleTheme = function() {
    const body = document.body;
    const isDark = body.classList.contains('dark-mode');

    body.classList.remove('dark-mode', 'light-mode');

    if (isDark) {
        body.classList.add('light-mode');
        localStorage.setItem('ft_theme', 'light');
    } else {
        body.classList.add('dark-mode');
        localStorage.setItem('ft_theme', 'dark');
    }
};

// Bezpečnostní helper - escapování HTML (prevence XSS)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Registrace Service Workeru
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW Error:', err));
}

// Vynucená aktualizace aplikace (vymazání cache + reload)
window.forceAppUpdate = async function() {
    if (!confirm('Opravdu chcete aktualizovat aplikaci? Stáhne se nová verze.')) return;

    try {
        // 1. Odregistrovat service worker
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
                await registration.unregister();
            }
        }

        // 2. Vymazat všechny cache
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            for (const cacheName of cacheNames) {
                await caches.delete(cacheName);
            }
        }

        // 3. Hard reload
        alert('Cache vymazána. Aplikace se nyní znovu načte.');
        window.location.reload(true);

    } catch (err) {
        console.error('Update error:', err);
        alert('Chyba při aktualizaci: ' + err.message + '\n\nZkuste zavřít a znovu otevřít aplikaci.');
    }
};

// Výchozí nastavení
const defaultConfig = {
    startWeight: 100,
    targetWeight: 80,
    eatingStart: "12:00",
    eatingEnd: "18:00",
    longFastDay: 5,       // 5 = Pátek
    longFastDuration: 37,
    userName: "",
    userMotto: "Disciplína je svoboda.",
    waterGlassSize: 250,  // ml na sklenici
    waterGoal: 8          // počet sklenic denně
};

let appConfig = JSON.parse(localStorage.getItem('ft_config')) || defaultConfig;
let weightChartInstance = null;
let deferredPrompt; // PWA Install Prompt
let waterIntake = 0;
let lastWaterDate = null;
let timerDisplayMode = 'elapsed'; // 'elapsed' = uplynulo, 'remaining' = zbývá

// Streak tracking
let currentStreak = parseInt(localStorage.getItem('ft_streak') || '0');
let bestStreak = parseInt(localStorage.getItem('ft_streakBest') || '0');
let lastStreakDate = localStorage.getItem('ft_streakDate') || '';

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
    initWaterTracker(); // Voda
    initStreak(); // Streak tracking

    // PWA Install
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const card = document.getElementById('pwaInstallCard');
        if (card) card.classList.remove('hidden');
    });

    document.getElementById('pwaInstallBtn').addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            deferredPrompt = null;
            document.getElementById('pwaInstallCard').classList.add('hidden');
        }
    });

    // PWA Installed Check
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        document.getElementById('pwaInstallCard').classList.add('hidden');
        alert('Děkujeme za instalaci!');
    });

    // Sync Status Listeners
    window.addEventListener('online', () => updateSyncStatus('online'));
    window.addEventListener('offline', () => updateSyncStatus('offline'));
    updateSyncStatus(navigator.onLine ? 'online' : 'offline');

    updateTimer();
    setInterval(updateTimer, 1000);

    // Sync from Cloud if available (silent)
    syncFromCloud();

    window.switchTab('dashboard', document.querySelector('.tab.active'));

    // Zobrazit verzi aplikace
    const versionEl = document.getElementById('appVersion');
    if (versionEl) versionEl.innerText = `Verze: ${APP_VERSION}`;
    const headerVersionEl = document.getElementById('headerVersion');
    if (headerVersionEl) headerVersionEl.innerText = `v${APP_VERSION}`;

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

    // Streak: počítej úspěšný den když začne jídelní okno
    if (!isFasting && statusText === "JÍDLO") {
        updateStreak();
    }

    // Render UI
    renderTimerUI(isFasting, elapsedMins, totalDuration, statusText);
}

// Přepínání zobrazení timeru (kliknutím)
window.toggleTimerDisplay = function() {
    timerDisplayMode = timerDisplayMode === 'elapsed' ? 'remaining' : 'elapsed';
    // Vizuální feedback
    const timerWrapper = document.querySelector('.timer-wrapper');
    if (timerWrapper) {
        timerWrapper.classList.add('timer-tap');
        setTimeout(() => timerWrapper.classList.remove('timer-tap'), 150);
    }
    updateTimer(); // Okamžitá aktualizace
};

function renderTimerUI(isFasting, elapsedMins, totalDuration, statusText) {
    const dashboardCard = document.getElementById('dashboardCard');
    const timerValue = document.getElementById('timerValue');
    const timerLabel = document.getElementById('timerLabel');
    const statusBadge = document.getElementById('statusBadge');
    const phaseContainer = document.getElementById('fastingPhaseContainer');
    const subTimerText = document.getElementById('subTimerText');

    statusBadge.innerText = statusText;

    const remaining = totalDuration - elapsedMins;

    if (isFasting) {
        dashboardCard.className = "card text-center status-fasting";
        phaseContainer.classList.remove('hidden');
        document.getElementById('fastingPhaseText').innerText = getFastingPhase(elapsedMins);

        // Přepínatelný režim zobrazení
        if (timerDisplayMode === 'elapsed') {
            timerLabel.innerText = "UPLYNULO";
            timerValue.innerText = formatTime(elapsedMins);
            if (remaining > 0) {
                subTimerText.innerText = `Zbývá: ${formatTime(remaining)}`;
            } else {
                subTimerText.innerText = appConfig.userMotto || "Disciplína je svoboda.";
            }
        } else {
            timerLabel.innerText = "ZBÝVÁ";
            if (remaining > 0) {
                timerValue.innerText = formatTime(remaining);
                subTimerText.innerText = `Uplynulo: ${formatTime(elapsedMins)}`;
            } else {
                timerValue.innerText = "0:00";
                subTimerText.innerText = appConfig.userMotto || "Cíl splněn!";
            }
        }
        setCircleProgress(elapsedMins, totalDuration, true);
    } else {
        dashboardCard.className = "card text-center status-eating";
        timerLabel.innerText = "ZBÝVÁ";
        timerValue.innerText = formatTime(elapsedMins);

        phaseContainer.classList.add('hidden');
        subTimerText.innerText = appConfig.userMotto || "Doplň kvalitní energii.";

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
        const safeTitle = escapeHtml(day.title) || 'Den ' + day.day;

        const dayHtml = `
            <div class="day-card ${isEditingMeals ? 'editing' : ''}" id="dayCard_${day.day}">
                <div class="day-header ${allDone ? 'completed' : ''}" onclick="toggleDay(${day.day})">
                    <span>${safeTitle}</span>
                    <span class="material-symbols-outlined">${allDone ? 'check_circle' : 'expand_more'}</span>
                </div>
                <div class="day-content">
                    ${day.meals.map(meal => {
            const isChecked = localStorage.getItem('recipe_' + meal.id) === 'true';
            const safeName = escapeHtml(meal.name);
            const safeType = escapeHtml(meal.type);
            const safePortion = escapeHtml(meal.portion);
            const safeDesc = escapeHtml(meal.desc);
            return `
                        <div class="recipe-item ${isChecked ? 'checked' : ''}" onclick="handleMealClick('${escapeHtml(meal.id)}', ${day.day})">
                            <div class="recipe-title">
                                ${isEditingMeals
                    ? '<span class="material-symbols-outlined" style="margin-right:10px; color:var(--color-primary)">edit</span>'
                    : '<div class="recipe-checkbox"></div>'}
                                <span>${safeName}</span>
                            </div>
                            <div class="recipe-meta">${safeType} • ${safePortion}</div>
                            <div class="recipe-desc">${safeDesc}</div>
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

    if (!wVal || !dVal) {
        alert('Vyplňte váhu a datum.');
        return;
    }

    // Validace váhy (rozumný rozsah 30-300 kg)
    if (wVal < 30 || wVal > 300) {
        alert('Váha musí být mezi 30 a 300 kg.');
        return;
    }

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
            },
            {
                label: 'Trend (7 dní)',
                data: calculateTrendLine(viewData, 7),
                borderColor: 'rgba(255, 255, 255, 0.3)',
                borderWidth: 1,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                tension: 0.4
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

function calculateTrendLine(data, period) {
    // Simple Moving Average
    let result = [];
    for (let i = 0; i < data.length; i++) {
        const start = Math.max(0, i - period + 1);
        const subset = data.slice(start, i + 1);
        const sum = subset.reduce((a, b) => a + b.weight, 0);
        result.push(sum / subset.length);
    }
    return result;
}


window.clearWeightData = function () {
    if (confirm('Opravdu smazat historii vážení?')) {
        localStorage.removeItem('ft_weight');
        loadWeightData();
        renderWeightChart();
        syncToCloud();
    }
};

window.exportShoppingList = function () {
    const proteins = [];
    const others = [];

    // Projdeme checkboxy v DOMu nebo LS. Lepší DOM, protože LS má ID.
    document.querySelectorAll('#shopList-protein .shop-item:not(.checked) span').forEach(el => proteins.push(el.innerText));
    document.querySelectorAll('#shopList-vege .shop-item:not(.checked) span').forEach(el => others.push(el.innerText));

    if (proteins.length === 0 && others.length === 0) {
        alert('Nákupní seznam je prázdný (nebo vše koupeno).');
        return;
    }

    let text = "🛒 MyFastTrack Nákup:\n\n";
    if (proteins.length > 0) text += "-- Bílkoviny --\n" + proteins.join('\n') + "\n\n";
    if (others.length > 0) text += "-- Ostatní --\n" + others.join('\n');

    if (navigator.share) {
        navigator.share({
            title: 'Můj nákup',
            text: text
        }).catch(err => {
            console.log('Share failed', err);
            copyToClipboard(text);
        });
    } else {
        copyToClipboard(text);
    }
};

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Seznam zkopírován do schránky!');
    }).catch(err => {
        alert('Nelze zkopírovat: ' + err);
    });
}





window.exportData = function () {
    const data = {
        config: appConfig,
        weight: JSON.parse(localStorage.getItem('ft_weight') || '[]'),
        mealPlan: mealPlanData,
        water: { val: waterIntake, date: new Date().toDateString() },
        exportedAt: new Date().toISOString()
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `myfasttrack_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
};

window.importData = function (input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            if (confirm(`Nalezeny data z ${data.exportedAt || 'neznámého data'}. Chcete je obnovit? Přepíše to současný stav.`)) {
                if (data.config) localStorage.setItem('ft_config', JSON.stringify(data.config));
                if (data.weight) localStorage.setItem('ft_weight', JSON.stringify(data.weight));
                if (data.mealPlan) localStorage.setItem('ft_mealPlan', JSON.stringify(data.mealPlan));
                if (data.water) {
                    localStorage.setItem('ft_waterVal', data.water.val);
                    localStorage.setItem('ft_waterDate', data.water.date);
                }

                alert('Data obnovena! Aplikace se reloadne.');
                location.reload();
            }
        } catch (err) {
            alert('Chyba při čtení souboru: ' + err);
        }
    };
    reader.readAsText(file);
    input.value = ''; // Reset input
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
            const safeItem = escapeHtml(item);

            el.innerHTML += `
                <div class="shop-item ${isChecked ? 'checked' : ''}" onclick="toggleShop(this, '${uid}')">
                    <div class="checkbox-circle"></div>
                    <span>${safeItem}</span>
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

    document.getElementById('cfgUserName').value = appConfig.userName || "";
    document.getElementById('cfgUserMotto').value = appConfig.userMotto || "";

    // Nastavení vody
    document.getElementById('cfgWaterGlass').value = appConfig.waterGlassSize || 250;
    document.getElementById('cfgWaterGoal').value = appConfig.waterGoal || 8;
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
    // Validace vstupů
    const startWeight = parseFloat(document.getElementById('cfgStartWeight').value);
    const targetWeight = parseFloat(document.getElementById('cfgTargetWeight').value);
    const eatingStart = document.getElementById('cfgEatingStart').value;
    const eatingEnd = document.getElementById('cfgEatingEnd').value;
    const longFastDuration = parseInt(document.getElementById('cfgLongFastDuration').value);

    // Kontrola váhy (rozumný rozsah 30-300 kg)
    if (startWeight < 30 || startWeight > 300) {
        alert('Startovní váha musí být mezi 30 a 300 kg.');
        return;
    }
    if (targetWeight < 30 || targetWeight > 300) {
        alert('Cílová váha musí být mezi 30 a 300 kg.');
        return;
    }

    // Kontrola časů
    if (!eatingStart || !eatingEnd) {
        alert('Vyplňte časy jídla.');
        return;
    }

    // Kontrola délky dlouhého půstu (12-72 hodin)
    if (longFastDuration < 12 || longFastDuration > 72) {
        alert('Délka dlouhého půstu musí být mezi 12 a 72 hodinami.');
        return;
    }

    appConfig.startWeight = startWeight;
    appConfig.targetWeight = targetWeight;
    appConfig.eatingStart = eatingStart;
    appConfig.eatingEnd = eatingEnd;
    appConfig.longFastDay = parseInt(document.getElementById('cfgLongFastDay').value);
    appConfig.longFastDuration = longFastDuration;
    appConfig.fastingMode = document.getElementById('cfgFastingMode').value;
    appConfig.userName = document.getElementById('cfgUserName').value;
    appConfig.userMotto = document.getElementById('cfgUserMotto').value;
    appConfig.waterGlassSize = parseInt(document.getElementById('cfgWaterGlass').value) || 250;
    appConfig.waterGoal = parseInt(document.getElementById('cfgWaterGoal').value) || 8;

    localStorage.setItem('ft_config', JSON.stringify(appConfig));

    loadWeightData();
    updateTimer();
    renderWater();
    syncToCloud();

    alert('Uloženo!');
    window.switchTab('dashboard', document.querySelector('.tabs-container .tab:first-child'));
};

window.factoryReset = function () {
    if (confirm('Opravdu resetovat celou aplikaci?')) {
        localStorage.clear();
        location.reload();
    }
}


// --- MODUL VODA ---
function initWaterTracker() {
    const savedDate = localStorage.getItem('ft_waterDate');
    const today = new Date().toDateString();

    if (savedDate !== today) {
        waterIntake = 0;
        localStorage.setItem('ft_waterDate', today);
        localStorage.setItem('ft_waterVal', '0');
    } else {
        waterIntake = parseInt(localStorage.getItem('ft_waterVal')) || 0;
    }
    renderWater();
}

window.updateWater = function (change) {
    waterIntake += change;
    if (waterIntake < 0) waterIntake = 0;

    localStorage.setItem('ft_waterVal', waterIntake.toString());
    localStorage.setItem('ft_waterDate', new Date().toDateString());

    renderWater();
    syncToCloud(); // Sync after update
};

function renderWater() {
    const amountEl = document.getElementById('waterAmount');
    const countEl = document.getElementById('waterCount');

    if (!amountEl || !countEl) return;

    const glassSize = appConfig.waterGlassSize || 250;
    const goal = appConfig.waterGoal || 8;
    const liters = (waterIntake * glassSize / 1000).toFixed(2);
    const progress = Math.min(100, Math.round((waterIntake / goal) * 100));

    amountEl.innerText = `${liters} l (${progress}%)`;
    countEl.innerText = waterIntake;
}


// --- STREAK TRACKING ---

function initStreak() {
    const today = new Date().toDateString();

    // Kontrola přerušení streak (pokud je mezera > 1 den)
    if (lastStreakDate && lastStreakDate !== today) {
        const lastDate = new Date(lastStreakDate);
        const todayDate = new Date(today);
        const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));

        if (diffDays > 1) {
            // Přerušení streak
            currentStreak = 0;
            localStorage.setItem('ft_streak', '0');
        }
    }

    renderStreak();
}

function updateStreak() {
    const today = new Date().toDateString();

    // Pokud už dnes byl streak započítán, neincrementovat
    if (lastStreakDate === today) {
        return;
    }

    currentStreak++;
    lastStreakDate = today;

    // Aktualizovat nejlepší streak
    if (currentStreak > bestStreak) {
        bestStreak = currentStreak;
        localStorage.setItem('ft_streakBest', bestStreak.toString());
    }

    localStorage.setItem('ft_streak', currentStreak.toString());
    localStorage.setItem('ft_streakDate', today);

    renderStreak();
}

function renderStreak() {
    const countEl = document.getElementById('streakCount');
    const bestEl = document.getElementById('streakBest');

    if (countEl) countEl.innerText = currentStreak;
    if (bestEl) bestEl.innerText = bestStreak;
}



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


// --- SYNC STATUS UI ---
function updateSyncStatus(status) {
    const icon = document.getElementById('syncStatusIcon');
    if (!icon) return;

    icon.classList.remove('synced', 'syncing', 'offline');

    if (status === 'online' || status === 'synced') {
        icon.innerText = 'cloud_done';
        icon.classList.add('synced');
        icon.title = "Online & Synced";
    } else if (status === 'syncing') {
        icon.innerText = 'sync';
        icon.classList.add('syncing');
        icon.title = "Syncing...";
    } else {
        icon.innerText = 'cloud_off';
        icon.classList.add('offline');
        icon.title = "Offline (Local mode)";
    }
}

async function syncToCloud() {
    updateSyncStatus('syncing');
    const data = {
        config: appConfig,
        weight: JSON.parse(localStorage.getItem('ft_weight') || '[]'),
        mealPlan: mealPlanData,
        water: { val: waterIntake, date: new Date().toDateString() } // Sync water too
    };

    try {
        const res = await fetch('/api/sync', {
            method: 'POST',
            body: JSON.stringify(data),
            headers: { 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            console.log('Synced to Cloud');
            updateSyncStatus('synced');
        } else {
            throw new Error('Sync Error');
        }
    } catch (e) {
        console.log('Sync skipped (Offline/Local)');
        updateSyncStatus('offline');
    }
}

async function syncFromCloud() {
    if (!navigator.onLine) {
        updateSyncStatus('offline');
        return;
    }
    updateSyncStatus('syncing');

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
                // Water sync logic
                if (data.water && data.water.date === new Date().toDateString()) {
                    waterIntake = data.water.val;
                    localStorage.setItem('ft_waterVal', waterIntake.toString());
                    localStorage.setItem('ft_waterDate', data.water.date);
                    renderWater();
                }

                initSettingsForm();
                loadWeightData();
                initRecipes();
                updateTimer();
                console.log('Data loaded from Cloud');
                updateSyncStatus('synced');
            }
        }
    } catch (e) {
        console.log('Cloud load skipped');
        updateSyncStatus('offline');
    }
}