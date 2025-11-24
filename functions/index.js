const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { OpenAI } = require("openai");
const cors = require("cors")({ origin: true });
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// 감정 분석
exports.classifySentiment = onRequest(
  {
    secrets: ["OPENAI_API_KEY"],
    invoker: "public",
  },
  async (req, res) => {
    cors(req, res, async () => {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You're an analyst. Tell if the user's message " +
                "is positive or not. Consider gratitude, appreciation, " +
                "hope, joy, and optimism as positive. Only respond with " +
                "'positive' or 'negative'.",
            },
            { role: "user", content: req.body.text },
          ],
        });
        res.status(200).json({
          sentiment: completion.choices[0].message.content
            .toLowerCase().trim(),
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });
  },
);

// 주간 보고서 자동 생성
exports.createWeeklyReports = onSchedule(
  {
    schedule: "0 0 * * 0",
    timeZone: "Asia/Seoul",
    secrets: ["OPENAI_API_KEY"],
  },
  async () => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const usersSnapshot = await db.collection("users").get();

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      // 감사 일기 요약
      await createReport(
        openai,
        userId,
        "journals",
        "weekly-reports-gratitude",
        "gratitude",
        weekNumber,
        now,
        oneWeekAgo,
      );

      // 긍정 대화 요약
      await createReport(
        openai,
        userId,
        "talks",
        "weekly-reports-selftalk",
        "selftalk",
        weekNumber,
        now,
        oneWeekAgo,
      );

      // HRV 요약 (웨어러블 사용자만)
      if (userData.hasWearable !== false) {
        await createHRVReport(openai, userId, weekNumber, now, oneWeekAgo);
      }
    }

    console.log("Weekly reports created for all users");
  },
);

/**
 * Create report for journals or talks
 * @param {Object} openai - OpenAI instance
 * @param {string} userId - User ID
 * @param {string} source - Source collection name
 * @param {string} target - Target collection name
 * @param {string} type - Report type
 * @param {number} weekNumber - Week number
 * @param {Date} now - Current date
 * @param {Date} oneWeekAgo - Date one week ago
 */
async function createReport(
  openai,
  userId,
  source,
  target,
  type,
  weekNumber,
  now,
  oneWeekAgo,
) {
  try {
    const snapshot = await db.collection("users").doc(userId)
      .collection(source)
      .where("timestamp", ">=", oneWeekAgo)
      .orderBy("timestamp", "asc")
      .get();

    if (snapshot.empty) return;

    const items = snapshot.docs.map((d) => d.data());
    const texts = items.map((j, i) =>
      `Day ${i + 1}: ${j.content}`).join("\n");

    // 지난 주 리포트 가져오기
    const lastWeekNumber = weekNumber - 1;
    const lastWeekReport = await db.collection("users").doc(userId)
      .collection(target)
      .where("week", "==", lastWeekNumber)
      .limit(1)
      .get();

    let lastWeekSummary = "";
    if (!lastWeekReport.empty) {
      lastWeekSummary = lastWeekReport.docs[0].data().content;
    }

    const promptBase = type === "gratitude" ?
      "You summarize gratitude journals. Create a warm, " +
      "encouraging weekly summary in Korean highlighting main themes." :
      "You summarize positive self-talk. Create an encouraging " +
      "weekly summary in Korean highlighting progress.";

    const prompt = lastWeekSummary ?
      promptBase + ` 지난 주 요약: "${lastWeekSummary}"\n` +
      "이번 주와 비교하여 어떤 발전이 있었는지도 언급해주세요. " +
      "Keep it 2-3 paragraphs." :
      promptBase + " Keep it 2-3 paragraphs.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Summarize:\n${texts}` },
      ],
    });

    const summary = completion.choices[0].message.content;

    // 썸네일 (일기 내용 기반 이미지)
    let imageUrl;
    try {
      // 일기 내용에서 주요 키워드 추출하여 이미지 프롬프트 생성
      const contentSummary = items.map((item) => item.content)
        .join(" ")
        .substring(0, 500); // 처음 500자만 사용

      const imgPromptRequest = type === "gratitude" ?
        `다음 감사 일기 내용을 바탕으로 이미지를 생성하기 위한 영어 프롬프트를 ` +
        `만들어주세요. 따뜻하고 긍정적인 분위기의 일러스트레이션으로, ` +
        `파스텔 톤, 자연 요소, 부드러운 이미지. 미니멀리스트 스타일. ` +
        `텍스트는 포함하지 말고 웰니스 앱에 적합한 이미지. ` +
        `프롬프트만 영어로 출력하세요:\n\n${contentSummary}` :
        `다음 긍정 자기대화 내용을 바탕으로 이미지를 생성하기 위한 영어 ` +
        `프롬프트를 만들어주세요. 따뜻하고 격려하는 분위기의 일러스트레이션으로, ` +
        `파스텔 톤, 성장과 희망을 상징하는 요소, 부드러운 이미지. ` +
        `미니멀리스트 스타일. 텍스트는 포함하지 말고 웰니스 앱에 적합한 이미지. ` +
        `프롬프트만 영어로 출력하세요:\n\n${contentSummary}`;

      const imgPromptCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You create DALL-E image prompts. Output only the " +
              "English prompt, nothing else.",
          },
          { role: "user", content: imgPromptRequest },
        ],
      });

      const imgPrompt = imgPromptCompletion.choices[0].message.content.trim();

      const imgRes = await openai.images.generate({
        model: "dall-e-3",
        prompt: imgPrompt,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      });
      imageUrl = imgRes.data[0].url;
    } catch (e) {
      console.error("Image generation error:", e);
      imageUrl = "https://via.placeholder.com/200x200/FFE0B2/E65100" +
        `?text=Week${weekNumber}`;
    }

    await db.collection("users").doc(userId).collection(target).add({
      year: now.getFullYear(),
      week: weekNumber,
      date: `${now.getFullYear()}년 ${weekNumber}주차`,
      content: summary,
      image: imageUrl,
      journalCount: items.length,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error(`Error creating ${type} report for ${userId}:`, e);
  }
}

/**
 * Create HRV report
 * @param {Object} openai - OpenAI instance
 * @param {string} userId - User ID
 * @param {number} weekNumber - Week number
 * @param {Date} now - Current date
 * @param {Date} oneWeekAgo - Date one week ago
 */
async function createHRVReport(openai, userId, weekNumber, now, oneWeekAgo) {
  try {
    // HRV 데이터 가져오기
    const hrvSnapshot = await db.collection("users").doc(userId)
      .collection("hrv")
      .where("timestamp", ">=", oneWeekAgo)
      .orderBy("timestamp", "asc")
      .get();

    if (hrvSnapshot.empty) return;

    const hrvData = hrvSnapshot.docs.map((d) => d.data());
    const hrvValues = hrvData.map((d) => d.hrv);
    const avgHrv = Math.round(
      hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length,
    );
    const minHrv = Math.min(...hrvValues);
    const maxHrv = Math.max(...hrvValues);

    // 일기 데이터도 가져오기 (종합 분석용)
    const journalsSnapshot = await db.collection("users").doc(userId)
      .collection("journals")
      .where("timestamp", ">=", oneWeekAgo)
      .orderBy("timestamp", "asc")
      .get();
    const talksSnapshot = await db.collection("users").doc(userId)
      .collection("talks")
      .where("timestamp", ">=", oneWeekAgo)
      .orderBy("timestamp", "asc")
      .get();

    const journals = journalsSnapshot.docs
      .map((d) => d.data().content).join("\n");
    const talks = talksSnapshot.docs
      .map((d) => d.data().content).join("\n");

    // 지난 주 HRV 리포트 가져오기
    const lastWeekNumber = weekNumber - 1;
    const lastWeekReport = await db.collection("users").doc(userId)
      .collection("weekly-reports-hrv")
      .where("week", "==", lastWeekNumber)
      .limit(1)
      .get();

    let lastWeekAvgHrv = null;
    let comparisonInfo = "";
    if (!lastWeekReport.empty) {
      const lastData = lastWeekReport.docs[0].data();
      lastWeekAvgHrv = lastData.avgHrv;
      comparisonInfo = `지난 주 평균: ${lastWeekAvgHrv}ms, 이번 주 평균: ` +
        `${avgHrv}ms (${avgHrv >= lastWeekAvgHrv ? "증가" : "감소"})`;
    }

    // HRV 추세 분석 (감소 추세인지 확인)
    let trendWarning = "";
    if (hrvValues.length >= 3) {
      // 최근 3일 평균 vs 초반 3일 평균
      const firstThird = hrvValues.slice(0, Math.ceil(hrvValues.length / 3));
      const lastThird = hrvValues.slice(-Math.ceil(hrvValues.length / 3));
      const firstAvg = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
      const lastAvg = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;

      if (lastAvg < firstAvg * 0.8) {
        trendWarning = "⚠️ 이번 주 HRV가 지속적으로 감소하는 추세입니다. ";
      }
    }

    // 지난 주 대비 경고
    if (lastWeekAvgHrv && avgHrv < lastWeekAvgHrv * 0.8) {
      trendWarning += "⚠️ 지난 주에 비해 HRV가 크게 낮아졌습니다. ";
    }

    // AI 분석
    const hrvDataStr = hrvData.map((d) =>
      `${d.date}: ${d.hrv}ms`,
    ).join(", ");

    const analysisPrompt =
      "당신은 건강 전문가입니다. 다음 데이터를 바탕으로 " +
      "이번 주 건강 상태를 분석해주세요.\n\n" +
      "HRV 데이터:\n" +
      `- 일별 HRV: ${hrvDataStr}\n` +
      `- 평균: ${avgHrv}ms, 최저: ${minHrv}ms, 최고: ${maxHrv}ms\n` +
      (comparisonInfo ? `- 지난 주 비교: ${comparisonInfo}\n` : "") +
      (trendWarning ? `\n${trendWarning}\n` : "") +
      "\n감사 일기 내용:\n" +
      (journals || "(없음)") +
      "\n\n긍정 자기대화 내용:\n" +
      (talks || "(없음)") +
      "\n\n분석 요청사항:\n" +
      "1. HRV 추이 분석 (주 초반과 후반 비교, 변화 패턴)\n" +
      "2. 일기 내용과 HRV의 상관관계 분석 " +
      "(일기 내용이 부정적이거나 스트레스 관련 내용이 많고 " +
      "HRV가 낮거나 감소 추세라면 언급)\n" +
      "3. 이번 주 전반적인 건강/정서 상태 평가\n" +
      "4. 개선을 위한 구체적인 조언\n" +
      (comparisonInfo ?
        "5. 지난 주와 비교하여 어떤 변화가 있었는지\n" : "") +
      (trendWarning ?
        "\n⚠️ HRV 감소 추세 또는 지난 주 대비 하락이 감지되었고, " +
        "일기 내용도 부정적이라면 적절한 경고와 조언을 제공하세요. " +
        "필요시 전문가 상담을 권유하세요.\n" : "") +
      "\n한국어로 따뜻하고 격려하는 톤으로 작성해주세요. " +
      "3-4 문단으로 작성해주세요.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a health expert providing " +
            "weekly health analysis.",
        },
        { role: "user", content: analysisPrompt },
      ],
    });

    const analysis = completion.choices[0].message.content;

    await db.collection("users").doc(userId)
      .collection("weekly-reports-hrv").add({
        year: now.getFullYear(),
        week: weekNumber,
        date: `${now.getFullYear()}년 ${weekNumber}주차`,
        content: analysis,
        avgHrv,
        minHrv,
        maxHrv,
        hrvData: hrvData.map((d) => ({ date: d.date, hrv: d.hrv })),
        dataCount: hrvData.length,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

    console.log(`HRV report created for user ${userId}`);
  } catch (e) {
    console.error(`Error creating HRV report for ${userId}:`, e);
  }
}

// 수동 주간 보고서 생성
exports.manualCreateReport = onRequest(
  {
    secrets: ["OPENAI_API_KEY"],
    invoker: "public",
  },
  async (req, res) => {
    cors(req, res, async () => {
      try {
        const { userId, type } = req.body;
        if (!userId || !type) {
          res.status(400).json({ error: "userId and type required" });
          return;
        }

        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil(
          (days + startOfYear.getDay() + 1) / 7,
        );

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        if (type === "hrv") {
          await createHRVReport(openai, userId, weekNumber, now, oneWeekAgo);
        } else {
          const source = type === "gratitude" ? "journals" : "talks";
          const target = type === "gratitude" ?
            "weekly-reports-gratitude" : "weekly-reports-selftalk";
          await createReport(
            openai,
            userId,
            source,
            target,
            type,
            weekNumber,
            now,
            oneWeekAgo,
          );
        }

        res.status(200).json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
      }
    });
  },
);
