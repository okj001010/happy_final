import {
  requireAuth, addDoc, getDocs, query, orderBy, limit, serverTimestamp,
  getUserHRVCollection, invalidateTodayStatus, updateUserSettings,
  getFromCache, saveToCache, invalidateCache, getUserCacheKey,
  getTodayDateString, showLoading, hideLoading,
} from "./config.js";

// DOM
const backBtn = document.querySelector("#back-btn");
const hrvInput = document.querySelector("#hrv-input");
const submitBtn = document.querySelector("#submit-btn");
const chartContainer = document.querySelector("#chart-container");
const disableHrvBtn = document.querySelector("#disable-hrv-btn");

let hrvData = [];

backBtn.addEventListener("click", () => window.location.href = "home.html");

// HRV 비활성화
disableHrvBtn.addEventListener("click", async () => {
  if (confirm("HRV 기록을 비활성화하시겠습니까?\n나중에 다시 활성화하려면 설정에서 변경할 수 있습니다.")) {
    try {
      showLoading();
      await updateUserSettings({ hasWearable: false });
      invalidateCache(getUserCacheKey("settings"));
      alert("HRV 기록이 비활성화되었습니다.");
      window.location.href = "home.html";
    } catch (e) {
      console.error(e);
      alert("설정 변경 중 오류가 발생했습니다.");
      hideLoading();
    }
  }
});

submitBtn.addEventListener("click", async () => {
  const hrv = parseInt(hrvInput.value);
  if (isNaN(hrv) || hrv < 0 || hrv > 200) {
    alert("올바른 HRV 값을 입력해주세요. (0-200)");
    return;
  }

  showLoading();
  try {
    const col = getUserHRVCollection();
    await addDoc(col, {
      hrv,
      date: getTodayDateString(),
      timestamp: serverTimestamp(),
    });

    invalidateTodayStatus();
    invalidateCache(getUserCacheKey("hrv"));

    alert("저장되었습니다!");
    window.location.href = "home.html";
  } catch (e) {
    console.error(e);
    alert("저장 중 오류가 발생했습니다.");
  } finally {
    hideLoading();
  }
});

async function loadHistory() {
  const cacheKey = getUserCacheKey("hrv");
  const cached = getFromCache(cacheKey);
  
  if (cached) {
    hrvData = cached;
    renderChart();
    return;
  }

  try {
    const col = getUserHRVCollection();
    const q = query(col, orderBy("timestamp", "desc"), limit(7));
    const snap = await getDocs(q);
    
    hrvData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveToCache(cacheKey, hrvData);
    renderChart();
  } catch (e) {
    console.error(e);
  }
}

function renderChart() {
  // 오늘 이미 기록했는지 확인
  const today = getTodayDateString();
  if (hrvData.length > 0 && hrvData[0]?.date === today) {
    submitBtn.disabled = true;
    submitBtn.textContent = "오늘 기록 완료 ✓";
    hrvInput.disabled = true;
  }

  if (hrvData.length === 0) {
    chartContainer.innerHTML = `
      <div class="empty-chart">
        <div class="icon">📊</div>
        <p>아직 기록이 없습니다.</p>
      </div>
    `;
    return;
  }

  // 데이터를 날짜순으로 정렬 (오래된 것 → 최신)
  const sortedData = [...hrvData].reverse();
  
  // 통계 계산
  const hrvValues = sortedData.map(d => d.hrv);
  const avgHrv = Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length);
  const minHrv = Math.min(...hrvValues);
  const maxHrv = Math.max(...hrvValues);

  // 차트 생성
  const chartHtml = createLineChart(sortedData);
  
  chartContainer.innerHTML = `
    <div class="chart-header">
      <span class="chart-title">HRV 추이</span>
      <span class="chart-period">최근 ${sortedData.length}일</span>
    </div>
    ${chartHtml}
    <div class="hrv-stats">
      <div class="hrv-stat">
        <div class="label">평균</div>
        <div class="value ${getHrvClass(avgHrv)}">${avgHrv}ms</div>
      </div>
      <div class="hrv-stat">
        <div class="label">최저</div>
        <div class="value ${getHrvClass(minHrv)}">${minHrv}ms</div>
      </div>
      <div class="hrv-stat">
        <div class="label">최고</div>
        <div class="value ${getHrvClass(maxHrv)}">${maxHrv}ms</div>
      </div>
    </div>
  `;
}

function createLineChart(data) {
  if (data.length === 0) return '';

  const height = 150;
  const padding = { top: 25, right: 15, bottom: 35, left: 15 };
  const chartWidth = 100 - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const hrvValues = data.map(d => d.hrv);
  const minVal = Math.max(0, Math.min(...hrvValues) - 15);
  const maxVal = Math.max(...hrvValues) + 15;
  const range = maxVal - minVal || 30;

  // 포인트 계산 - 데이터가 1개일 때 중앙에 배치
  const points = data.map((d, i) => {
    let x;
    if (data.length === 1) {
      x = 50; // 중앙에 배치
    } else {
      x = padding.left + (i / (data.length - 1)) * chartWidth;
    }
    const y = padding.top + (1 - (d.hrv - minVal) / range) * chartHeight;
    return { x, y, hrv: d.hrv, date: d.date };
  });

  // 그리드 라인 (3개)
  const gridLines = [0, 0.5, 1].map(ratio => {
    const y = padding.top + ratio * chartHeight;
    return `<line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${100 - padding.right}" y2="${y}"/>`;
  }).join('');

  let chartContent = '';
  
  if (data.length === 1) {
    // 데이터 1개: 점만 표시
    const p = points[0];
    chartContent = `
      <circle class="chart-point" cx="${p.x}" cy="${p.y}" r="6"/>
      <text class="chart-point-label" x="${p.x}" y="${p.y - 12}">${p.hrv}ms</text>
      <text class="chart-x-label" x="${p.x}" y="${height - 8}">${p.date}</text>
    `;
  } else {
    // 데이터 2개 이상: 라인 + 영역 + 점
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaPath = linePath + 
      ` L ${points[points.length - 1].x} ${height - padding.bottom}` +
      ` L ${points[0].x} ${height - padding.bottom} Z`;

    const pointsHtml = points.map((p) => `
      <circle class="chart-point" cx="${p.x}" cy="${p.y}" r="5"/>
      <text class="chart-point-label" x="${p.x}" y="${p.y - 10}">${p.hrv}</text>
      <text class="chart-x-label" x="${p.x}" y="${height - 8}">${p.date?.split('/')[1] || ''}일</text>
    `).join('');

    chartContent = `
      <path class="chart-area" d="${areaPath}"/>
      <path class="chart-line" d="${linePath}"/>
      ${pointsHtml}
    `;
  }

  return `
    <div class="line-chart">
      <svg viewBox="0 0 100 ${height}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#FF7043;stop-opacity:0.4"/>
            <stop offset="100%" style="stop-color:#FF7043;stop-opacity:0"/>
          </linearGradient>
        </defs>
        ${gridLines}
        ${chartContent}
      </svg>
    </div>
  `;
}

function getHrvClass(hrv) {
  if (hrv < 30) return "low";
  if (hrv < 60) return "normal";
  return "high";
}

async function init() {
  showLoading();
  await requireAuth("login.html");
  await loadHistory();
  hideLoading();
}

window.addEventListener("DOMContentLoaded", init);
