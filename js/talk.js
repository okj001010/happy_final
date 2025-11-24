import {
  requireAuth, addDoc, getDocs, query, orderBy, limit, serverTimestamp,
  getUserTalksCollection, getUserSettings, getTodayStatus, invalidateTodayStatus,
  getFromCache, saveToCache, invalidateCache, getUserCacheKey,
  getTodayDateString, truncateText, showLoading, hideLoading,
  SENTIMENT_FUNCTION_URL,
} from "./config.js";

// DOM
const backBtn = document.querySelector("#back-btn");
const talkInput = document.querySelector("#talk-input");
const charCount = document.querySelector("#char-count");
const submitBtn = document.querySelector("#submit-btn");
const feedback = document.querySelector("#feedback");
const attemptCountDiv = document.querySelector("#attempt-count");
const attemptsSpan = document.querySelector("#attempts");
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

let attempts = [];
let talkData = [];
let hasWearable = true;

backBtn.addEventListener("click", () => window.location.href = "home.html");

talkInput.addEventListener("input", () => {
  const len = talkInput.value.length;
  charCount.textContent = len;
  if (len > 500) talkInput.value = talkInput.value.slice(0, 500);
});

submitBtn.addEventListener("click", async () => {
  const content = talkInput.value.trim();
  if (!content) { alert("내용을 입력해주세요."); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = "분석 중...";

  try {
    const isPositive = await checkSentiment(content);
    attempts.push(content);
    
    if (isPositive) {
      feedback.classList.add("hidden");
      emotionModal.classList.add("show");
    } else {
      feedback.classList.remove("hidden");
      attemptCountDiv.classList.remove("hidden");
      attemptsSpan.textContent = attempts.length;
      talkInput.value = "";
    }
  } catch (e) {
    console.error(e);
    attempts.push(content);
    emotionModal.classList.add("show");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "저장하기";
  }
});

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
    return true; // 오류 시 긍정으로 처리
  }
}

skipEmotion.addEventListener("click", async () => {
  emotionModal.classList.remove("show");
  await saveTalk(null);
});

saveEmotion.addEventListener("click", async () => {
  const emotion = emotionInput.value.trim();
  emotionModal.classList.remove("show");
  await saveTalk(emotion || null);
  emotionInput.value = "";
});

async function saveTalk(emotion) {
  showLoading();
  try {
    const col = getUserTalksCollection();
    
    // 여러 시도가 있으면 형식화
    let content;
    if (attempts.length === 1) {
      content = attempts[0];
    } else {
      content = attempts.map((t, i) => `#${i + 1}회 시도:\n${t}`).join("\n\n");
    }

    await addDoc(col, {
      content,
      emotion,
      isPositive: true,
      attemptCount: attempts.length,
      date: getTodayDateString(),
      timestamp: serverTimestamp(),
    });

    invalidateTodayStatus();
    invalidateCache(getUserCacheKey("talks"));

    talkInput.value = "";
    charCount.textContent = "0";
    attempts = [];
    feedback.classList.add("hidden");
    attemptCountDiv.classList.add("hidden");

    // 다음 단계
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
  } finally {
    hideLoading();
  }
}

async function loadHistory() {
  const cacheKey = getUserCacheKey("talks");
  const cached = getFromCache(cacheKey);
  
  if (cached) {
    talkData = cached;
    renderHistory();
    return;
  }

  try {
    const col = getUserTalksCollection();
    const q = query(col, orderBy("timestamp", "desc"), limit(10));
    const snap = await getDocs(q);
    
    talkData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveToCache(cacheKey, talkData);
    renderHistory();
  } catch (e) {
    console.error(e);
  }
}

function renderHistory() {
  if (talkData.length === 0) {
    historyList.innerHTML = '<p style="color:rgba(255,255,255,0.7); text-align:center;">아직 기록이 없습니다.</p>';
    return;
  }

  const today = getTodayDateString();
  if (talkData[0]?.date === today) {
    submitBtn.disabled = true;
    submitBtn.textContent = "오늘 작성 완료 ✓";
    talkInput.disabled = true;
    talkInput.placeholder = "오늘의 긍정 자기대화를 이미 작성했습니다.";
  }

  historyList.innerHTML = talkData.map((item, i) => `
    <div class="history-item" data-index="${i}">
      <div class="history-date">${item.date}</div>
      <div class="history-content">${truncateText(item.content, 80)}</div>
      ${item.emotion ? `<div class="history-emotion">💭 ${item.emotion}</div>` : ""}
      ${item.attemptCount > 1 ? `<div class="history-attempts">📝 ${item.attemptCount}회 시도</div>` : ""}
    </div>
  `).join("");

  historyList.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.index);
      showDetail(talkData[idx]);
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

async function init() {
  showLoading();
  await requireAuth("login.html");
  const settings = await getUserSettings();
  hasWearable = settings?.hasWearable !== false;
  await loadHistory();
  hideLoading();
}

window.addEventListener("DOMContentLoaded", init);
