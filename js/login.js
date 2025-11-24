import { onAuthChange, loginWithGoogle, showLoading, hideLoading } from "./config.js";

const googleLoginBtn = document.querySelector("#google-login-btn");

// 이미 로그인되어 있으면 홈으로
onAuthChange(async (user) => {
  hideLoading();
  if (user) {
    window.location.href = "home.html";
  }
});

googleLoginBtn.addEventListener("click", async () => {
  try {
    showLoading();
    await loginWithGoogle();
    // 바로 홈으로 이동
    window.location.href = "home.html";
  } catch (error) {
    hideLoading();
    let message = "로그인 중 오류가 발생했습니다.";
    if (error.code === "auth/popup-closed-by-user") message = "로그인이 취소되었습니다.";
    else if (error.code === "auth/network-request-failed") message = "네트워크 연결을 확인해주세요.";
    alert(message);
  }
});
