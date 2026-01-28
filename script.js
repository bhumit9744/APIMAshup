// --- 1. CONFIG & GLOBALS ---
const API_BASE = "https://api.fda.gov/drug/event.json";

// FDA Term Mapping (Crucial for getting results)
const FDA_TERM_MAP = {
    "Hypertension": "HYPERTENSION",
    "Type 2 Diabetes": "DIABETES MELLITUS", // FDA term
    "Coronary Heart Disease": "CORONARY ARTERY DISEASE", // FDA term
    "Liver Cirrhosis": "CIRRHOSIS",
    "COPD": "CHRONIC OBSTRUCTIVE PULMONARY DISEASE",
    "Osteoarthritis": "OSTEOARTHRITIS",
    "Stroke": "CEREBROVASCULAR ACCIDENT", // FDA term for Stroke
    "Kidney Disease": "RENAL FAILURE", // Broader match
    "Anemia": "ANEMIA",
    "Sleep Apnea": "SLEEP APNEA SYNDROME",
    "Lung Cancer": "LUNG NEOPLASM",
    "Gout": "GOUT"
};

// Global State
let primaryChart = null;
let trendChart = null;
let bmiChart = null;
let reportChartInstances = {}; 

// --- 2. SURVEY & RISK ENGINE ---

function toggleSurvey(show) {
    const modal = document.getElementById('survey-modal');
    const content = document.getElementById('survey-content');
    if (show) {
        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        });
    } else {
        modal.classList.add('opacity-0');
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function generateHealthReport() {
    // 1. Inputs
    const h = parseFloat(document.getElementById('s-height').value);
    const w = parseFloat(document.getElementById('s-weight').value);
    const age = parseInt(document.getElementById('s-age').value) || 30;
    const smoke = document.querySelector('input[name="smoke"]:checked').value;
    const diabetic = document.querySelector('input[name="diabetic"]:checked').value;
    const alcohol = document.getElementById('s-alcohol').value;
    const activity = document.getElementById('s-activity').value;

    if (!h || !w) { alert("Height and Weight required."); return; }

    // 2. BMI Calculation
    const bmi = (w / ((h/100) * (h/100))).toFixed(1);
    let bmiCategory = "Healthy";
    if (bmi < 18.5) bmiCategory = "Underweight";
    else if (bmi >= 25 && bmi < 30) bmiCategory = "Overweight";
    else if (bmi >= 30) bmiCategory = "Obese";

    // 3. Risk Engine
    let risks = [
        { name: "Hypertension", score: 10 }, { name: "Type 2 Diabetes", score: 10 },
        { name: "Coronary Heart Disease", score: 5 }, { name: "Liver Cirrhosis", score: 2 },
        { name: "COPD", score: 2 }, { name: "Osteoarthritis", score: 5 },
        { name: "Stroke", score: 5 }, { name: "Kidney Disease", score: 5 },
        { name: "Anemia", score: 2 }, { name: "Sleep Apnea", score: 5 },
        { name: "Lung Cancer", score: 1 }, { name: "Gout", score: 2 }
    ];

    // Modifiers
    if (bmi >= 25) { addRisk(risks, "Hypertension", 30); addRisk(risks, "Type 2 Diabetes", 40); addRisk(risks, "Coronary Heart Disease", 25); addRisk(risks, "Osteoarthritis", 35); addRisk(risks, "Sleep Apnea", 50); addRisk(risks, "Gout", 20); }
    if (smoke === 'yes') { addRisk(risks, "COPD", 80); addRisk(risks, "Lung Cancer", 70); addRisk(risks, "Coronary Heart Disease", 50); addRisk(risks, "Stroke", 40); addRisk(risks, "Hypertension", 20); }
    if (alcohol === 'heavy') { addRisk(risks, "Liver Cirrhosis", 85); addRisk(risks, "Hypertension", 30); addRisk(risks, "Stroke", 20); }
    if (diabetic === 'yes') { addRisk(risks, "Type 2 Diabetes", 100); addRisk(risks, "Kidney Disease", 60); addRisk(risks, "Coronary Heart Disease", 50); addRisk(risks, "Stroke", 40); }
    if (activity === 'sedentary') { addRisk(risks, "Coronary Heart Disease", 20); addRisk(risks, "Type 2 Diabetes", 15); addRisk(risks, "Hypertension", 10); }
    if (age > 50) { addRisk(risks, "Coronary Heart Disease", 30); addRisk(risks, "Stroke", 30); addRisk(risks, "Osteoarthritis", 40); }

    // Sort & Take Top 10
    risks.sort((a, b) => b.score - a.score);
    const topRisks = risks.slice(0, 10);

    // 4. Update UI
    updateReportUI(bmi, bmiCategory, topRisks);
    toggleSurvey(false);
}

function addRisk(riskArray, name, points) {
    const item = riskArray.find(r => r.name === name);
    if (item) item.score += points;
}

function updateReportUI(bmi, category, topRisks) {
    // Show Report Area
    document.getElementById('results-area').classList.add('hidden');
    document.getElementById('personal-report-area').classList.remove('hidden');

    // Update BMI Card
    const bmiEl = document.getElementById('bmi-value');
    bmiEl.innerText = bmi;
    document.getElementById('bmi-category').innerText = category;
    let color = '#10b981'; // green
    if (category === 'Overweight') color = '#f59e0b';
    if (category === 'Obese') color = '#ef4444';
    bmiEl.style.color = color;
    renderBMIChart(bmi, color);

    // RENDER DYNAMIC CHARTS FOR ALL CONDITIONS
    const container = document.getElementById('risk-charts-container');
    container.innerHTML = ""; // Clear previous

    // Clear old chart instances to prevent memory leaks
    Object.values(reportChartInstances).forEach(c => c.destroy());
    reportChartInstances = {};

    topRisks.forEach((risk, index) => {
        const canvasId = `risk-chart-${index}`;
        
        let barColor = "text-emerald-500";
        if (risk.score > 40) barColor = "text-orange-500";
        if (risk.score > 70) barColor = "text-red-600";

        // Map the display name to the FDA Search Term
        const fdaTerm = FDA_TERM_MAP[risk.name] || risk.name.toUpperCase();

        const html = `
            <div class="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl transition hover:border-zinc-700">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="font-bold text-zinc-200 text-xs flex items-center gap-2">
                        <span class="text-zinc-500 font-mono">#${index + 1}</span>
                        ${risk.name}
                        <span class="text-[10px] ml-2 bg-zinc-800 px-2 py-0.5 rounded text-zinc-400">Score: ${risk.score}</span>
                    </h3>
                    <i class="fa-solid fa-chart-line ${barColor}"></i>
                </div>
                <div class="h-32 w-full relative">
                    <canvas id="${canvasId}"></canvas>
                    <div id="loading-${canvasId}" class="absolute inset-0 flex items-center justify-center bg-zinc-900/80 z-10">
                        <i class="fa-solid fa-circle-notch fa-spin text-zinc-600"></i>
                    </div>
                    <div id="error-${canvasId}" class="hidden absolute inset-0 flex items-center justify-center bg-zinc-900 z-10 flex-col">
                        <i class="fa-solid fa-triangle-exclamation text-zinc-700 mb-1"></i>
                        <span class="text-[10px] text-zinc-600">No FDA Data Available</span>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);

        // Staggered fetch to prevent network congestion
        setTimeout(() => {
            fetchAndRenderRiskChart(fdaTerm, canvasId);
        }, index * 300); 
    });
}

function fetchAndRenderRiskChart(condition, canvasId) {
    const url = `${API_BASE}?search=patient.reaction.reactionmeddrapt:"${condition}"&count=receivedate`;
    
    fetch(url)
        .then(r => r.json())
        .then(data => {
            // Hide Loader
            const loader = document.getElementById(`loading-${canvasId}`);
            if(loader) loader.classList.add('hidden');

            if (!data.error) {
                renderSingleRiskChart(canvasId, data.results);
            } else {
                // Show Error State if FDA has no data
                document.getElementById(`error-${canvasId}`).classList.remove('hidden');
            }
        })
        .catch(e => {
            const loader = document.getElementById(`loading-${canvasId}`);
            if(loader) loader.classList.add('hidden');
            document.getElementById(`error-${canvasId}`).classList.remove('hidden');
        });
}

function renderSingleRiskChart(canvasId, results) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    const yearly = {};
    results.forEach(r => {
        const y = r.time.substring(0, 4);
        // CHANGED: Lowered filter to 2004 to catch more data
        if (parseInt(y) > 2004) yearly[y] = (yearly[y] || 0) + r.count;
    });
    
    const years = Object.keys(yearly).sort();
    const counts = years.map(y => yearly[y]);

    // Check if empty
    if(years.length === 0) {
        document.getElementById(`error-${canvasId}`).classList.remove('hidden');
        return;
    }

    reportChartInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: years,
            datasets: [{
                data: counts,
                borderColor: '#ef4444', 
                borderWidth: 2,
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHitRadius: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: true, ticks: { color: '#52525b', maxTicksLimit: 5, font: {size: 9} }, grid: { display: false } },
                y: { display: false }
            }
        }
    });
}

// --- 3. BMI CHART ---
function renderBMIChart(bmi, color) {
    const ctx = document.getElementById('bmiChart').getContext('2d');
    if (bmiChart) bmiChart.destroy();
    const visualValue = Math.min(bmi, 40);
    bmiChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: ["BMI", ""], datasets: [{ data: [visualValue, 40-visualValue], backgroundColor: [color, "rgba(39, 39, 42, 0.5)"], borderWidth: 0, cutout: '85%' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { animateScale: true } }
    });
}

// --- 4. STANDARD SEARCH (Search Bar) ---
// (This remains connected so the top Search Bar still works independently of the report)

function startSearch() {
    const input = document.getElementById('search-input');
    const rawQuery = input.value.trim();
    if (!rawQuery) return;
    performAnalysis(rawQuery);
}

async function performAnalysis(query) {
    const input = document.getElementById('search-input');
    input.disabled = true;
    query = query.toUpperCase(); 

    // Hide Report, Show Results
    document.getElementById('personal-report-area').classList.add('hidden');
    document.getElementById('results-area').classList.remove('hidden');

    try {
        const conditionUrl = `${API_BASE}?search=patient.drug.drugindication:"${query}"&count=patient.drug.medicinalproduct.exact&limit=5`;
        const condRes = await fetch(conditionUrl);
        const condData = await condRes.json();

        if (!condData.error) {
            renderSearchResults("CONDITION", query, condData.results);
        } else {
            const drugUrl = `${API_BASE}?search=patient.drug.medicinalproduct:"${query}"&count=patient.reaction.reactionmeddrapt.exact&limit=5`;
            const drugRes = await fetch(drugUrl);
            const drugData = await drugRes.json();
            if (!drugData.error) renderSearchResults("DRUG", query, drugData.results);
            else { alert("No records found."); document.getElementById('results-area').classList.add('hidden'); }
        }
    } catch (e) { console.error(e); } finally { input.disabled = false; input.focus(); }
}

function renderSearchResults(type, term, mainData) {
    const typeLabel = document.getElementById('result-type');
    const chartTitle = document.getElementById('chart-title-1');
    const insight = document.getElementById('insight-text');

    let colorTheme = '#34d399';
    if (type === "CONDITION") {
        colorTheme = '#c084fc';
        typeLabel.innerText = "Condition Analysis";
        chartTitle.innerHTML = `<i class="fa-solid fa-pills text-purple-400 mr-2"></i> Drugs Indicated for ${term}`;
        insight.innerHTML = `Most common treatment for <strong>${term}</strong>: <strong>${mainData[0].term}</strong>.`;
    } else {
        typeLabel.innerText = "Drug Safety";
        chartTitle.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-emerald-400 mr-2"></i> Side Effects`;
        insight.innerHTML = `Top reported reaction for <strong>${term}</strong>: <strong>${mainData[0].term}</strong>.`;
    }

    renderPrimaryChart(mainData.map(d => d.term), mainData.map(d => d.count), colorTheme);

    const trendField = type === "CONDITION" ? `patient.drug.drugindication:"${term}"` : `patient.drug.medicinalproduct:"${term}"`;
    fetch(`${API_BASE}?search=${trendField}&count=receivedate`)
        .then(r => r.json()).then(d => { if(!d.error) renderTrendChart(d.results); });
}

function renderPrimaryChart(labels, data, color) {
    const ctx = document.getElementById('primaryChart').getContext('2d');
    if (primaryChart) primaryChart.destroy();
    primaryChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: labels, datasets: [{ data: data, backgroundColor: color, borderRadius: 4, barThickness: 20 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { ticks: { color: '#d4d4d8', font: { size: 10, weight: 'bold' } }, grid: { display: false } } } }
    });
}

function renderTrendChart(results) {
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (trendChart) trendChart.destroy();
    const yearly = {};
    results.forEach(r => { const y = r.time.substring(0, 4); if (parseInt(y) > 2004) yearly[y] = (yearly[y] || 0) + r.count; });
    const years = Object.keys(yearly).sort(); const counts = years.map(y => yearly[y]);

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)'); gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    trendChart = new Chart(ctx, {
        type: 'line',
        data: { labels: years, datasets: [{ data: counts, borderColor: '#3b82f6', borderWidth: 2, backgroundColor: gradient, fill: true, pointRadius: 3, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: true, grid: { display: false }, ticks: { color: '#52525b', maxTicksLimit: 6 } }, y: { display: false } } }
    });
}