let charts = [];

const QUALITY_TARGET = 85;
const INCIDENT_CATEGORIES = [
  { key: "burbuja", label: "Burbuja", color: "#f3b21a", icon: "B" },
  { key: "grasa", label: "Grasa", color: "#16a34a", icon: "G" },
  { key: "bordes", label: "Bordes sucios", color: "#dc2626", icon: "S" },
  { key: "horneado", label: "Nivel de horneado", color: "#7c3aed", icon: "H" },
  { key: "distribucion", label: "Distribucion de ingredientes", color: "#2563eb", icon: "D" }
];

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`No se pudo cargar ${path}`);
  return await res.json();
}

function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

function percentage(value, total) {
  return total ? (Number(value || 0) / Number(total || 0)) * 100 : 0;
}

function scoreClass(score) {
  if (score >= QUALITY_TARGET) return "score-good";
  if (score >= 70) return "score-mid";
  return "score-bad";
}

function approvalRate(row) {
  return percentage(Number(row.pass_count ?? 0), Number(row.total_pizzas ?? row.categorySummary?.total ?? 0));
}

function averageScore(rows) {
  const scores = rows
    .map((row) => Number(row.score))
    .filter((score) => Number.isFinite(score));
  if (!scores.length) return NaN;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function passAverageScore(rows) {
  return averageScore(
    rows.filter((row) => String(row.veredicto || "").trim().toUpperCase() === "PASS")
  );
}

function failAverageScore(rows) {
  return averageScore(
    rows.filter((row) => String(row.veredicto || "").toUpperCase() === "FAIL")
  );
}

function severity(score) {
  if (score >= QUALITY_TARGET) return { key: "healthy", label: "Cumple", badge: "status-healthy" };
  if (score >= 70) return { key: "risk", label: "Riesgo", badge: "status-risk" };
  return { key: "critical", label: "Critico", badge: "status-critical" };
}

function trendMeta(delta) {
  if (!Number.isFinite(delta)) return { icon: "&rarr;", label: "Sin referencia", className: "trend-flat" };
  if (delta > 0.2) return { icon: "&uarr;", label: `+${delta.toFixed(1)} pp`, className: "trend-up" };
  if (delta < -0.2) return { icon: "&darr;", label: `${delta.toFixed(1)} pp`, className: "trend-down" };
  return { icon: "&rarr;", label: "Estable", className: "trend-flat" };
}

function verdictPill(score) {
  if (score >= QUALITY_TARGET) return `<span class="pill pass">Aprobado</span>`;
  return `<span class="pill fail">Bajo meta</span>`;
}

function titleCase(text) {
  return String(text || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderHeader(summary) {
  document.getElementById("districtTitle").textContent =
    summary.display_name || summary.district_slug || "Distrito";
  document.getElementById("districtSubtitle").textContent =
    `${summary.company || "Compania"} - Resumen ejecutivo distrital`;
  document.title =
    `${summary.display_name || summary.district_slug} - Dashboard distrital`;
}

function formatShortSpanishDate(date) {
  const months = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sep.", "oct.", "nov.", "dic."];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function parseRowDate(row) {
  const rawDate = String(row.fecha || "").trim();
  const sourceUrl = String(row.source_url || "").trim();
  const urlMatch = sourceUrl.match(/(\d{8})-(\d{6})/);

  if (urlMatch) {
    const [, yyyymmdd, hhmmss] = urlMatch;
    const parsed = new Date(
      Number(yyyymmdd.slice(0, 4)),
      Number(yyyymmdd.slice(4, 6)) - 1,
      Number(yyyymmdd.slice(6, 8)),
      Number(hhmmss.slice(0, 2)),
      Number(hhmmss.slice(2, 4)),
      Number(hhmmss.slice(4, 6))
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (/^\d+(\.\d+)?$/.test(rawDate)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + Number(rawDate) * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function locationScore(row) {
  const fromDetail = Number(row.scoreAverage ?? NaN);
  if (Number.isFinite(fromDetail)) return fromDetail;
  const raw = Number(row.average_score ?? NaN);
  if (Number.isFinite(raw)) return raw;
  return 0;
}

function isYes(value) {
  return String(value || "").trim().toLowerCase() === "si";
}

function isBadBake(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized && normalized !== "correcto";
}

function isBadDistribution(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["deficiente", "baja", "mala", "incorrecta"].includes(normalized);
}

function computeCategoryMetrics(rows, fallback = {}) {
  const total = rows.length || Number(fallback.total_pizzas || 0);
  const metrics = {
    burbuja: Number(fallback.burbuja_count || 0),
    grasa: Number(fallback.grasa_count || 0),
    bordes: Number(fallback.bordes_count || 0),
    horneado: Number(fallback.horneado_count || 0),
    distribucion: Number(fallback.distribucion_count || 0)
  };

  if (rows.length) {
    metrics.burbuja = rows.filter((row) => isYes(row.burbuja) || row.tiene_burbujas === true).length;
    metrics.grasa = rows.filter((row) => isYes(row.grasa) || row.tiene_grasa === true).length;
    metrics.bordes = rows.filter((row) => isYes(row.bordes_sucios) || row.bordes_limpios === false).length;
    metrics.horneado = rows.filter((row) => isBadBake(row.horneado)).length;
    metrics.distribucion = rows.filter((row) => isBadDistribution(row.distribucion)).length;
  }

  return { total, metrics };
}

function computeComparison(rows) {
  const datedRows = rows
    .map((row) => ({ row, date: parseRowDate(row) }))
    .filter((item) => item.date)
    .sort((a, b) => a.date - b.date);

  if (!datedRows.length) return null;

  const maxDate = datedRows[datedRows.length - 1].date;
  const currentStart = new Date(maxDate);
  currentStart.setDate(maxDate.getDate() - 6);
  currentStart.setHours(0, 0, 0, 0);

  const previousStart = new Date(currentStart);
  previousStart.setDate(currentStart.getDate() - 7);

  const current = datedRows.filter((item) => item.date >= currentStart).map((item) => item.row);
  const previous = datedRows
    .filter((item) => item.date >= previousStart && item.date < currentStart)
    .map((item) => item.row);

  if (!current.length || !previous.length) return null;

  const currentScore = averageScore(current);
  const previousScore = averageScore(previous);
  if (!Number.isFinite(currentScore) || !Number.isFinite(previousScore)) return null;
  return currentScore - previousScore;
}

async function enrichLocations(locations) {
  const allDates = [];

  const enriched = await Promise.all(locations.map(async (loc) => {
    let rows = [];

    try {
      const detailed = await fetchJson(`${loc.relative_url}json/detailed.json`);
      rows = Array.isArray(detailed) ? detailed : [];
      rows.forEach((row) => {
        const parsed = parseRowDate(row);
        if (parsed) allDates.push(parsed);
      });
    } catch (err) {
      console.warn(`No se pudo cargar detalle de ${loc.location}:`, err);
    }

    const categorySummary = computeCategoryMetrics(rows, loc);
    const comparisonDelta = computeComparison(rows);
    const scoreAverage = averageScore(rows);
    const passScoreAverage = passAverageScore(rows);
    const failScoreAverage = failAverageScore(rows);
    return { ...loc, scoreAverage, passScoreAverage, failScoreAverage, categorySummary, comparisonDelta };
  }));

  const target = document.getElementById("weekRange");
  if (target) {
    if (allDates.length) {
      allDates.sort((a, b) => a - b);
      const minDate = allDates[0];
      const maxDate = allDates[allDates.length - 1];
      target.textContent = `Periodo: ${formatShortSpanishDate(minDate)} - ${formatShortSpanishDate(maxDate)}, ${maxDate.getFullYear()}`;
    } else {
      target.textContent = "Periodo: -";
    }
  }

  return enriched;
}

function renderSummary(summary, locations = []) {
  const total = Number(summary.total_pizzas ?? 0);
  const pass = Number(summary.pass_count ?? 0);
  const fail = Number(summary.fail_count ?? 0);
  const weightedAverage = (averageKey, countKey) => {
    const scoreTotal = locations.reduce((sum, loc) => {
      const avg = Number(loc[averageKey]);
      const count = Number(loc[countKey] ?? 0);
      return Number.isFinite(avg) ? sum + avg * count : sum;
    }, 0);
    const scoreCount = locations.reduce((sum, loc) => {
      const avg = Number(loc[averageKey]);
      const count = Number(loc[countKey] ?? 0);
      return Number.isFinite(avg) ? sum + count : sum;
    }, 0);
    return scoreCount ? scoreTotal / scoreCount : NaN;
  };
  const weightedScoreTotal = locations.reduce((sum, loc) => {
    const locTotal = Number(loc.total_pizzas ?? loc.categorySummary?.total ?? 0);
    return sum + locationScore(loc) * locTotal;
  }, 0);
  const weightedScoreCount = locations.reduce(
    (sum, loc) => sum + Number(loc.total_pizzas ?? loc.categorySummary?.total ?? 0),
    0
  );
  const districtScore = weightedScoreCount
    ? weightedScoreTotal / weightedScoreCount
    : Number(summary.average_score ?? 0);
  const passScore = weightedAverage("passScoreAverage", "pass_count");
  const failScore = weightedAverage("failScoreAverage", "fail_count");

  document.getElementById("totalLocations").textContent = summary.total_locations ?? 0;
  document.getElementById("totalPizzas").textContent = total;
  document.getElementById("avgScore").textContent = `${districtScore.toFixed(1)}%`;
  document.getElementById("passFail").textContent = `${pass} / ${fail}`;
  document.getElementById("passFailPct").innerHTML =
    `Score PASS: ${Number.isFinite(passScore) ? passScore.toFixed(1) : "N/A"}%<br>` +
    `Score FAIL: ${Number.isFinite(failScore) ? failScore.toFixed(1) : "N/A"}%`;
  document.getElementById("passRate").textContent = `${percentage(pass, total).toFixed(1)}%`;
}

function polarPoint(cx, cy, radius, angle) {
  const radians = (angle - 180) * Math.PI / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians)
  };
}

function gaugeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarPoint(cx, cy, radius, endAngle);
  const end = polarPoint(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function renderGauge(score) {
  const clamped = Math.max(0, Math.min(100, score));
  const angle = (clamped / 100) * 180;
  const needleStart = polarPoint(160, 158, 84, angle);
  const needleEnd = polarPoint(160, 158, 112, angle);

  return `
      <div class="gauge">
        <svg viewBox="0 0 320 190" aria-label="Score general ${clamped.toFixed(1)}%">
        <path d="${gaugeArc(160, 158, 122, 0, 60)}" fill="none" stroke="#dc2626" stroke-width="20" stroke-linecap="round" />
        <path d="${gaugeArc(160, 158, 122, 60, 120)}" fill="none" stroke="#f3b21a" stroke-width="20" stroke-linecap="round" />
        <path d="${gaugeArc(160, 158, 122, 120, 180)}" fill="none" stroke="#16a34a" stroke-width="20" stroke-linecap="round" />
        <line x1="${needleStart.x}" y1="${needleStart.y}" x2="${needleEnd.x}" y2="${needleEnd.y}" stroke="#0f172a" stroke-width="4" stroke-linecap="round" />
      </svg>
      <div class="gauge-value">${clamped.toFixed(1)}%</div>
      <div class="gauge-scale"><span>0%</span><span>100%</span></div>
    </div>
  `;
}

function comparisonText(delta) {
  if (!Number.isFinite(delta)) return "Sin referencia semana anterior";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} pp vs semana anterior`;
}

function sparkline(value, total, color) {
  const pct = Math.max(0, Math.min(100, percentage(value, total)));
  const bars = [0.32, 0.58, 0.88, 0.64, 0.72].map((factor, index) => {
    const height = Math.max(6, Math.round(30 * Math.max(0.18, (pct / 100) * factor)));
    const x = 4 + index * 9;
    const y = 32 - height;
    return `<rect x="${x}" y="${y}" width="6" height="${height}" rx="1.5" fill="${color}" opacity="${0.45 + index * 0.1}"></rect>`;
  }).join("");

  return `
    <svg class="spark" viewBox="0 0 54 34" preserveAspectRatio="xMidYMid meet">
      ${bars}
    </svg>
  `;
}

function renderLocationCards(locations) {
  const container = document.getElementById("locationCards");
  container.innerHTML = "";

  locations.forEach((row) => {
    const total = Number(row.total_pizzas ?? row.categorySummary?.total ?? 0);
    const pass = Number(row.pass_count ?? 0);
    const fail = Number(row.fail_count ?? 0);
    const score = locationScore(row);
    const categories = row.categorySummary?.metrics || {};
    const state = severity(score);
    const trend = trendMeta(row.comparisonDelta);

    const defectsHtml = INCIDENT_CATEGORIES.map((cat) => {
      const value = Number(categories[cat.key] || 0);
      return `
        <div class="defect-item">
          <div class="defect-head">
            <div class="defect-icon" style="background:${cat.color}">${cat.icon}</div>
            <div class="defect-copy">
              <div class="defect-label">${cat.label}</div>
              <div class="defect-value" style="color:${cat.color}">${value}</div>
              <div class="defect-pct">(${percentage(value, total).toFixed(1)}%)</div>
            </div>
            ${sparkline(value, total, cat.color)}
          </div>
        </div>
      `;
    }).join("");

    const card = document.createElement("div");
    card.className = `location-card ${state.key}`;
    card.innerHTML = `
      <div class="location-hero">
        <div class="location-top">
          <div>
            <h3 class="location-name">${titleCase(row.location)}</h3>
            <span class="status-chip ${state.badge}">${state.label}</span>
          </div>
        </div>
        <div class="gauge-panel">
          <div class="gauge-title">Score general</div>
          ${renderGauge(score)}
          <div class="trend-line ${trend.className}">${trend.icon} ${trend.label} vs semana anterior</div>
        </div>
        <div class="location-actions">
          <a class="location-link" href="${row.relative_url}">ABRIR DASHBOARD</a>
        </div>
      </div>
      <div class="location-content">
        <div class="location-main">
          <div class="location-kpis">
            <div class="mini-kpi brand">
              <div class="mini-kpi-head"><div class="mini-icon">P</div></div>
              <div>
                <div class="k">Pizzas</div>
                <div class="v">${total}</div>
              </div>
            </div>
            <div class="mini-kpi good">
              <div class="mini-kpi-head"><div class="mini-icon">&#10003;</div></div>
              <div>
                <div class="k">Pass</div>
                <div class="v">${pass}</div>
                <div class="s">(${percentage(pass, total).toFixed(1)}%)</div>
              </div>
            </div>
            <div class="mini-kpi bad">
              <div class="mini-kpi-head"><div class="mini-icon">&#215;</div></div>
              <div>
                <div class="k">Fail</div>
                <div class="v">${fail}</div>
                <div class="s">(${percentage(fail, total).toFixed(1)}%)</div>
              </div>
            </div>
          </div>
          <!-- 
          <div class="defect-panel">
            <div class="defect-title">Defectos y categorias</div>
            <div class="defect-grid">${defectsHtml}</div>
          </div>
          -->
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderPriorityRanking(locations) {
  const container = document.getElementById("priorityRanking");
  if (!container) return;

  const rows = locations
    .slice()
    .sort((a, b) => locationScore(a) - locationScore(b))
    .map((row, index) => {
      const score = locationScore(row);
      const state = severity(score);
      const trend = trendMeta(row.comparisonDelta);

      return `
        <div class="priority-row">
          <div class="rank-cell">#${index + 1}</div>
          <div class="store-cell">${titleCase(row.location)}</div>
          <div><span class="score-badge ${state.badge}">${score.toFixed(1)}%</span></div>
          <div><span class="trend ${trend.className}">${trend.icon} ${trend.label}</span></div>
        </div>
      `;
    }).join("");

  container.innerHTML = `
    <div class="priority-row priority-head">
      <div>Ranking</div>
      <div>Tienda</div>
      <div>Score</div>
      <div>Variacion semanal</div>
    </div>
    ${rows}
  `;
}

function renderInsights(locations) {
  const container = document.getElementById("insightsList");
  if (!container) return;

  const byScoreAsc = locations.slice().sort((a, b) => locationScore(a) - locationScore(b));
  const byScoreDesc = locations.slice().sort((a, b) => locationScore(b) - locationScore(a));
  const worst = byScoreAsc[0];
  const best = byScoreDesc[0];
  const allProblems = INCIDENT_CATEGORIES.map((cat) => {
    const value = locations.reduce((sum, loc) => sum + Number(loc.categorySummary?.metrics?.[cat.key] || 0), 0);
    return { ...cat, value };
  }).sort((a, b) => b.value - a.value);
  const topProblem = allProblems[0];
  const worsening = locations
    .filter((loc) => Number.isFinite(loc.comparisonDelta) && loc.comparisonDelta < -0.2)
    .sort((a, b) => a.comparisonDelta - b.comparisonDelta)[0];
  const stable = locations
    .filter((loc) => !Number.isFinite(loc.comparisonDelta) || Math.abs(loc.comparisonDelta) <= 0.2)
    .sort((a, b) => locationScore(b) - locationScore(a))[0];

  const insights = [
    worst ? { tone: "alert", icon: "!", text: `${titleCase(worst.location)} presenta el score mas bajo del distrito` } : null,
    topProblem ? { tone: "warn", icon: topProblem.icon, text: `${topProblem.label} es la principal incidencia operativa` } : null,
    worsening ? { tone: "alert", icon: "&darr;", text: `${titleCase(worsening.location)} incremento fallas esta semana` } : null,
    stable ? { tone: "neutral", icon: "&rarr;", text: `${titleCase(stable.location)} mantiene desempeno estable` } : null,
    best ? { tone: "good", icon: "&uarr;", text: `${titleCase(best.location)} lidera el cumplimiento del distrito` } : null
  ].filter(Boolean).slice(0, 5);

  container.innerHTML = insights.map((item) => `
    <div class="insight-card ${item.tone}">
      <div class="insight-icon">${item.icon}</div>
      <div class="insight-text">${item.text}</div>
    </div>
  `).join("");
}

function commonOptions(indexAxis = "x") {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis,
    plugins: {
      legend: { labels: { color: "#172033", boxWidth: 14, boxHeight: 10 } },
      tooltip: {
        backgroundColor: "rgba(255,255,255,0.96)",
        titleColor: "#172033",
        bodyColor: "#172033",
        borderColor: "#e4eaf2",
        borderWidth: 1
      }
    },
    scales: {
      x: { stacked: indexAxis === "x", ticks: { color: "#172033" }, grid: { color: "#edf2f7" } },
      y: { stacked: indexAxis === "x", beginAtZero: true, ticks: { color: "#172033", precision: 0 }, grid: { color: "#edf2f7" } }
    }
  };
}

function renderCharts(locations) {
  destroyCharts();

  const passFailLocations = locations.slice().sort((a, b) => approvalRate(b) - approvalRate(a));
  const valueLabelsPlugin = {
    id: "approvalComparisonValueLabels",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        if (datasetIndex === 4) return;
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;

        meta.data.forEach((element, index) => {
          const value = Number(dataset.data[index]);
          if (!Number.isFinite(value)) return;
          const props = element.getProps(["x", "y", "height"], true);
          const isScoreLine = dataset.type === "line";
          
          if (isScoreLine) {
            // Para líneas, mantener etiqueta arriba (sin %)
            const y = Math.max(16, props.y - 14);
            ctx.font = "900 13px Inter, Arial, sans-serif";
            ctx.fillStyle = "#1d4ed8";
            ctx.fillText(`${value.toFixed(1)}`, props.x, y);
          } else {
            // Para barras, colocar dentro
            ctx.font = "800 11px Inter, Arial, sans-serif";
            ctx.fillStyle = "#000000";
            ctx.fillText(`${value.toFixed(1)}%`, props.x, props.y + props.height / 2);
          }
        });
      });

      const targetY = scales.y.getPixelForValue(QUALITY_TARGET);
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.font = "900 12px Inter, Arial, sans-serif";
      ctx.fillStyle = "#111827";
      ctx.fillText("Pts 85", chartArea.right - 4, targetY - 6);

      ctx.restore();
    }
  };

  charts.push(
    new Chart(document.getElementById("passFailChart"), {
      type: "bar",
      data: {
        labels: passFailLocations.map((x) => titleCase(x.location)),
        datasets: [
          {
            label: "PASS %",
            data: passFailLocations.map((x) => approvalRate(x)),
            backgroundColor: "#16a34a",
            borderRadius: 0,
            maxBarThickness: 34,
            pointStyle: "rectRounded"
          },
          {
            label: "FAIL %",
            data: passFailLocations.map((x) =>
              percentage(Number(x.fail_count ?? 0), Number(x.total_pizzas ?? x.categorySummary?.total ?? 0))
            ),
            backgroundColor: "#dc2626",
            borderRadius: 0,
            maxBarThickness: 34,
            pointStyle: "rectRounded"
          },
          {
            type: "line",
            label: "Score promedio aprobadas",
            data: passFailLocations.map((x) => Number.isFinite(Number(x.passScoreAverage)) ? Number(x.passScoreAverage) : null),
            borderColor: "#2563eb",
            backgroundColor: "#2563eb",
            borderWidth: 5,
            fill: false,
            pointRadius: 5,
            pointHoverRadius: 9,
            pointStyle: "circle",
            tension: 0.15,
            yAxisId: "right"
          },
          {
            type: "line",
            label: "Score promedio rechazadas",
            data: passFailLocations.map((x) => Number.isFinite(Number(x.failScoreAverage)) ? Number(x.failScoreAverage) : null),
            borderColor: "#dc2626",
            backgroundColor: "#dc2626",
            borderWidth: 5,
            fill: false,
            pointRadius: 5,
            pointHoverRadius: 9,
            pointStyle: "circle",
            tension: 0.15,
            yAxisId: "right"
          },
          {
            type: "line",
            label: "Pts 85",
            data: passFailLocations.map(() => QUALITY_TARGET),
            borderColor: "#111827",
            borderDash: [9, 5],
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointStyle: "line",
            tension: 0
          }
        ]
      },
      options: {
        ...commonOptions("x"),
        plugins: {
          ...commonOptions("x").plugins,
          legend: {
            position: "top",
            align: "start",
            labels: {
              color: "#172033",
              boxWidth: 14,
              boxHeight: 9,
              usePointStyle: true
            }
          },
          tooltip: {
            ...commonOptions("x").plugins.tooltip,
            callbacks: {
              title(items) {
                return items[0]?.label || "";
              },
              label() {
                return "";
              },
              afterBody(items) {
                const loc = passFailLocations[items[0]?.dataIndex ?? 0];
                if (!loc) return [];
                const total = Number(loc.total_pizzas ?? loc.categorySummary?.total ?? 0);
                const pass = Number(loc.pass_count ?? 0);
                const fail = Number(loc.fail_count ?? 0);
                const passPct = approvalRate(loc);
                const failPct = percentage(fail, total);
                const passScore = Number(loc.passScoreAverage);

                const failScore = Number(loc.failScoreAverage);
                return [
                  `Total analizadas: ${total}`,
                  `PASS: ${pass}`,
                  `FAIL: ${fail}`,
                  `% aprobacion: ${passPct.toFixed(1)}%`,
                  `% fallidas: ${failPct.toFixed(1)}%`,
                  `Score promedio aprobacion: ${Number.isFinite(passScore) ? passScore.toFixed(1) : "N/A"}`,
                  `Score promedio rechazo: ${Number.isFinite(failScore) ? failScore.toFixed(1) : "N/A"}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: "#172033", font: { weight: "700" } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: "#172033", stepSize: 20, callback: (value) => `${value}%` },
            grid: { color: "#edf2f7" },
            position: "left"
          },
          right: {
            beginAtZero: true,
            max: 100,
            ticks: { color: "#172033", stepSize: 20 },
            grid: { display: false },
            position: "right"
          }
        }
      },
      plugins: [valueLabelsPlugin]
    })
  );
}

function renderIncidentMatrix(locations) {
  const container = document.getElementById("incidentMatrix");
  const rows = locations.map((loc) => {
    const cells = INCIDENT_CATEGORIES.map((cat) => {
      const value = Number(loc.categorySummary?.metrics?.[cat.key] || 0);
      const total = Number(loc.total_pizzas ?? loc.categorySummary?.total ?? 0);
      const pct = percentage(value, total);
      return `
        <div aria-label="${cat.label}: ${pct.toFixed(1)}% (${value} de ${total})">
          <span class="incident-value">${pct.toFixed(1)}%</span>
        </div>
      `;
    }).join("");

    return `
      <div class="incident-row">
        <div class="incident-store">${titleCase(loc.location)}</div>
        ${cells}
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="incident-table">
      <div class="incident-row incident-head">
        <div>Tienda</div>
        ${INCIDENT_CATEGORIES.map((cat) => `<div>${cat.label}</div>`).join("")}
      </div>
      ${rows}
    </div>
  `;
}

function renderScoresChart(locations) {
  const canvas = document.getElementById("scoresChart");
  if (!canvas) return;
  const scoresLocations = locations.slice().sort((a, b) => approvalRate(b) - approvalRate(a));
  
  const scoresValueLabelsPlugin = {
    id: "scoresValueLabels",
    afterDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      chart.data.datasets.forEach((dataset, datasetIndex) => {
        if (datasetIndex === 2) return; // Skip meta 85% line
        const meta = chart.getDatasetMeta(datasetIndex);
        if (meta.hidden) return;

        meta.data.forEach((element, index) => {
          const value = Number(dataset.data[index]);
          if (!Number.isFinite(value)) return;
          const props = element.getProps(["x", "y"], true);
          
          ctx.font = "900 11px Inter, Arial, sans-serif";
          ctx.fillStyle = dataset.borderColor === "#2563eb" ? "#1d4ed8" : "#991b1b";
          ctx.fillText(`${value.toFixed(1)}`, props.x, props.y - 12);
        });
      });

      const targetY = scales.y.getPixelForValue(QUALITY_TARGET);
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.font = "900 12px Inter, Arial, sans-serif";
      ctx.fillStyle = "#111827";
      ctx.fillText("Pts 85", chartArea.right - 4, targetY - 6);

      ctx.restore();
    }
  };

  charts.push(
    new Chart(canvas, {
      type: "line",
      data: {
        labels: scoresLocations.map((x) => titleCase(x.location)),
        datasets: [
          {
            label: "Score PASS",
            data: scoresLocations.map((x) => Number.isFinite(Number(x.passScoreAverage)) ? Number(x.passScoreAverage) : null),
            borderColor: "#2563eb",
            backgroundColor: "#2563eb",
            borderWidth: 4,
            fill: false,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointStyle: "circle",
            tension: 0.3
          },
          {
            label: "Score FAIL",
            data: scoresLocations.map((x) => Number.isFinite(Number(x.failScoreAverage)) ? Number(x.failScoreAverage) : null),
            borderColor: "#dc2626",
            backgroundColor: "#dc2626",
            borderWidth: 4,
            fill: false,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointStyle: "circle",
            tension: 0.3
          },
          {
            label: "Pts 85",
            data: scoresLocations.map(() => QUALITY_TARGET),
            borderColor: "#111827",
            borderDash: [9, 5],
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 0,
            pointStyle: "line",
            tension: 0
          }
        ]
      },
      options: {
        ...commonOptions("x"),
        plugins: {
          ...commonOptions("x").plugins,
          legend: {
            position: "top",
            align: "start",
            labels: {
              color: "#172033",
              boxWidth: 14,
              boxHeight: 9,
              usePointStyle: true
            }
          },
          tooltip: {
            ...commonOptions("x").plugins.tooltip,
            callbacks: {
              title(items) {
                return items[0]?.label || "";
              },
              label(context) {
                if (context.datasetIndex === 2) return "";
                const label = context.dataset.label || "";
                const value = Number.isFinite(context.parsed.y) ? context.parsed.y.toFixed(1) : "N/A";
                return `${label}: ${value}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: "#172033", font: { weight: "700" } },
            grid: { display: false }
          },
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { color: "#172033", stepSize: 20, callback: (value) => `${value}%` },
            grid: { color: "#edf2f7" }
          }
        }
      },
      plugins: [scoresValueLabelsPlugin]
    })
  );
}

async function main() {
  const [summary, locationPayload] = await Promise.all([
    fetchJson("./json/district_summary.json"),
    fetchJson("./json/district_locations.json")
  ]);

  const locations = (locationPayload.locations || [])
    .slice()
    .sort((a, b) => locationScore(b) - locationScore(a));
  const enrichedLocations = await enrichLocations(locations);

  renderHeader(summary);
  renderSummary(summary, enrichedLocations);
  renderPriorityRanking(enrichedLocations);
  renderLocationCards(enrichedLocations);
  renderInsights(enrichedLocations);
  renderCharts(enrichedLocations);
  renderScoresChart(enrichedLocations);
  renderIncidentMatrix(enrichedLocations);
}

main().catch((err) => {
  console.error(err);
  alert(`Error cargando dashboard distrital: ${err.message}`);
});
