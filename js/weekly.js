import {
  requireAuth, getDocs, query, orderBy, limit,
  getUserSettings, getUserWeeklyReportsCollection,
  getFromCache, saveToCache, invalidateCache, getUserCacheKey,
  truncateText, showLoading, hideLoading,
} from "./config.js";

// DOM
const backBtn = document.querySelector("#back-btn");
const tabs = document.querySelectorAll(".tab");
const hrvTab = document.querySelector("#hrv-tab");
const contentArea = document.querySelector("#content-area");
const detailModal = document.querySelector("#detail-modal");
const detailTitle = document.querySelector("#detail-title");
const detailImage = document.querySelector("#detail-image");
const detailChartSection = document.querySelector("#detail-chart-section");
const detailChart = document.querySelector("#detail-chart");
const detailContent = document.querySelector("#detail-content");
const closeDetail = document.querySelector("#close-detail");

let currentType = "gratitude";
let hasWearable = true; // 기본값을 true로 설정
let reportsCache = {};

backBtn.addEventListener("click", () => window.location.href = "home.html");

// 탭 전환
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    // HRV 탭이 숨겨져 있으면 클릭 무시
    if (tab.classList.contains("hidden")) return;
    
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentType = tab.dataset.type;
    renderContent();
  });
});

closeDetail.addEventListener("click", () => detailModal.classList.remove("show"));

// 리포트 로드
async function loadReports(type) {
  if (reportsCache[type]) return reportsCache[type];

  const cacheKey = getUserCacheKey(`weekly_${type}`);
  const cached = getFromCache(cacheKey);
  if (cached) {
    reportsCache[type] = cached;
    return cached;
  }

  try {
    const col = getUserWeeklyReportsCollection(type);
    const q = query(col, orderBy("timestamp", "desc"), limit(20));
    const snap = await getDocs(q);
    
    const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    reportsCache[type] = data;
    saveToCache(cacheKey, data);
    
    // 읽음 처리
    if (data.length > 0) {
      const latestTs = data[0].timestamp?.toMillis?.() || Date.now();
      localStorage.setItem(`${type}_lastread`, String(latestTs));
      invalidateCache(getUserCacheKey(`unread_${type}`));
    }
    
    return data;
  } catch (e) {
    console.error(e);
    return [];
  }
}

// 콘텐츠 렌더링
async function renderContent() {
  showLoading();

  if (currentType === "hrv") {
    await renderHRVContent();
  } else {
    await renderReportsList();
  }

  hideLoading();
}

async function renderReportsList() {
  const reports = await loadReports(currentType);
  
  if (reports.length === 0) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <div class="icon">📭</div>
        <h3>아직 주간 요약이 없습니다</h3>
        <p>일주일 동안 기록을 작성하면 자동으로 주간 요약이 생성됩니다.</p>
      </div>
    `;
    return;
  }

  const iconClass = currentType === "gratitude" ? "gratitude" : "selftalk";
  
  contentArea.innerHTML = `
    <div class="report-list">
      ${reports.map((r, i) => `
        <div class="report-item" data-index="${i}">
          <div class="report-icon ${iconClass}">
            ${currentType === "gratitude" ? "📝" : "💪"}
          </div>
          <div class="report-info">
            <div class="report-week">${r.date || `${r.year}년 ${r.week}주차`}</div>
            <div class="report-preview">${truncateText(r.content, 50)}</div>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  // 클릭 이벤트
  contentArea.querySelectorAll(".report-item").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.index);
      showDetail(reports[idx], currentType);
    });
  });
}

function showDetail(report, type) {
  detailTitle.textContent = report.date || `${report.year}년 ${report.week}주차`;
  detailContent.textContent = report.content;
  
  // 이미지 처리
  if (report.image) {
    detailImage.src = report.image;
    detailImage.classList.remove("hidden");
  } else {
    detailImage.classList.add("hidden");
  }
  
  // 일반 리포트는 차트 숨김
  detailChartSection.classList.add("hidden");
  
  detailModal.classList.add("show");
}

// HRV 상세 모달 (차트 포함)
function showHRVDetail(report) {
  detailTitle.textContent = report.date || `${report.year}년 ${report.week}주차`;
  detailContent.textContent = report.content;
  
  // 이미지 숨김
  detailImage.classList.add("hidden");
  
  // HRV 차트 표시
  if (report.hrvData && report.hrvData.length > 0) {
    detailChartSection.classList.remove("hidden");
    
    // 통계 계산
    const hrvValues = report.hrvData.map(d => d.hrv);
    const avgHrv = report.avgHrv || Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length);
    const minHrv = report.minHrv || Math.min(...hrvValues);
    const maxHrv = report.maxHrv || Math.max(...hrvValues);
    
    // 경고 메시지
    let warningHtml = "";
    if (avgHrv < 25) {
      warningHtml = `
        <div class="warning-box danger" style="margin-bottom:15px;">
          <div class="icon">⚠️</div>
          <h4>주의가 필요합니다</h4>
          <p>평균 HRV가 매우 낮습니다. 전문가 상담을 권장합니다.</p>
        </div>
      `;
    } else if (avgHrv < 35) {
      warningHtml = `
        <div class="warning-box" style="margin-bottom:15px;">
          <div class="icon">💡</div>
          <h4>관리가 필요해요</h4>
          <p>HRV가 다소 낮은 편입니다.</p>
        </div>
      `;
    }
    
    detailChart.innerHTML = `
      ${warningHtml}
      ${createLineChart(report.hrvData)}
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
  } else {
    detailChartSection.classList.add("hidden");
  }
  
  detailModal.classList.add("show");
}

// 꺾은선 차트 생성 함수
function createLineChart(data) {
  if (!data || data.length === 0) return '<p style="text-align:center;color:#888;">데이터가 없습니다</p>';

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

  // 그리드 라인
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
          <linearGradient id="chartGradientModal" x1="0%" y1="0%" x2="0%" y2="100%">
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

// HRV 콘텐츠 렌더링 - 다른 탭과 동일한 리스트 형태로 변경
async function renderHRVContent() {
  const hrvReports = await loadReports("hrv");

  if (hrvReports.length === 0) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <div class="icon">❤️</div>
        <h3>아직 주간 요약이 없습니다</h3>
        <p>일주일 동안 HRV를 기록하면 자동으로 주간 요약이 생성됩니다.</p>
      </div>
    `;
    return;
  }

  contentArea.innerHTML = `
    <div class="report-list">
      ${hrvReports.map((r, i) => `
        <div class="report-item hrv-report" data-index="${i}">
          <div class="report-icon hrv">❤️</div>
          <div class="report-info">
            <div class="report-week">${r.date || `${r.year}년 ${r.week}주차`}</div>
            <div class="report-preview">${truncateText(r.content, 50)}</div>
            ${r.avgHrv ? `<div class="report-stats">평균 HRV: ${r.avgHrv}ms</div>` : ''}
          </div>
        </div>
      `).join("")}
    </div>
  `;

  // HRV 리포트 클릭 이벤트
  contentArea.querySelectorAll(".hrv-report").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.index);
      showHRVDetail(hrvReports[idx]);
    });
  });
}

// 초기화
async function init() {
  showLoading();
  await requireAuth("login.html");
  
  const settings = await getUserSettings();
  // hasWearable이 명시적으로 false인 경우에만 HRV 탭 숨김
  hasWearable = settings?.hasWearable !== false;
  
  if (!hasWearable) {
    hrvTab.classList.add("hidden");
  } else {
    hrvTab.classList.remove("hidden");
  }
  
  await renderContent();
  hideLoading();
}

window.addEventListener("DOMContentLoaded", init);
