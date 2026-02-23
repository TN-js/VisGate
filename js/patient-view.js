import { loadSharedHeader } from "./main.js";

// Configuration
const ACTIVITY_NAMES = { "SC": "Stair Climbing", "STS": "Sit-To-Stand", "TUG": "Timed Up & Go", "W": "Walking" };
const ACTIVITIES = ["SC", "STS", "TUG", "W"];
const ACTIVITY_METRICS = {
    "W": ["step_time_cv_pct_norm", "symmetry_ratio_norm", "cadence_total_steps_min_norm", "gait_index_left_pct_norm", "GSI_pct_norm"],
    "STS": ["cycle_time_cv_pct_norm", "total_duration_sec_norm", "total_peaks_norm"],
    "TUG": ["total_duration_sec_norm", "total_peaks_norm", "cadence_total_steps_min_norm"],
    "SC": ["total_peaks_norm", "total_duration_sec_norm", "cadence_total_steps_min_norm"]
};

// Global State
let globalCompositeData = []; 
let activityDataSets = {};    
let selectedPatientId = 1;
let selectedWeek = null;
let selectedActivity = "W"; 

const tooltip = d3.select("body").append("div").attr("class", "d3-tooltip").style("opacity", 0);
const scoreColorScale = d3.scaleLinear()
    .domain([0, 50, 80, 100])
    .range(["#ef4444", "#f59e0b", "#10b981", "#059669"]);

/**
 * 1. INITIALIZATION & DIRECTORY SCANNING
 */
async function initPatientPage() {
    await loadSharedHeader();
    await setupPatientSelector();
    await loadUserData(selectedPatientId);
}

async function setupPatientSelector() {
    let userIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // Fallback
    try {
        const response = await fetch("data/users/");
        const text = await response.text();
        const doc = new DOMParser().parseFromString(text, "text/html");
        const scannedIds = Array.from(doc.querySelectorAll("a"))
            .map(link => link.textContent.replace('/', ''))
            .filter(name => !isNaN(name) && name.length > 0)
            .map(Number);
        if (scannedIds.length > 0) userIds = scannedIds;
    } catch (e) { console.warn("Directory scan failed, using hardcoded IDs."); }

    const select = d3.select("#patient-select");
    select.selectAll("option").data(userIds).enter().append("option")
        .text(d => `Patient ${d}`).attr("value", d => d);
    
    select.on("change", async function() {
        selectedPatientId = +this.value;
        await loadUserData(selectedPatientId);
    });
}

/**
 * 2. DATA LOADING (Optimized Parallel Loading)
 */
async function loadUserData(userId) {
    const basePath = `data/users/${userId}/${userId}`;
    try {
        // Load the main trend file
        globalCompositeData = await d3.csv(`${basePath}_composite.csv`, d => ({
            ...d, week: +d.week, composite_score_overall: +d.composite_score_overall
        }));

        // Load all 4 activity files at once
        const results = await Promise.all(ACTIVITIES.map(act => d3.csv(`${basePath}_${act}.csv`, d => {
            const parsed = { ...d };
            Object.keys(d).forEach(key => { if (!isNaN(parseFloat(d[key]))) parsed[key] = +d[key]; });
            return parsed;
        })));

        ACTIVITIES.forEach((act, i) => { activityDataSets[act] = results[i]; });

        selectedWeek = d3.max(globalCompositeData, d => d.week);
        updatePatientView();
    } catch (err) { console.error("Error loading user data:", err); }
}

/**
 * 3. CORE VIEW UPDATES
 */
function updatePatientView() {
    const weekData = globalCompositeData.find(d => d.week === selectedWeek);
    if (!weekData) return;

    d3.select("#patient-name-header").text(`Patient ${selectedPatientId}`);
    updateSummaryHeader(weekData);
    renderLineChart(globalCompositeData);
    renderActivityBars(selectedWeek);
    renderRadarCharts();
}

function updateSummaryHeader(data) {
    const score = data.composite_score_overall;
    const color = scoreColorScale(score);
    d3.select("#week-display").text(`Week ${data.week}`);
    d3.select("#score-val-big").text(score.toFixed(1)).style("color", color);
    d3.select("#health-bar").transition().duration(600).style("width", `${score}%`).style("background-color", color);
}

/**
 * 4. NEW VISUALIZATION: WEEKLY ACTIVITY BARS
 */
function renderActivityBars(week) {
    const container = d3.select("#activity-bars-container");
    container.selectAll("*").remove();

    ACTIVITIES.forEach(act => {
        const data = activityDataSets[act].find(d => d.week === week);
        const score = data ? data.composite_score : 0;
        const color = scoreColorScale(score);

        const row = container.append("div").style("display", "flex").style("align-items", "center").style("gap", "15px").style("margin-bottom", "10px");
        row.append("div").style("width", "140px").style("font-size", "14px").style("font-weight", "600").text(ACTIVITY_NAMES[act]);
        
        const barBg = row.append("div").style("flex", "1").style("background", "#f1f5f9").style("height", "12px").style("border-radius", "6px").style("overflow", "hidden");
        barBg.append("div").style("width", "0%").style("height", "100%").style("background", color)
            .transition().duration(800).style("width", `${score}%`);

        row.append("div").style("width", "35px").style("text-align", "right").style("font-weight", "bold").text(Math.round(score));
    });
}

/**
 * 5. CHARTS: LINE & RADAR
 */
function renderLineChart(data, target = "#line-chart", w = 700, h = 300) {
    const margin = {top: 20, right: 30, bottom: 40, left: 50}, width = w - margin.left - margin.right, height = h - margin.top - margin.bottom;
    const container = d3.select(target);
    container.selectAll("*").remove();
    
    const svg = container.append("svg").attr("width", w).attr("height", h).append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x = d3.scaleLinear().domain(d3.extent(data, d => d.week)).range([0, width]);
    const y = d3.scaleLinear().domain([0, 100]).range([height, 0]);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(data.length));
    svg.append("g").call(d3.axisLeft(y));

    const line = d3.line().x(d => x(d.week)).y(d => y(d.composite_score_overall));
    svg.append("path").datum(data).attr("fill", "none").attr("stroke", "#3b82f6").attr("stroke-width", 2.5).attr("d", line);

    svg.selectAll("circle").data(data).enter().append("circle")
        .attr("cx", d => x(d.week)).attr("cy", d => y(d.composite_score_overall)).attr("r", 5)
        .attr("fill", d => d.week === selectedWeek ? "#f59e0b" : "#3b82f6")
        .on("click", (e, d) => { selectedWeek = d.week; updatePatientView(); });
}

function renderRadarCharts(isEnlarged = false) {
    const targetAct = isEnlarged ? "#modal-radar-act" : "#radar-activities";
    const targetMet = isEnlarged ? "#modal-radar-met" : "#radar-metrics";
    const size = isEnlarged ? 400 : 260;

    const activityScores = ACTIVITIES.map(act => {
        const entry = activityDataSets[act].find(d => d.week === selectedWeek);
        return { axis: act, value: entry ? entry.composite_score : 0 };
    });

    drawRadar(targetAct, [{ values: activityScores }], (d) => {
        selectedActivity = d.axis;
        renderRadarCharts(isEnlarged);
    }, size);

    const actWeekData = activityDataSets[selectedActivity]?.find(d => d.week === selectedWeek);
    const metricValues = (ACTIVITY_METRICS[selectedActivity] || []).map(k => ({
        axis: k.replace(/_norm|_pct/g, '').replace(/_/g, ' '),
        value: (actWeekData ? actWeekData[k] : 0) * 100
    }));

    drawRadar(targetMet, [{ values: metricValues }], null, size);
}

function drawRadar(containerId, data, onClick, size) {
    const cfg = { w: size, h: size, margin: 60, levels: 5, maxValue: 100 };
    const container = d3.select(containerId);
    container.selectAll("*").remove();

    const radius = size/2, angleSlice = Math.PI * 2 / data[0].values.length;
    const rScale = d3.scaleLinear().range([0, radius]).domain([0, cfg.maxValue]);

    const svg = container.append("svg").attr("width", size + cfg.margin*2).attr("height", size + cfg.margin*2)
        .append("g").attr("transform", `translate(${radius + cfg.margin},${radius + cfg.margin})`);

    // Levels
    for(let j=0; j<cfg.levels; j++) {
        svg.append("circle").attr("r", radius * ((j+1)/cfg.levels)).attr("fill", "none").attr("stroke", "#cbd5e1").attr("stroke-dasharray", "3,3");
    }

    // Axes & Labels
    const axis = svg.selectAll(".axis").data(data[0].values).enter().append("g");
    axis.append("text").attr("text-anchor", "middle").attr("dy", "0.35em")
        .attr("x", (d, i) => rScale(115) * Math.cos(angleSlice*i - Math.PI/2))
        .attr("y", (d, i) => rScale(115) * Math.sin(angleSlice*i - Math.PI/2))
        .text(d => d.axis).style("font-size", "11px").style("cursor", onClick ? "pointer" : "default")
        .on("click", onClick ? (e, d) => onClick({axis: d.axis}) : null);

    // Polygon
    const radarLine = d3.lineRadial().radius(d => rScale(d.value)).angle((d, i) => i * angleSlice).curve(d3.curveLinearClosed);
    svg.append("path").datum(data[0].values).attr("d", radarLine).attr("fill", "#3b82f6").attr("fill-opacity", 0.3).attr("stroke", "#3b82f6").attr("stroke-width", 2);
}

/**
 * 6. MODAL ENLARGEMENT HANDLER
 */
window.addEventListener('openModal', (e) => {
    const { type } = e.detail;
    const modal = document.getElementById('chart-modal');
    const container = document.getElementById('modal-chart-container');
    modal.style.display = 'flex';
    container.innerHTML = '';

    if (type === 'line') {
        renderLineChart(globalCompositeData, '#modal-chart-container', 1000, 500);
    } else {
        container.innerHTML = '<div id="modal-radar-act"></div><div id="modal-radar-met"></div>';
        renderRadarCharts(true);
    }
});

initPatientPage();