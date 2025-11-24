import {
  requireAuth, addDoc, getDocs, query, orderBy, limit, serverTimestamp,
  getUserJournalsCollection, getTodayStatus, invalidateTodayStatus,
  getFromCache, saveToCache, invalidateCache, getUserCacheKey,
  getTodayDateString, truncateText, showLoading, hideLoading,
  SENTIMENT_FUNCTION_URL,
} from "./config.js";

// DOM
const backBtn = document.querySelector("#back-btn");
const journalInput = document.querySelector("#journal-input");
const charCount = document.querySelector("#char-count");
const submitBtn = document.querySelector("#submit-btn");
const historyList = document.querySelector("#history-list");
const emotionModal = document.querySelector("#emotion-modal");
const emotionInput = document.querySelector("#emotion-input");
const skipEmotion = document.querySelector("#skip-emotion");
const saveEmotion = document.querySelector("#save-emotion");
const viewModal = document.querySelector("#view-modal");
const viewDate = document.querySelector("#view-date");
const viewContent = document.querySelector("#view-content");
const viewEmotionSection = document.querySelector("#view-emotion-section");
const viewEmotion = document.querySelector("#view-emotion");
const closeView = document.querySelector("#close-view");

let pendingContent = "";
let journalData = [];

// 뒤로가기
backBtn.addEventListener("click", () => window.location.href = "home.html");

// 글자수
journalInput.addEventListener("input", () => {
  const len = journalInput.value.length;
  charCount.textContent = len;
  if (len > 500) journalInput.value = journalInput.value.slice(0, 500);
});

// 저장 버튼
submitBtn.addEventListener("click", async () => {
  const content = journalInput.value.trim();
  if (!content) { alert("내용을 입력해주세요."); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = "분석 중...";

  try {
    const isPositive = await checkSentiment(content);
    
    if (isPositive) {
      pendingContent = content;
      emotionModal.classList.add("show");
    } else {
      await saveJournal(content, null, false);
    }
  } catch (e) {
    console.error(e);
    await saveJournal(content, null, false);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "저장하기";
  }
});

// 감정 분석
async function checkSentiment(text) {
  try {
    const res = await fetch(SENTIMENT_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    return data.sentiment?.toLowerCase().trim() === "positive";
  } catch (e) {
    return false;
  }
}

// 감정 모달
skipEmotion.addEventListener("click", async () => {
  emotionModal.classList.remove("show");
  await saveJournal(pendingContent, null, true);
});

saveEmotion.addEventListener("click", async () => {
  const emotion = emotionInput.value.trim();
  emotionModal.classList.remove("show");
  await saveJournal(pendingContent, emotion || null, true);
  emotionInput.value = "";
});

// 저장
async function saveJournal(content, emotion, isPositive) {
  showLoading();
  try {
    const col = getUserJournalsCollection();
    await addDoc(col, {
      content,
      emotion,
      isPositive,
      date: getTodayDateString(),
      timestamp: serverTimestamp(),
    });

    invalidateTodayStatus();
    invalidateCache(getUserCacheKey("journals"));

    journalInput.value = "";
    charCount.textContent = "0";
    pendingContent = "";

    // 다음 단계로
    const status = await getTodayStatus();
    if (!status.talk) {
      if (confirm("저장되었습니다! 긍정 자기대화를 작성하러 갈까요?")) {
        window.location.href = "talk.html";
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
  } finally {
    hideLoading();
  }
}

// 이전 기록 로드
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

  // 오늘 이미 작성했으면 버튼 비활성화
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
      ${item.emotion ? `<div class="history-emotion">💭 ${item.emotion}</div>` : ""}
    </div>
  `).join("");

  // 클릭 이벤트
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
  if (item.emotion) {
    viewEmotion.textContent = item.emotion;
    viewEmotionSection.classList.remove("hidden");
  } else {
    viewEmotionSection.classList.add("hidden");
  }
  viewModal.classList.add("show");
}

closeView.addEventListener("click", () => viewModal.classList.remove("show"));

// 초기화
async function init() {
  showLoading();
  await requireAuth("login.html");
  await loadHistory();
  hideLoading();
}

window.addEventListener("DOMContentLoaded", init);
