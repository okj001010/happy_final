// ========================================
// 테스트용 샘플 데이터 생성 스크립트
// 브라우저 콘솔에서 실행하세요
// ========================================

// 사용법:
// 1. 앱에 로그인한 상태에서 브라우저 개발자 도구 열기 (F12)
// 2. Console 탭에서 이 코드를 붙여넣고 실행
// 3. generateTestData() 함수 호출

// Firebase 모듈 import (앱이 이미 로드된 상태에서 실행)

// 현재 로그인된 사용자의 ID 가져오기
async function getCurrentUserId() {
  return new Promise((resolve) => {
    const checkAuth = setInterval(() => {
      const user = firebase.auth().currentUser;
      if (user) {
        clearInterval(checkAuth);
        resolve(user.uid);
      }
    }, 100);
  });
}

// 날짜 헬퍼 함수
function getDateString(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function getTimestamp(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return firebase.firestore.Timestamp.fromDate(d);
}

// 샘플 감사 일기 데이터
const sampleJournals = [
  { content: "오늘 아침에 예쁜 꽃을 봐서 기분이 좋았어요. 작은 것에도 감사하게 되네요.", emotion: "평화로움" },
  { content: "친구가 힘들 때 연락해줘서 정말 감사했어요. 좋은 친구가 있다는 게 행복해요.", emotion: "감사함" },
  { content: "맛있는 점심을 먹었어요. 건강하게 먹을 수 있다는 것에 감사합니다.", emotion: "만족" },
  { content: "오늘 업무가 잘 풀려서 감사해요. 노력한 보람이 있네요.", emotion: "뿌듯함" },
  { content: "가족들과 저녁을 함께 했어요. 소중한 시간이었습니다.", emotion: "행복" },
  { content: "좋아하는 음악을 들으며 산책했어요. 여유로운 시간에 감사해요.", emotion: "편안함" },
  { content: "오늘 새로운 것을 배웠어요. 성장할 수 있어서 감사합니다.", emotion: "설렘" },
  { content: "비가 와서 창문 소리를 들었어요. 자연의 소리가 좋았어요.", emotion: "평온" },
  { content: "동료가 도와줘서 일을 빨리 끝낼 수 있었어요. 팀워크에 감사!", emotion: "고마움" },
  { content: "오늘 하루도 무사히 보냈어요. 건강한 것에 감사합니다.", emotion: "안도" },
  { content: "어제보다 조금 더 성장한 것 같아요. 나 자신에게 감사해요.", emotion: "자신감" },
  { content: "좋아하는 카페에서 커피를 마셨어요. 소소한 행복이에요.", emotion: "기쁨" },
  { content: "운동을 했더니 몸이 개운해요. 건강을 챙길 수 있어서 감사해요.", emotion: "상쾌함" },
  { content: "좋은 책을 읽었어요. 새로운 관점을 배웠습니다.", emotion: "영감" },
];

// 샘플 긍정 자기대화 데이터
const sampleTalks = [
  { content: "나는 충분히 잘하고 있어. 오늘도 최선을 다한 나에게 고마워!", emotion: "자신감" },
  { content: "실수해도 괜찮아. 그것도 배움의 과정이니까.", emotion: "평온" },
  { content: "나는 매일 조금씩 성장하고 있어. 내일은 더 나아질 거야!", emotion: "희망" },
  { content: "힘들어도 포기하지 않는 내가 대단해. 끝까지 해보자!", emotion: "용기" },
  { content: "나는 사랑받을 자격이 있어. 나 자신을 더 아끼자.", emotion: "따뜻함" },
  { content: "완벽하지 않아도 돼. 있는 그대로의 나도 충분히 가치있어.", emotion: "수용" },
  { content: "오늘 하루도 감사해. 내일도 좋은 일이 있을 거야!", emotion: "긍정" },
  { content: "어려운 상황도 결국 지나가. 나는 이겨낼 수 있어.", emotion: "강인함" },
  { content: "나의 노력은 결국 빛을 발할 거야. 계속 가보자!", emotion: "확신" },
  { content: "지금 이 순간에 집중하자. 나는 할 수 있어!", emotion: "집중" },
  { content: "나는 특별한 존재야. 세상에 하나뿐인 나!", emotion: "자존감" },
  { content: "작은 진전도 진전이야. 한 걸음씩 나아가고 있어.", emotion: "만족" },
  { content: "스트레스 받지 말자. 내가 통제할 수 있는 것에 집중하자.", emotion: "차분함" },
  { content: "나를 믿어. 내가 선택한 길을 믿고 가자!", emotion: "신뢰" },
];

// 샘플 HRV 데이터 (20~80 범위)
const sampleHRV = [
  { hrv: 45 }, { hrv: 52 }, { hrv: 38 }, { hrv: 61 }, { hrv: 55 },
  { hrv: 42 }, { hrv: 58 }, { hrv: 49 }, { hrv: 65 }, { hrv: 51 },
  { hrv: 47 }, { hrv: 54 }, { hrv: 40 }, { hrv: 63 }, { hrv: 56 },
  { hrv: 44 }, { hrv: 59 }, { hrv: 48 }, { hrv: 62 }, { hrv: 53 },
  { hrv: 35 }, // 낮은 수치 (경고 테스트용)
];

// 테스트 데이터 생성 함수
async function generateTestData(weeks = 3) {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('❌ 로그인이 필요합니다!');
    return;
  }
  
  console.log('🚀 테스트 데이터 생성 시작...');
  console.log('👤 사용자 ID:', userId);
  
  const db = firebase.firestore();
  const totalDays = weeks * 7;
  
  let journalCount = 0;
  let talkCount = 0;
  let hrvCount = 0;
  
  for (let i = totalDays; i >= 0; i--) {
    const dateStr = getDateString(i);
    const timestamp = getTimestamp(i);
    
    // 감사 일기 (90% 확률로 생성)
    if (Math.random() < 0.9) {
      const journal = sampleJournals[journalCount % sampleJournals.length];
      await db.collection('users').doc(userId).collection('journals').add({
        content: journal.content,
        emotion: journal.emotion,
        isPositive: true,
        date: dateStr,
        timestamp: timestamp
      });
      journalCount++;
    }
    
    // 긍정 자기대화 (85% 확률로 생성)
    if (Math.random() < 0.85) {
      const talk = sampleTalks[talkCount % sampleTalks.length];
      await db.collection('users').doc(userId).collection('talks').add({
        content: talk.content,
        emotion: talk.emotion,
        isPositive: true,
        attemptCount: Math.random() < 0.3 ? 2 : 1, // 30% 확률로 2회 시도
        date: dateStr,
        timestamp: timestamp
      });
      talkCount++;
    }
    
    // HRV (80% 확률로 생성)
    if (Math.random() < 0.8) {
      const hrv = sampleHRV[hrvCount % sampleHRV.length];
      await db.collection('users').doc(userId).collection('hrv').add({
        hrv: hrv.hrv,
        date: dateStr,
        timestamp: timestamp
      });
      hrvCount++;
    }
  }
  
  console.log('✅ 테스트 데이터 생성 완료!');
  console.log('📝 감사 일기:', journalCount, '개');
  console.log('💪 긍정 자기대화:', talkCount, '개');
  console.log('❤️ HRV 기록:', hrvCount, '개');
  console.log('');
  console.log('💡 이제 주간 요약을 생성하려면 triggerWeeklyReport() 함수를 실행하세요!');
}

// 주간 보고서 수동 트리거 함수
async function triggerWeeklyReport(type = 'all') {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('❌ 로그인이 필요합니다!');
    return;
  }
  
  // Functions URL (이미 업데이트됨)
  const MANUAL_REPORT_URL = 'https://manualcreatereport-mthnp5nqyq-uc.a.run.app';
  
  const types = type === 'all' ? ['gratitude', 'selftalk', 'hrv'] : [type];
  
  for (const t of types) {
    console.log('🔄 ' + t + ' 주간 보고서 생성 중...');
    
    try {
      const response = await fetch(MANUAL_REPORT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userId, type: t })
      });
      
      if (response.ok) {
        console.log('✅ ' + t + ' 보고서 생성 완료!');
      } else {
        console.error('❌ ' + t + ' 보고서 생성 실패:', await response.text());
      }
    } catch (error) {
      console.error('❌ 에러:', error);
    }
  }
  
  console.log('');
  console.log('🎉 완료! 주간 요약 페이지를 확인해보세요.');
}

// 테스트 데이터 삭제 함수
async function clearTestData() {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.error('❌ 로그인이 필요합니다!');
    return;
  }
  
  if (!confirm('⚠️ 모든 테스트 데이터가 삭제됩니다. 계속하시겠습니까?')) {
    return;
  }
  
  const db = firebase.firestore();
  const collections = ['journals', 'talks', 'hrv', 'weekly-reports-gratitude', 'weekly-reports-selftalk', 'weekly-reports-hrv'];
  
  for (const col of collections) {
    const snapshot = await db.collection('users').doc(userId).collection(col).get();
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log('🗑️ ' + col + ' 삭제 완료 (' + snapshot.size + '개)');
  }
  
  console.log('✅ 모든 데이터 삭제 완료!');
}

console.log('========================================');
console.log('🧪 HAPPY 테스트 스크립트 로드 완료!');
console.log('========================================');
console.log('');
console.log('사용 가능한 함수:');
console.log('  generateTestData(weeks)  - 테스트 데이터 생성 (기본 3주)');
console.log('  triggerWeeklyReport(type) - 주간 보고서 생성 ("all", "gratitude", "selftalk", "hrv")');
console.log('  clearTestData()          - 모든 테스트 데이터 삭제');
console.log('');
console.log('예시:');
console.log('  generateTestData(2)      - 2주치 데이터 생성');
console.log('  triggerWeeklyReport()    - 모든 주간 보고서 생성');
console.log('');