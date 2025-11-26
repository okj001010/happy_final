import {
  requireAuth, addDoc, getDocs, query, orderBy, limit, serverTimestamp,
  getUserJournalsCollection, getTodayStatus, invalidateTodayStatus,
  getUserSettings, getFromCache, saveToCache, invalidateCache, getUserCacheKey,
  getTodayDateString, truncateText, showLoading, hideLoading,
} from "./config.js";

// DOM
const backBtn = document.querySelector("#back-btn");
const journalInput = document.querySelector("#journal-input");
const charCount = document.querySelector("#char-count");
const minCharWarning = document.querySelector("#min-char-warning");
const submitBtn = document.querySelector("#submit-btn");
const historyList = document.querySelector("#history-list");
const viewModal = document.querySelector("#view-modal");
const viewDate = document.querySelector("#view-date");
const viewContent = document.querySelector("#view-content");
const closeView = document.querySelector("#close-view");

let journalData = [];
let hasWearable = true;

const MIN_CHARS = 30;

backBtn.addEventListener("click", () => window.location.href = "home.html");

journalInput.addEventListener("input", () => {
  const len = journalInput.value.length;
  charCount.textContent = len;
  
  // 최소 글자수 경고
  if (len > 0 && len < MIN_CHARS) {
    minCharWarning.classList.remove("hidden");
  } else {
    minCharWarning.classList.add("hidden");
  }
  
  if (len > 500) journalInput.value = journalInput.value.slice(0, 500);
});

submitBtn.addEventListener("click", async () => {
  const content = journalInput.value.trim();
  
  if (!content) {
    alert("내용을 입력해주세요.");
    return;
  }
  
  if (content.length < MIN_CHARS) {
    alert(`더 정확한 분석을 위해 ${MIN_CHARS}자 이상 작성해주세요. (현재: ${content.length}자)`);
    return;
  }

  // 감정 검사 없이 바로 저장
  await saveJournal(content);
});

async function saveJournal(content) {
  showLoading();
  submitBtn.disabled = true;
  
  try {
    const col = getUserJournalsCollection();
    await addDoc(col, {
      content,
      date: getTodayDateString(),
      timestamp: serverTimestamp(),
    });

    invalidateTodayStatus();
    invalidateCache(getUserCacheKey("journals"));

    journalInput.value = "";
    charCount.textContent = "0";
    minCharWarning.classList.add("hidden");

    // 다음 단계로
    const status = await getTodayStatus();
    if (hasWearable && !status.hrv) {
      if (confirm("저장되었습니다! HRV를 기록하러 갈까요?")) {
        window.location.href = "hrv.html";
      } else {
        window.location.href = "home.html";
      }
    } else {
      alert("저장되었습니다!");
      window.location.href = "home.html";
    }
  } catch (e) {
    console.error(e);
    alert("저장 중 오류가 발생했습니다.");
    submitBtn.disabled = false;
  } finally {
    hideLoading();
  }
}

async function loadHistory() {
  const cacheKey = getUserCacheKey("journals");
  const cached = getFromCache(cacheKey);
  
  if (cached) {
    journalData = cached;
    renderHistory();
    return;
  }

  try {
    const col = getUserJournalsCollection();
    const q = query(col, orderBy("timestamp", "desc"), limit(10));
    const snap = await getDocs(q);
    
    journalData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveToCache(cacheKey, journalData);
    renderHistory();
  } catch (e) {
    console.error(e);
  }
}

function renderHistory() {
  if (journalData.length === 0) {
    historyList.innerHTML = '<p style="color:rgba(255,255,255,0.7); text-align:center;">아직 기록이 없습니다.</p>';
    return;
  }

  const today = getTodayDateString();
  if (journalData[0]?.date === today) {
    submitBtn.disabled = true;
    submitBtn.textContent = "오늘 작성 완료 ✓";
    journalInput.disabled = true;
    journalInput.placeholder = "오늘의 감사 일기를 이미 작성했습니다.";
  }

  historyList.innerHTML = journalData.map((item, i) => `
    <div class="history-item" data-index="${i}">
      <div class="history-date">${item.date}</div>
      <div class="history-content">${truncateText(item.content, 80)}</div>
    </div>
  `).join("");

  historyList.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.index);
      showDetail(journalData[idx]);
    });
  });
}

function showDetail(item) {
  viewDate.textContent = item.date;
  viewContent.textContent = item.content;
  viewModal.classList.add("show");
}

closeView.addEventListener("click", () => viewModal.classList.remove("show"));

async function init() {
  showLoading();
  await requireAuth("login.html");
  const settings = await getUserSettings();
  hasWearable = settings?.hasWearable !== false;
  await loadHistory();
  hideLoading();
}

window.addEventListener("DOMContentLoaded", init);
