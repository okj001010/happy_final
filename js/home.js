import {
  requireAuth, logout, getCurrentUser, getUserSettings,
  getTodayStatus, getUserWeeklyReportsCollection,
  query, orderBy, limit, getDocs,
  getFromCache, saveToCache, getUserCacheKey,
  showLoading, hideLoading,
} from "./config.js";

// DOM
const userPhoto = document.querySelector("#user-photo");
const userName = document.querySelector("#user-name");
const logoutBtn = document.querySelector("#logout-btn");
const progressCount = document.querySelector("#progress-count");
const progressFill = document.querySelector("#progress-fill");
const completeMessage = document.querySelector("#complete-message");
const taskJournal = document.querySelector("#task-journal");
const taskTalk = document.querySelector("#task-talk");
const taskHrv = document.querySelector("#task-hrv");
const statusJournal = document.querySelector("#status-journal");
const statusTalk = document.querySelector("#status-talk");
const statusHrv = document.querySelector("#status-hrv");
const weeklyCard = document.querySelector("#weekly-card");
const weeklyBadge = document.querySelector("#weekly-badge");

let hasWearable = true; // 기본값 true

// 로그아웃
logoutBtn.addEventListener("click", async () => {
  showLoading();
  await logout();
  window.location.href = "login.html";
});

// 태스크 클릭 - 완료 여부와 관계없이 항상 이동 가능
taskJournal.addEventListener("click", () => {
  window.location.href = "journal.html";
});

taskTalk.addEventListener("click", () => {
  window.location.href = "talk.html";
});

taskHrv.addEventListener("click", () => {
  window.location.href = "hrv.html";
});

weeklyCard.addEventListener("click", () => {
  window.location.href = "weekly.html";
});

// 상태 업데이트
function updateTaskStatus(element, statusEl, completed) {
  if (completed) {
    element.classList.add("completed");
    statusEl.classList.remove("pending");
    statusEl.classList.add("done");
    statusEl.textContent = "✓";
  } else {
    element.classList.remove("completed");
    statusEl.classList.add("pending");
    statusEl.classList.remove("done");
    statusEl.textContent = "";
  }
}

function updateProgress(status) {
  const total = hasWearable ? 3 : 2;
  let completed = 0;
  if (status.journal) completed++;
  if (status.talk) completed++;
  if (hasWearable && status.hrv) completed++;

  progressCount.textContent = `${completed}/${total}`;
  progressFill.style.width = `${(completed / total) * 100}%`;

  if (completed === total) {
    completeMessage.classList.remove("hidden");
  } else {
    completeMessage.classList.add("hidden");
  }
}

// 안 읽은 주간 보고서 수
async function getUnreadWeeklyCount() {
  const types = hasWearable ? ["gratitude", "selftalk", "hrv"] : ["gratitude", "selftalk"];
  let total = 0;

  for (const type of types) {
    const cacheKey = getUserCacheKey(`unread_${type}`);
    const cached = getFromCache(cacheKey);
    if (cached !== null) {
      total += cached;
      continue;
    }

    try {
      const col = getUserWeeklyReportsCollection(type);
      const q = query(col, orderBy("timestamp", "desc"), limit(10));
      const snapshot = await getDocs(q);

      const lastReadKey = `${type}_lastread`;
      const lastReadTime = Number(localStorage.getItem(lastReadKey) || 0);

      let count = 0;
      for (const doc of snapshot.docs) {
        const ts = doc.data().timestamp?.toMillis();
        if (ts && ts > lastReadTime) count++;
        else break;
      }

      saveToCache(cacheKey, count);
      total += count;
    } catch (e) {
      console.error(e);
    }
  }

  return total;
}

// 초기화
async function initialize() {
  showLoading();

  try {
    const user = await requireAuth("login.html");

    // 사용자 정보 표시
    userName.textContent = user.displayName || user.email || "사용자";
    if (user.photoURL) {
      userPhoto.src = user.photoURL;
      userPhoto.classList.remove("hidden");
    }

    // 설정 확인 - hasWearable이 명시적으로 false인 경우에만 HRV 숨김
    const settings = await getUserSettings();
    hasWearable = settings?.hasWearable !== false;

    // HRV 태스크 표시 여부
    if (hasWearable) {
      taskHrv.classList.remove("hidden");
    } else {
      taskHrv.classList.add("hidden");
    }

    // 오늘 상태
    const status = await getTodayStatus();
    updateTaskStatus(taskJournal, statusJournal, status.journal);
    updateTaskStatus(taskTalk, statusTalk, status.talk);
    if (hasWearable) {
      updateTaskStatus(taskHrv, statusHrv, status.hrv);
    }
    updateProgress(status);

    // 주간 보고서 뱃지
    const unreadCount = await getUnreadWeeklyCount();
    if (unreadCount > 0) {
      weeklyBadge.textContent = unreadCount;
      weeklyBadge.classList.remove("hidden");
    }

  } catch (error) {
    console.error("Init error:", error);
  } finally {
    hideLoading();
  }
}

window.addEventListener("DOMContentLoaded", initialize);
