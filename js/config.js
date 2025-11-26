// ========================================
// Firebase 공통 설정 파일
// ========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js";

// ========================================
// Firebase 설정 (이 부분만 수정)
// ========================================
const firebaseConfig = {
  apiKey: "AIzaSyBzS_fJY5BPmEHPSanHDW6ToVkpE5n2Py0",
  authDomain: "happy-f0aed.firebaseapp.com",
  projectId: "happy-f0aed",
  storageBucket: "happy-f0aed.firebasestorage.app",
  messagingSenderId: "76329884374",
  appId: "1:76329884374:web:2f6bcd1d3985b748ac4777"
};

const SENTIMENT_FUNCTION_URL =
  "https://classifysentiment-mthnp5nqyq-uc.a.run.app";

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// ========================================
// 캐시 유틸리티
// ========================================
const CACHE_KEY = "happy_cache";
const CACHE_DURATION = 2 * 60 * 1000;

function getFromCache(key) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    const item = cache[key];
    if (item && Date.now() - item.timestamp < CACHE_DURATION) return item.data;
  } catch (e) {}
  return null;
}

function saveToCache(key, data) {
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    cache[key] = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {}
}

function invalidateCache(key) {
  try {
    if (!key) {
      localStorage.removeItem(CACHE_KEY);
      return;
    }
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    delete cache[key];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {}
}

function getUserCacheKey(baseKey) {
  const user = auth.currentUser;
  return user ? `${user.uid}_${baseKey}` : baseKey;
}

// ========================================
// 인증 함수
// ========================================
function getCurrentUser() {
  return auth.currentUser;
}
function getCurrentUserId() {
  return auth.currentUser?.uid || null;
}

async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  const userDocRef = doc(db, "users", user.uid);
  const userDoc = await getDoc(userDocRef);

  if (!userDoc.exists()) {
    await setDoc(userDocRef, {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      hasWearable: null,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    });
    return { user, isNewUser: true };
  } else {
    await updateDoc(userDocRef, { lastLogin: serverTimestamp() });
    return { user, isNewUser: false, userData: userDoc.data() };
  }
}

async function logout() {
  invalidateCache();
  await signOut(auth);
}

function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

function requireAuth(redirectUrl = "login.html") {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) window.location.href = redirectUrl;
      else resolve(user);
    });
  });
}

// ========================================
// 사용자 설정
// ========================================
async function getUserSettings() {
  const userId = getCurrentUserId();
  if (!userId) return null;

  const cacheKey = getUserCacheKey("settings");
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const userDoc = await getDoc(doc(db, "users", userId));
  if (userDoc.exists()) {
    const data = userDoc.data();
    saveToCache(cacheKey, data);
    return data;
  }
  return null;
}

async function updateUserSettings(settings) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("로그인 필요");
  await setDoc(doc(db, "users", userId), settings, { merge: true });
  invalidateCache(getUserCacheKey("settings"));
}

// ========================================
// 컬렉션 참조
// ========================================
function getUserCollection(name) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error("로그인 필요");
  return collection(db, "users", userId, name);
}

function getUserJournalsCollection() {
  return getUserCollection("journals");
}
function getUserTalksCollection() {
  return getUserCollection("talks");
}
function getUserHRVCollection() {
  return getUserCollection("hrv");
}

function getUserWeeklyReportsCollection(type) {
  const names = {
    gratitude: "weekly-reports-gratitude",
    selftalk: "weekly-reports-selftalk",
    hrv: "weekly-reports-hrv",
  };
  return getUserCollection(names[type] || names.gratitude);
}

// ========================================
// 오늘 완료 상태
// ========================================
async function getTodayStatus() {
  const userId = getCurrentUserId();
  if (!userId) return { journal: false, talk: false, hrv: false };

  const today = getTodayDateString();
  const cacheKey = getUserCacheKey(`status_${today}`);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const [journals, talks, hrvs] = await Promise.all([
    getDocs(
      query(getUserJournalsCollection(), orderBy("timestamp", "desc"), limit(1))
    ),
    getDocs(
      query(getUserTalksCollection(), orderBy("timestamp", "desc"), limit(1))
    ),
    getDocs(
      query(getUserHRVCollection(), orderBy("timestamp", "desc"), limit(1))
    ),
  ]);

  const status = {
    journal: !journals.empty && journals.docs[0].data().date === today,
    talk: !talks.empty && talks.docs[0].data().date === today,
    hrv: !hrvs.empty && hrvs.docs[0].data().date === today,
  };

  saveToCache(cacheKey, status);
  return status;
}

function invalidateTodayStatus() {
  const today = getTodayDateString();
  invalidateCache(getUserCacheKey(`status_${today}`));
}

// ========================================
// 유틸리티
// ========================================
function getTodayDateString() {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function truncateText(text, maxLength = 100) {
  if (!text) return "내용 없음";
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

function showLoading() {
  const el = document.querySelector("#loading-overlay");
  if (el) el.classList.remove("hidden");
}

function hideLoading() {
  const el = document.querySelector("#loading-overlay");
  if (el) el.classList.add("hidden");
}

// ========================================
// Export
// ========================================
export {
  app,
  db,
  auth,
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  getCurrentUser,
  getCurrentUserId,
  loginWithGoogle,
  logout,
  onAuthChange,
  requireAuth,
  getUserSettings,
  updateUserSettings,
  getUserJournalsCollection,
  getUserTalksCollection,
  getUserHRVCollection,
  getUserWeeklyReportsCollection,
  getTodayStatus,
  invalidateTodayStatus,
  getFromCache,
  saveToCache,
  invalidateCache,
  getUserCacheKey,
  getTodayDateString,
  truncateText,
  showLoading,
  hideLoading,
  SENTIMENT_FUNCTION_URL,
};
