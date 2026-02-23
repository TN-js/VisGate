// scripts.js

// 1. global variables
const patientButton = document.getElementById("tab-button-patient");
const researcherButton = document.getElementById("tab-button-researcher");

const patientContent = document.querySelector(".patient-content");
const researcherContent = document.querySelector(".researcher-content");
const ACTIVE_MODE_KEY = "visgateActiveMode";
const GROUP_COLORS = {
    improving: "#2ecc71",
    declining: "#e74c3c",
    stable:    "#3498db"
};

// Violin filter state
let violinActivity = "All";
let violinGroup    = "All";

// Scatter matrix — all available metrics and cached data
let scatterData = null; // CSV cache for scatter matrix to avoid reloading on every filter change; non repeated CSV fetches
const ALL_SCATTER_METRICS = [
    { key: "composite_score",         name: "Composite Score" },
    { key: "GSI_pct",                 name: "GSI (%)" },
    { key: "symmetry_ratio",          name: "Symmetry Ratio" },
    { key: "step_time_cv_pct",        name: "Step Time CV (%)" },
    { key: "cycle_time_cv_pct",       name: "Cycle Time CV (%)" },
    { key: "cadence_total_steps_min", name: "Cadence (steps/min)" },
    { key: "gait_index_left_pct",     name: "GI Left (%)" },
    { key: "gait_index_right_pct",    name: "GI Right (%)" },
    { key: "step_time_mean_sec",      name: "Step Time (s)" },
    { key: "total_steps",             name: "Total Steps" }
];
const DEFAULT_SCATTER_KEYS = ["composite_score", "GSI_pct", "step_time_cv_pct", "symmetry_ratio"];

// 1.2 Line chart variables
const widthLineChart = 450;
const heightLineChart = 360;
const marginLineChart = { top: 20, right: 30, bottom: 40, left: 45 };

// 2. Functions
function showPatientOnly() {
  patientButton.classList.add("active");
  researcherButton.classList.remove("active");
  patientContent.style.display = "flex";
  researcherContent.style.display = "none";
  localStorage.setItem(ACTIVE_MODE_KEY, "patient");
}

function showResearcherOnly() {
  researcherButton.classList.add("active");
  patientButton.classList.remove("active");
  researcherContent.style.display = "flex";
  patientContent.style.display = "none";
  localStorage.setItem(ACTIVE_MODE_KEY, "researcher");
  renderParallelCoordinatesPlot();
  renderViolinPlot();
  renderScatterMatrix();
}

async function renderViolinPlot() { // builds the activity/group filter dropdowns and draws the violin plot using D3 based on the currently selected filters and the CSV data; called on every change to the dropdowns to update the plot
    if (!window.d3) {
        console.error("D3 did not load. The violin plot cannot render.");
        return;
    }

    const container = d3.select("#violin-plot");
    container.selectAll("*").remove();

    const el = document.getElementById("violin-plot");

    // Controls row
    const controls = container.append("div").attr("class", "violin-filters");
    controls.append("label").text("Activity:");
    controls.append("select")
        .attr("id", "violin-activity-select")
        .on("change", function() { violinActivity = this.value; renderViolinPlot(); })
        .selectAll("option")
        .data(["All", "W", "TUG", "STS", "SC"])
        .enter().append("option")
        .attr("value", d => d)
        .property("selected", d => d === violinActivity)
        .text(d => d);

    controls.append("label").text("Group:");
    controls.append("select")
        .attr("id", "violin-group-select")
        .on("change", function() { violinGroup = this.value; renderViolinPlot(); })
        .selectAll("option")
        .data(["All", "improving", "declining", "stable"])
        .enter().append("option")
        .attr("value", d => d)
        .property("selected", d => d === violinGroup)
        .text(d => d.charAt(0).toUpperCase() + d.slice(1));

    const chartWrap = container.append("div").attr("class", "violin-chart-wrap");
    const width  = Math.max(1, el.clientWidth);
    const height = Math.max(1, el.clientHeight - 36);
    const margin = { top: 20, right: 16, bottom: 44, left: 44 };
    const plotWidth  = width  - margin.left - margin.right;
    const plotHeight = height - margin.top  - margin.bottom;

    const VIOLIN_METRICS = [
        { key: "GSI_pct_norm",             name: "GSI" },
        { key: "symmetry_ratio_norm",       name: "Symmetry" },
        { key: "gait_index_left_pct_norm",  name: "GI Left" },
        { key: "gait_index_right_pct_norm", name: "GI Right" },
        { key: "step_time_cv_pct_norm",     name: "Step CV" },
        { key: "cycle_time_cv_pct_norm",    name: "Cycle CV" }
    ];

    const rows = await d3.csv("data/dashboard_data.csv");
    let filtered = rows;
    if (violinActivity !== "All") filtered = filtered.filter(r => r.activity === violinActivity);
    if (violinGroup    !== "All") filtered = filtered.filter(r => r.user_group === violinGroup);

    const fillColor   = violinGroup !== "All" ? (GROUP_COLORS[violinGroup] || "#83b2ff") : "#83b2ff";
    const strokeColor = violinGroup === "improving" ? "#1a6b3f"
                      : violinGroup === "declining"  ? "#8b1a1a"
                      : violinGroup === "stable"     ? "#1a4a8a"
                      : "#1a3a8a";

    const dataByMetric = VIOLIN_METRICS.map(({ key, name }) => {
        const values = filtered.map(r => Number(r[key])).filter(v => Number.isFinite(v));
        return { key, name, values };
    }).filter(d => d.values.length > 0);

    if (!dataByMetric.length) {
        chartWrap.append("div").style("padding", "16px").style("color", "#888")
            .text("No data for selected filters.");
        return;
    }

    const svg = chartWrap
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
        .domain(dataByMetric.map(d => d.name))
        .range([0, plotWidth]).padding(0.3);
    const y = d3.scaleLinear().domain([0, 1]).range([plotHeight, 0]);

    chart.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".1f")));
    chart.append("g")
        .attr("transform", `translate(0,${plotHeight})`)
        .call(d3.axisBottom(x)).selectAll("text").style("font-size", "11px");
    chart.append("text")
        .attr("transform", "rotate(-90)").attr("x", -plotHeight / 2).attr("y", -34)
        .attr("text-anchor", "middle").style("font-size", "10px")
        .text("Normalized value [0\u20131]");

    const tooltip = d3.select("#vis-tooltip");
    const kde = kernelDensityEstimator(kernelEpanechnikov(0.12), y.ticks(50)); // bandwidth of 0.12 is a starting point, can be adjusted for smoother or more detailed violins

    dataByMetric.forEach(({ name, values }) => {
        const density    = kde(values);
        const maxDensity = d3.max(density, d => d[1]) || 1;
        const bw         = x.bandwidth();
        const xDensity   = d3.scaleLinear().domain([-maxDensity, maxDensity]).range([0, bw]);
        const violinG    = chart.append("g").attr("transform", `translate(${x(name)},0)`);

        violinG.append("path")
            .datum(density)
            .attr("fill", fillColor).attr("fill-opacity", 0.65)
            .attr("stroke", strokeColor).attr("stroke-width", 1)
            .attr("d", d3.area()
                .x0(d => xDensity(-d[1])).x1(d => xDensity(d[1]))
                .y(d => y(d[0])).curve(d3.curveCatmullRom));

        const sorted = values.slice().sort(d3.ascending);
        const q1     = d3.quantile(sorted, 0.25);
        const median = d3.quantile(sorted, 0.50);
        const q3     = d3.quantile(sorted, 0.75);
        const iqr    = q3 - q1;
        const wLow   = Math.max(d3.min(values), q1 - 1.5 * iqr);
        const wHigh  = Math.min(d3.max(values), q3 + 1.5 * iqr);
        const cx     = bw / 2;

        // Draw box plot elements on top of the violin
        violinG.append("line").attr("x1", cx).attr("x2", cx) 
            .attr("y1", y(wHigh)).attr("y2", y(q3))
            .attr("stroke", strokeColor).attr("stroke-width", 1);
        violinG.append("line").attr("x1", cx).attr("x2", cx)
            .attr("y1", y(q1)).attr("y2", y(wLow))
            .attr("stroke", strokeColor).attr("stroke-width", 1);
        violinG.append("rect")
            .attr("x", cx - 5).attr("y", y(q3))
            .attr("width", 10).attr("height", Math.max(1, y(q1) - y(q3)))
            .attr("fill", "#fff").attr("stroke", strokeColor).attr("stroke-width", 1.5);
        violinG.append("line")
            .attr("x1", cx - 5).attr("x2", cx + 5)
            .attr("y1", y(median)).attr("y2", y(median))
            .attr("stroke", "#e74c3c").attr("stroke-width", 2);

        violinG.append("rect")
            .attr("x", 0).attr("y", 0)
            .attr("width", bw).attr("height", plotHeight)
            .attr("fill", "transparent")
            .on("mouseover", (event) => {
                const actLabel = violinActivity === "All" ? "All activities" : violinActivity;
                const grpLabel = violinGroup === "All" ? "All groups" : violinGroup;
                tooltip.style("display", "block")
                    .html(`<strong>${name}</strong> \u2014 ${actLabel}, ${grpLabel}<br>
                        Median: ${median.toFixed(3)}<br>
                        Q1: ${q1.toFixed(3)} &nbsp; Q3: ${q3.toFixed(3)}<br>
                        Min: ${d3.min(values).toFixed(3)} &nbsp; Max: ${d3.max(values).toFixed(3)}<br>
                        n\u00a0=\u00a0${values.length}`);
            })
            .on("mousemove", (event) => {
                tooltip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => tooltip.style("display", "none"));
    });
}

async function renderParallelCoordinatesPlot() {
    if (!window.d3) {
        console.error("D3 did not load. The parallel coordinates plot cannot render.");
        return;
    }

    const container = d3.select("#parallel-coord-plot");
    container.selectAll("*").remove();

    const el = document.getElementById("parallel-coord-plot");
    const width = el.clientWidth;
    const height = el.clientHeight;
    const margin = { top: 20, right: 20, bottom: 28, left: 20 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    const rows = await d3.csv("data/dashboard_data.csv");
    const byWeekActivity = new Map();

    rows.forEach((row) => {
        const activity = String(row.activity || "").trim().toUpperCase();
        if (activity !== "W" && activity !== "TUG") return;
        const week = Number(row.week);
        if (!Number.isFinite(week)) return;

        const key = `${week}-${activity}`;
        if (!byWeekActivity.has(key)) {
            byWeekActivity.set(key, {
                week,
                activity,
                gsi: [],
                gir: [],
                gil: [],
                cadence: [],
                symmetry: []
            });
        }

        const bucket = byWeekActivity.get(key);
        const gsi = Number(row.GSI_pct);
        const gir = Number(row.gait_index_right_pct);
        const gil = Number(row.gait_index_left_pct);
        const cadence = Number(row.cadence_total_steps_min);
        const symmetry = Number(row.symmetry_ratio);

        if (Number.isFinite(gsi)) bucket.gsi.push(gsi);
        if (Number.isFinite(gir)) bucket.gir.push(gir);
        if (Number.isFinite(gil)) bucket.gil.push(gil);
        if (Number.isFinite(cadence)) bucket.cadence.push(cadence);
        if (Number.isFinite(symmetry)) bucket.symmetry.push(symmetry);
    });

    const dimensions = [
        "GSI-TUG",
        "GSI-W",
        "GIR-TUG",
        "GIL-TUG",
        "GIR-W",
        "GIL-W",
        "Cadence",
        "Symmetry Ratio"
    ];

    const weekMap = new Map();
    byWeekActivity.forEach((entry) => {
        if (!weekMap.has(entry.week)) weekMap.set(entry.week, { week: entry.week });
        const target = weekMap.get(entry.week);
        const prefix = entry.activity === "TUG" ? "TUG" : "W";
        const mean = (arr) => (arr.length ? d3.mean(arr) : NaN);

        target[`GSI-${prefix}`] = mean(entry.gsi);
        target[`GIR-${prefix}`] = mean(entry.gir);
        target[`GIL-${prefix}`] = mean(entry.gil);
        target[`Cadence-${prefix}`] = mean(entry.cadence);
        target[`Symmetry-${prefix}`] = mean(entry.symmetry);
    });

    const data = Array.from(weekMap.values())
        .map((row) => ({
            week: row.week,
            "GSI-TUG": row["GSI-TUG"],
            "GSI-W": row["GSI-W"],
            "GIR-TUG": row["GIR-TUG"],
            "GIL-TUG": row["GIL-TUG"],
            "GIR-W": row["GIR-W"],
            "GIL-W": row["GIL-W"],
            "Cadence": d3.mean([row["Cadence-TUG"], row["Cadence-W"]].filter(Number.isFinite)),
            "Symmetry Ratio": d3.mean([row["Symmetry-TUG"], row["Symmetry-W"]].filter(Number.isFinite))
        }))
        .filter((row) => dimensions.every((dimension) => Number.isFinite(row[dimension])))
        .sort((a, b) => a.week - b.week);

    if (!data.length) {
        container.text("No W/TUG data available.");
        return;
    }

    const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("preserveAspectRatio", "xMidYMid meet");

    const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x = d3.scalePoint().domain(dimensions).range([0, plotWidth]).padding(0.2);

    const yByDimension = {};
    dimensions.forEach((dimension) => {
        const extent = d3.extent(data, (row) => row[dimension]);
        yByDimension[dimension] = d3
            .scaleLinear()
            .domain(extent[0] === extent[1] ? [extent[0] - 1, extent[1] + 1] : extent)
            .nice()
            .range([plotHeight, 0]);
    });

    const line = d3
        .line()
        .x(([dimension]) => x(dimension))
        .y(([dimension, value]) => yByDimension[dimension](value));

    chart
        .selectAll(".pc-line")
        .data(data)
        .enter()
        .append("path")
        .attr("class", "pc-line")
        .attr("fill", "none")
        .attr("stroke", "#3b82f6")
        .attr("stroke-width", 1.2)
        .attr("opacity", 0.45)
        .attr("d", (row) => line(dimensions.map((dimension) => [dimension, row[dimension]])));

    const axis = chart
        .selectAll(".pc-axis")
        .data(dimensions)
        .enter()
        .append("g")
        .attr("class", "pc-axis")
        .attr("transform", (dimension) => `translate(${x(dimension)},0)`)
        .each(function(dimension) {
            d3.select(this).call(d3.axisLeft(yByDimension[dimension]).ticks(4));
        });

    axis
        .append("text")
        .attr("y", -8)
        .attr("text-anchor", "middle")
        .attr("fill", "#111")
        .style("font-size", "12px")
        .text((dimension) => dimension);
}

function renderTestLineChart() {
    if (!window.d3) {
        console.error("D3 did not load. The violin plot cannot render.");
        return;
    }

    const container = d3.select("#patient-visualization");
    container.selectAll("*").remove();

    const svg = container
        .append("svg")
        .attr("width", widthLineChart + marginLineChart.left + marginLineChart.right)
        .attr("height", heightLineChart + marginLineChart.top + marginLineChart.bottom);

    const chart = svg
        .append("g")
        .attr("transform", `translate(${marginLineChart.left},${marginLineChart.top})`);

    const y = d3
        .scaleLinear()
        .range([heightLineChart, 0]);
    const x = d3
        .scaleLinear()
        .range([0, widthLineChart])

    const dataset = [
        {session:1, value:-4},
        {session:2, value:-4},
        {session:3, value:-3},
        {session:4, value:-3},
        {session:5, value:-2},
        {session:6, value:-2},
        {session:7, value:-1},
        {session:8, value:-1},
        {session:9, value:-1},
        {session:10, value:-0}
    ]; // todo: Replace const dataset with real data

    x.domain(d3.extent(dataset, d => d.session))
    y.domain([d3.min(dataset, d => d.value), 0])

    chart.append("g").call(d3.axisLeft(y));
    chart
        .append("g")
        .attr("transform", `translate(0,${heightLineChart})`)
        .call(d3.axisBottom(x));

    const line = d3.line()
        .x(d=>x(d.session))
        .y(d=>y(d.value))
    
    chart.append("path")
        .datum(dataset)
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 1)
        .attr("d", line)

    chart.selectAll("myCircles")
        .data(dataset)
        .enter()
        .append("circle") // enter append
            .attr("class", "session-value")
            .attr("r", "3") // radius
            .attr("cx", function(d) { return x(d.session) })   // center x passing through your xScale
            .attr("cy", function(d) { return y(d.value)})   // center y through your yScale
    // todo: Add highlighting of points and add data windows
}

// function called once on researcher tab load and on every change to the scatter matrix checkboxes
// builds the checkbox panel using plain document.createElement and draws the scatter matrix using D3 based on the currently active checkboxes and cached CSV data
async function renderScatterMatrix() {
    if (!window.d3) {
        console.error("D3 did not load. The scatter matrix cannot render.");
        return;
    }

    const el = document.getElementById("scatter-plot-matrix");
    el.innerHTML = "";

    // Load and cache data once
    if (!scatterData) {
        const rows = await d3.csv("data/dashboard_data.csv"); 
        scatterData = rows.map(r => {
            const obj = { user_id: r.user_id, week: r.week, activity: r.activity, user_group: r.user_group };
            ALL_SCATTER_METRICS.forEach(m => { obj[m.key] = Number(r[m.key]); });
            return obj;
        });
    }

    // Left checkbox panel
    const controlsDiv = document.createElement("div");
    controlsDiv.className = "scatter-controls";
    const labelEl = document.createElement("div");
    labelEl.className = "scatter-controls-label";
    labelEl.textContent = "Metrics";
    controlsDiv.appendChild(labelEl);

    ALL_SCATTER_METRICS.forEach(m => {
        const lbl = document.createElement("label");
        lbl.className = "scatter-check-label";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = m.key;
        cb.checked = DEFAULT_SCATTER_KEYS.includes(m.key);
        cb.addEventListener("change", () => { // Prevent unchecking if it would result in fewer than 2 active metrics, which is the minimum needed to draw a scatter plot
            const active = getActiveScatterMetrics(el);
            if (active.length < 2) { cb.checked = !cb.checked; return; }
            drawScatterSVG(scatterData, active, svgWrap);
        });
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(" " + m.name));
        controlsDiv.appendChild(lbl);
    });

    const svgWrap = document.createElement("div");
    svgWrap.className = "scatter-svg-wrap";

    el.appendChild(controlsDiv);
    el.appendChild(svgWrap);

    drawScatterSVG(scatterData, getActiveScatterMetrics(el), svgWrap);
}

function getActiveScatterMetrics(el) { // scans the checkbox panel and returns only the metrics whose box is currently ticked
    return ALL_SCATTER_METRICS.filter(m => {
        const cb = el.querySelector(`input[value="${m.key}"]`);
        return cb && cb.checked;
    });
}

// D3 draws, receives the data, the list of active metrics, and the DOM element to draw into
// XML‑based graphics format used directly in the browser to draw shapes, lines, circles, text, and full visualizations.
function drawScatterSVG(data, metrics, wrapEl) {
    wrapEl.innerHTML = "";
    const n = metrics.length;
    if (n < 2) return;

    const totalWidth  = Math.max(1, wrapEl.clientWidth);
    const totalHeight = Math.max(1, wrapEl.clientHeight);
    const gap   = 3; // gap between scatter plot cells; also used as padding around the entire matrix
    const cellW = Math.floor((totalWidth  - gap * (n + 1)) / n);
    const cellH = Math.floor((totalHeight - gap * (n + 1)) / n);
    const ip    = { top: 14, right: 4, bottom: 14, left: 20 }; // inner padding within each scatter plot cell for axes and labels
    const innerW = cellW - ip.left - ip.right; 
    const innerH = cellH - ip.top  - ip.bottom;

    const svg = d3.select(wrapEl) // selects the container element and appends an SVG canvas to it, setting up the coordinate system and responsive behavior for the scatter plot matrix
        .append("svg")
        .attr("viewBox", `0 0 ${totalWidth} ${totalHeight}`)
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("width", "100%").style("height", "100%");

    const tooltip = d3.select("#vis-tooltip");

    metrics.forEach((rowM, row) => {
        metrics.forEach((colM, col) => {
            const cx    = gap + col * (cellW + gap);
            const cy    = gap + row * (cellH + gap);
            const cellG = svg.append("g").attr("transform", `translate(${cx},${cy})`);

            cellG.append("rect") // draws the background rectangle for each cell in the scatter plot matrix, with a different fill color for diagonal cells (where row and column metrics are the same) to visually distinguish them as labels rather than scatter plots
                .attr("width", cellW).attr("height", cellH)
                .attr("fill",   row === col ? "#eef2ff" : "#fafafa")
                .attr("stroke", "#ccc").attr("stroke-width", 0.5);

            const plotG = cellG.append("g").attr("transform", `translate(${ip.left},${ip.top})`);

            if (row === col) {
                // Diagonal — label only
                cellG.append("text")
                    .attr("x", cellW / 2).attr("y", cellH / 2 - 4)
                    .attr("text-anchor", "middle")
                    .style("font-size", "10px").style("font-weight", "700")
                    .style("fill", "#1a3a8a").style("pointer-events", "none")
                    .text(colM.name);
                cellG.append("text")
                    .attr("x", cellW / 2).attr("y", cellH / 2 + 12)
                    .attr("text-anchor", "middle")
                    .style("font-size", "8px").style("fill", "#888").style("pointer-events", "none");
            } else {
                // Off-diagonal — scatter
                const valid = data.filter(d => Number.isFinite(d[colM.key]) && Number.isFinite(d[rowM.key]));
                if (!valid.length) return;

                const xSc = d3.scaleLinear().domain(d3.extent(valid, d => d[colM.key])).nice().range([0, innerW]);
                const ySc = d3.scaleLinear().domain(d3.extent(valid, d => d[rowM.key])).nice().range([innerH, 0]);
                const r   = pearsonR(valid.map(d => d[colM.key]), valid.map(d => d[rowM.key]));

                plotG.selectAll("circle").data(valid).enter().append("circle")
                    .attr("cx", d => xSc(d[colM.key]))
                    .attr("cy", d => ySc(d[rowM.key]))
                    .attr("r", 2)
                    .attr("fill", d => GROUP_COLORS[d.user_group] || "#aaa")
                    .attr("fill-opacity", 0.5)
                    .attr("stroke", "none")
                    .on("mouseover", (event, d) => {
                        tooltip.style("display", "block")
                            .html(`User ${d.user_id} \u00b7 Wk ${d.week} \u00b7 ${d.activity}<br>
                                ${colM.name}: ${Number.isFinite(d[colM.key]) ? d[colM.key].toFixed(2) : "N/A"}<br>
                                ${rowM.name}: ${Number.isFinite(d[rowM.key]) ? d[rowM.key].toFixed(2) : "N/A"}<br>
                                Group: <em>${d.user_group}</em>`);
                    })
                    .on("mousemove", (event) => {
                        tooltip.style("left", (event.pageX + 12) + "px").style("top", (event.pageY - 28) + "px");
                    })
                    .on("mouseout", () => tooltip.style("display", "none"));

                cellG.append("text")
                    .attr("x", cellW - 3).attr("y", 10)
                    .attr("text-anchor", "end")
                    .style("font-size", "8px")
                    .style("fill", Math.abs(r) > 0.5 ? "#c0392b" : "#777")
                    .text(`r=${r.toFixed(2)}`);
            }

            if (row === n - 1) {
                cellG.append("text")
                    .attr("x", cellW / 2).attr("y", cellH - 1)
                    .attr("text-anchor", "middle")
                    .style("font-size", "8px").style("fill", "#666")
                    .text(colM.name);
            }
            if (col === 0) {
                cellG.append("text")
                    .attr("transform", `translate(9,${cellH / 2}) rotate(-90)`)
                    .attr("text-anchor", "middle")
                    .style("font-size", "8px").style("fill", "#666")
                    .text(rowM.name);
            }
        });
    });
}

function pearsonR(xs, ys) { // calculates Pearson correlation coefficient between two arrays of numbers; returns 0 if arrays have fewer than 2 valid points or if standard deviation of either array is 0
    const n  = xs.length;
    if (n < 2) return 0;
    const mx = d3.mean(xs);
    const my = d3.mean(ys);
    const num = d3.sum(xs.map((x, i) => (x - mx) * (ys[i] - my)));
    const den = Math.sqrt(
        d3.sum(xs.map(x => (x - mx) ** 2)) *
        d3.sum(ys.map(y => (y - my) ** 2))
    );
    return den === 0 ? 0 : num / den;
}

// 2 functions needed for kernel density estimate
function kernelDensityEstimator(kernel, X) {
    return function(V) {
        return X.map(function(x) {
            return [x, d3.mean(V, function(v) { return kernel(x - v); })];
        });
    };
}
function kernelEpanechnikov(k) {
    return function(v) {
        return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
    };
}

// 3. Event listeners
patientButton.addEventListener("click", showPatientOnly);
researcherButton.addEventListener("click", showResearcherOnly);
renderTestLineChart();

// Restore last selected mode. Default to patient for first-time visitors.
const savedMode = localStorage.getItem(ACTIVE_MODE_KEY);
if (savedMode === "researcher") {
    showResearcherOnly();
} else {
    showPatientOnly();
}
// About modal
const btnAbout = document.getElementById("btn-about");
const modalAbout = document.getElementById("modal-about");
btnAbout.addEventListener("click", () => modalAbout.classList.add("open"));
modalAbout.addEventListener("click", (e) => {
    if (e.target === modalAbout) modalAbout.classList.remove("open");
});