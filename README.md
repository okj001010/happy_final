# HAPPY - 감사 일기 & 긍정적 자기 소통 앱

매일의 감사와 긍정을 기록하여 더 건강하고 행복한 하루를 만드는 웹 앱

## 주요 기능

- 💪 **긍정적 자기 소통**: 긍정적인 말로 자신을 격려
- 📝 **감사 일기**: 매일 감사한 일을 기록
- ❤️ **HRV 기록**: 웨어러블 기기의 심박변이도 기록
- 📊 **주간 요약**: AI가 생성하는 주간 리포트

---

### Step 1: Firebase 프로젝트 설정

1. [Firebase Console](https://console.firebase.google.com/)에서 새 프로젝트 생성

2. **Authentication 설정**

   - Firebase Console → Authentication → Sign-in method
   - Google 로그인 활성화

3. **Firestore 설정**

   - Firebase Console → Firestore Database → 데이터베이스 만들기
   - "프로덕션 모드"로 시작
   - 위치 선택 (asia-northeast3 권장 - 서울)

4. **Firebase 설정값 복사**
   - Firebase Console → 프로젝트 설정 → 일반 → 내 앱
   - "웹 앱 추가" 클릭
   - 설정값(firebaseConfig) 복사

---

### Step 2: 코드 수정 ⚠️ 중요

#### 2-1. Firebase 설정 변경

`js/config.js` 파일에서 `firebaseConfig`를 본인의 Firebase 프로젝트 설정으로 변경:

```javascript
// js/config.js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

#### 2-2. Cloud Functions URL 변경

감정 분석 API URL을 배포 후 받은 URL로 변경:

```javascript
// js/config.js
const SENTIMENT_FUNCTION_URL =
  "https://YOUR_REGION-YOUR_PROJECT_ID.cloudfunctions.net/classifySentiment"; // ← 배포 후 변경
```

> ⚠️ 이 URL은 Cloud Functions 배포 후에 확인할 수 있음. 먼저 임시로 두고, Functions 배포 후 수정.

#### 2-3. .firebaserc 변경

`.firebaserc` 파일에서 프로젝트 ID 변경:

```json
{
  "projects": {
    "default": "YOUR_PROJECT_ID" // ← 변경
  }
}
```

---

### Step 3: OpenAI API 키 설정

Cloud Functions에서 GPT를 사용하므로 OpenAI API 키가 필요:

1. [OpenAI API](https://platform.openai.com/api-keys)에서 API 키 생성

2. Firebase에 Secret 등록:
   ```bash
   firebase functions:secrets:set OPENAI_API_KEY
   ```
   프롬프트가 나타나면 OpenAI API 키 입력

---

### Step 4: Firestore 보안 규칙 설정

Firebase Console → Firestore → 규칙에서 다음 규칙 적용:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자는 자신의 데이터만 읽기/쓰기 가능
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      // 하위 컬렉션도 동일한 규칙 적용
      match /{subcollection}/{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

### Step 5: 배포

#### 5-1. Firebase 로그인

```bash
firebase login
```

#### 5-2. 프로젝트 연결 확인

```bash
firebase use YOUR_PROJECT_ID
```

#### 5-3. Cloud Functions 의존성 설치

```bash
cd functions
npm install
cd ..
```

#### 5-4. 전체 배포

```bash
firebase deploy
```

또는 개별 배포:

```bash
# Hosting만 배포
firebase deploy --only hosting

# Functions만 배포
firebase deploy --only functions
```

---

### Step 6: Functions URL 업데이트

배포 완료 후 터미널에 표시되는 Functions URL을 확인:

```
✔  functions[classifySentiment(us-central1)]: Successful create operation.
Function URL (classifySentiment(us-central1)): https://classifysentiment-xxxxx-uc.a.run.app
```

이 URL을 `js/config.js`의 `SENTIMENT_FUNCTION_URL`에 적용 후 다시 배포:

```bash
firebase deploy --only hosting
```