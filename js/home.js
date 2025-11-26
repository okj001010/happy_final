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
const taskTalk = document.querySelector("#task-talk");
const taskJournal = document.querySelector("#task-journal");
const taskHrv = document.querySelector("#task-hrv");
const statusTalk = document.querySelector("#status-talk");
const statusJournal = document.querySelector("#status-journal");
const statusHrv = document.querySelector("#status-hrv");
const weeklyCard = document.querySelector("#weekly-card");
const weeklyBadge = document.querySelector("#weekly-badge");

let hasWearable = true;

logoutBtn.addEventListener("click", async () => {
  showLoading();
  await logout();
  window.location.href = "login.html";
});

// 태스크 클릭 - 순서: talk -> journal -> hrv
taskTalk.addEventListener("click", () => {
  window.location.href = "talk.html";
});

taskJournal.addEventListener("click", () => {
  window.location.href = "journal.html";
});

taskHrv.addEventListener("click", () => {
  window.location.href = "hrv.html";
});

weeklyCard.addEventListener("click", () => {
  window.location.href = "weekly.html";
});

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
  if (status.talk) completed++;
  if (status.journal) completed++;
  if (hasWearable && status.hrv) completed++;

  progressCount.textContent = `${completed}/${total}`;
  progressFill.style.width = `${(completed / total) * 100}%`;

  if (completed === total) {
    completeMessage.classList.remove("hidden");
  } else {
    completeMessage.classList.add("hidden");
  }
}

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

async function initialize() {
  showLoading();

  try {
    const user = await requireAuth("login.html");

    userName.textContent = user.displayName || user.email || "사용자";
    if (user.photoURL) {
      userPhoto.src = user.photoURL;
      userPhoto.classList.remove("hidden");
    }

    const settings = await getUserSettings();
    hasWearable = settings?.hasWearable !== false;

    if (hasWearable) {
      taskHrv.classList.remove("hidden");
    } else {
      taskHrv.classList.add("hidden");
    }

    const status = await getTodayStatus();
    updateTaskStatus(taskTalk, statusTalk, status.talk);
    updateTaskStatus(taskJournal, statusJournal, status.journal);
    if (hasWearable) {
      updateTaskStatus(taskHrv, statusHrv, status.hrv);
    }
    updateProgress(status);

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
