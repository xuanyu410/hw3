import { GoogleGenerativeAI } from "@google/generative-ai";
import React, { useEffect, useMemo, useRef, useState } from "react";
// *** 新增一個取得明天日期的輔助函數 ***
function getTomorrowDateString() {
  const today = new Date();
  // 將日期設定為明天
  today.setDate(today.getDate() + 1);
  // 轉換為 YYYY-MM-DD 格式的字串
  return today.toISOString().substring(0, 10);
}



export default function FortuneChat({
  defaultModel = "gemini-2.5-flash",

}) {

  // --- 分頁 State ---

  // 'gemini', 'openai', 'weather', 'github'
  const [activeTab, setActiveTab] = useState('gemini'); 



  // --- Gemini 核心 State (運勢) ---

  const [model, setModel] = useState(defaultModel);

  const [history, setHistory] = useState([]);

  const [input, setInput] = useState(""); // Gemini 輸入

  const [apiKey, setApiKey] = useState(""); // Gemini Key

  const [rememberKey, setRememberKey] = useState(true);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState(""); // Gemini 錯誤

  const [fortune, setFortune] = useState(null);

  const listRef = useRef(null);



  // --- ✨ OpenWeather 旅遊 State (天氣與穿搭) ---

  const [weatherCity, setWeatherCity] = useState("Taipei, TW"); // 地點輸入

  // *** 🎯 變更點：預設查詢日期改為「明天」***

  const [weatherDate, setWeatherDate] = useState(getTomorrowDateString()); // 日期輸入 (預設明天)

  const [weatherData, setWeatherData] = useState(null); // 儲存天氣查詢結果

  const [weatherLoading, setWeatherLoading] = useState(false);

  const [weatherError, setWeatherError] = useState("");

  
  // --- 📚 GitHub Issue State (新加入) ---
  const [githubIssues, setGithubIssues] = useState([]); // 儲存 Issue 列表
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState("");
  // *** 🎯 新增: 追蹤是否嘗試過載入 ***
  const [githubHasAttemptedLoad, setGithubHasAttemptedLoad] = useState(false);


  // --- 初始化 (從本機儲存讀取) ---

  useEffect(() => {

    const savedGemini = localStorage.getItem("gemini_api_key");

    if (savedGemini) setApiKey(savedGemini);

    

    // **移除 OpenWeather Key 相關的 localStorage 讀取邏輯**

  }, []);



  useEffect(() => {

    setHistory([

      { role: "model", parts: [{ text: "嗨👋 我是你的運勢小助手，可以幫你分析今日運勢喔！" }] },

    ]);

  }, []);



  useEffect(() => {

    const el = listRef.current;

    if (!el) return;

    el.scrollTop = el.scrollHeight;

  }, [history, loading, weatherLoading, githubLoading]); // 新增 githubLoading



  const ai = useMemo(() => {

    try {

      return apiKey ? new GoogleGenerativeAI(apiKey) : null;

    } catch {

      return null;

    }

  }, [apiKey]);





  // --- ✨ OpenWeather API 呼叫與 Gemini 建議函式 (透過 Node.js 代理) ---

  async function fetchWeatherAndSuggest() {

    if (!weatherCity.trim()) {

      setWeatherError("請輸入地點！");

      return;

    }

    if (!ai) {

        setWeatherError("請先在運勢分頁輸入有效的 Gemini API Key，才能生成穿搭建議！");

        return;

    }



    setWeatherLoading(true);

    setWeatherError("");

    setWeatherData(null);



    const city = weatherCity.trim();

    const targetDate = weatherDate;

    

    // *** 🎯 呼叫 Node.js 後端代理伺服器！ ***

    const PROXY_URL = `http://localhost:3001/api/weather-proxy?city=${encodeURIComponent(city)}&date=${targetDate}`;



    try {

        // 1. 呼叫代理伺服器

        const proxyResponse = await fetch(PROXY_URL);

        const proxyJson = await proxyResponse.json();



        if (!proxyResponse.ok) {

            // 處理代理伺服器返回的錯誤

            throw new Error(proxyJson.error || "後端代理伺服器錯誤 (請檢查 Node.js 終端機是否有錯誤)");

        }

        

        // 2. 獲取篩選後的數據

        const targetForecast = proxyJson.forecast;

        const retrievedCity = proxyJson.city; // 從後端獲取正確的城市名稱

        

        setWeatherData(targetForecast);



        // 3. 🧠 使用 Gemini 進行穿搭推理

        const { main, weather } = targetForecast;

        const weatherDesc = weather[0]?.description || '晴朗';



        const aiPrompt = `

今天是 ${new Date().toLocaleDateString("zh-TW")}。

請根據以下「${retrievedCity}」在 ${targetForecast.dt_txt} 的天氣數據，提供詳細的穿搭建議和活動提醒。

---

天氣數據：

- 天氣狀況：${weatherDesc}

- 溫度：攝氏 ${main.temp}°C

- 體感溫度：攝氏 ${main.feels_like}°C

- 濕度：${main.humidity}%

---

請包含以下內容：

1. ☀️ 天氣摘要 (用親切語氣)。

2. 🧥 穿搭建議 (針對上衣、下裝、外套、配件，需根據 ${main.temp}°C 判斷)。

3. 👟 活動建議 (建議適合的天氣活動)。

4. 🌟 注意事項 (例如防曬、防雨、保暖)。

請使用 markdown 格式並搭配 emoji，總長約 100-150 字。

`;

        
        const modelClient = ai.getGenerativeModel({ model });

        const aiResult = await modelClient.generateContent({

            contents: [{ role: "user", parts: [{ text: aiPrompt }] }],

        });



        const aiSuggestion = aiResult.response.text() || "小助手沒有想到建議呢！";

        

        setHistory((h) => [...h, { role: "model", parts: [{ text: `☀️ 天氣與穿搭建議：\n${aiSuggestion}` }] }]);



    } catch (err) {

      setWeatherError(err?.message || "查詢天氣或生成建議失敗");

    } finally {

      setWeatherLoading(false);

    }

}


  // --- 📚 GitHub Issue 呼叫函式 (新加入) ---
  async function fetchGithubIssues() {
    setGithubLoading(true);
    setGithubError("");

    const PROXY_URL = `http://localhost:3001/api/github-issues`;

    try {
      // 1. 呼叫代理伺服器
      const proxyResponse = await fetch(PROXY_URL);
      const proxyJson = await proxyResponse.json();

      if (!proxyResponse.ok) {
        // 處理代理伺服器返回的錯誤
        throw new Error(proxyJson.error || "後端代理伺服器錯誤 (請檢查 Node.js 終端機是否有錯誤)");
      }

      // 2. 儲存 Issue 資料 (後端已簡化)
      setGithubIssues(proxyJson);
    } catch (err) {
      setGithubError(err?.message || "查詢 GitHub Issue 失敗");
      setGithubIssues([]); // 失敗時清空列表
    } finally {
      setGithubLoading(false);
      // *** 🎯 載入成功或失敗都設定為已嘗試載入 ***
      setGithubHasAttemptedLoad(true); 
    }
  }


  // --- Gemini 核心函式 (運勢分析) ---

  async function sendMessage(message) {

    const content = (message ?? input).trim();

    if (!content || loading) return;

    if (!ai) {

      setError("請先輸入有效的 Gemini API Key");

      return;

    }



    setError("");

    setLoading(true);

    setFortune(null);



    const newHistory = [...history, { role: "user", parts: [{ text: content }] }];

    setHistory(newHistory);

    setInput("");



    try {

      const modelClient = ai.getGenerativeModel({ model });



      const fortunePrompt =

        /運勢|星座|生日|命運|luck|fortune/i.test(content)

          ? `

你是一位溫柔的命理分析師。

使用者輸入：「${content}」

請根據生日與今日日期 (${new Date().toLocaleDateString("zh-TW")})，分析今日運勢。

請包含：

1️⃣ 整體運勢（以大吉、中吉、小吉、凶為主）

2️⃣ 感情運

3️⃣ 事業/學業運

4️⃣ 財運

5️⃣ 幸運色與幸運圖案

6️⃣ 今日建議或鼓勵的話

用親切的語氣與 emoji 撰寫。

最後請以 JSON 格式附上：

{"運勢":"中吉","幸運色":"粉紅色","幸運圖案":"🌸 櫻花"}

`

          : content;



      const result = await modelClient.generateContent({

        contents: [...newHistory, { role: "user", parts: [{ text: fortunePrompt }] }],

      });



      const reply = result.response.text() || "[No content]";

      setHistory((h) => [...h, { role: "model", parts: [{ text: reply }] }]);



      const jsonMatch = reply.match(/\{[\s\S]*\}/);

      if (jsonMatch) {

        try {

          const parsed = JSON.parse(jsonMatch[0]);

          setFortune(parsed);

        } catch {}

      }

    } catch (err) {

      setError(err?.message || String(err));

    } finally {

      setLoading(false);

    }

  }



  function renderMarkdownLike(text) {

    const lines = text.split(/\n/);

    return (

      <>

        {lines.map((ln, i) => (

          <pre key={i} style={styles.preWrap}>{ln}</pre>

        ))}

      </>

    );

  }



  // --- 渲染分頁 UI 邏輯 (不變) ---



  const renderGeminiTab = () => (

    <>

      <div style={styles.controls}>

        <h3>🔮 運勢分析 (Gemini)</h3>

        <label style={styles.label}>

          <span>Gemini API Key</span>

          <input

            type="password"

            value={apiKey}

            onChange={(e) => {

              const v = e.target.value;

              setApiKey(v);

              if (rememberKey) localStorage.setItem("gemini_api_key", v);

            }}

            placeholder="貼上你的 API Key"

            style={styles.input}

          />

          <label style={styles.remember}>

            <input

              type="checkbox"

              checked={rememberKey}

              onChange={(e) => {

                setRememberKey(e.target.checked);

                if (!e.target.checked) localStorage.removeItem("gemini_api_key");

                else if (apiKey) localStorage.setItem("gemini_api_key", apiKey);

              }}

            />

            <span>記住在本機</span>

          </label>

        </label>

      </div>



      <form

        onSubmit={(e) => {

          e.preventDefault();

          sendMessage();

        }}

        style={styles.composer}

      >

        <input

          placeholder="輸入生日（例如 2006/04/10）讓 AI 幫你分析今日運勢 ✨"

          value={input}

          onChange={(e) => setInput(e.target.value)}

          style={styles.textInput}

        />

        <button

          type="submit"

          disabled={loading || !input.trim() || !apiKey}

          style={styles.sendBtn}

        >

          🔮 送出

        </button>

      </form>



      <div style={styles.quickWrap}>

        {["今天適合穿什麼?", "幫我看今天的運勢", "我今天幸運色是什麼？"].map((q) => (

          <button key={q} type="button" style={styles.suggestion} onClick={() => sendMessage(q)}>

            {q}

          </button>

        ))}

      </div>

    </>

  );



  const renderWeatherTab = () => (

    <div style={{ ...styles.controls, background: "#e6f7ff" }}>

      <h3>☀️ 天氣與穿搭助手 (OpenWeather + Gemini)</h3>

      

      {/* ** 🎯 移除 OpenWeather API Key 輸入區塊 (現在由後端處理) ** */}

      

      <div style={styles.weatherInputGroup}>

        <label style={{ ...styles.label, flex: 2 }}>

          <span>地點 (城市, 國家代碼)</span>

          <input

            type="text"

            value={weatherCity}

            onChange={(e) => setWeatherCity(e.target.value)}

            placeholder="例如: London, UK 或 Kaohsiung, TW"

            style={styles.weatherTextInput}

          />

        </label>

        <label style={{ ...styles.label, flex: 1 }}>

          <span>日期 (未來 5 天)</span>

          <input

            type="date"

            value={weatherDate}

            min={new Date().toISOString().substring(0, 10)}

            onChange={(e) => setWeatherDate(e.target.value)}

            style={styles.weatherTextInput}

          />

        </label>

      </div>



      <button

        onClick={fetchWeatherAndSuggest}

        // 只需要檢查 weatherCity 和 Gemini Key

        disabled={weatherLoading || !weatherCity.trim() || !apiKey} 

        style={styles.weatherSearchBtn}

      >

        {weatherLoading ? "查詢中..." : "🌤️ 查詢天氣與穿搭建議"}

      </button>



      {weatherError && <div style={{...styles.error, background: "#ffe6e6", color: "#8b0000", margin: "10px 0 0 0"}}>⚠ 查詢錯誤: {weatherError}</div>}

    </div>

  );


  const renderGithubTab = () => (
    <div style={{ ...styles.controls, background: "#f0fff0" }}>
      <h3>📚 GitHub 專案 Issue (Open State)</h3>
      
      <p style={{ fontSize: 13, color: '#4a6d4a', borderBottom: '1px dashed #c0d9c0', paddingBottom: 10 }}>
        顯示來自後端配置的儲存庫：
        (請確保 .env 檔案中的 GITHUB_REPO_OWNER 和 GITHUB_REPO_NAME 設定正確)
      </p>

      <button
        onClick={fetchGithubIssues}
        disabled={githubLoading} 
        style={styles.githubSearchBtn} 
      >
        {githubLoading ? "查詢中..." : "🔄 重新載入最新 Issues (Open)"}
      </button>

      {githubError && <div style={{...styles.error, background: "#ffe6e6", color: "#8b0000", margin: "10px 0 0 0"}}>⚠ 查詢錯誤: {githubError}</div>}
    
      {githubIssues.length > 0 && (
        <div style={styles.issueList}>
          {githubIssues.map((issue) => (
            <a 
              key={issue.number} 
              href={issue.url} 
              target="_blank" 
              rel="noopener noreferrer"
              style={styles.issueItem}
            >
              <span style={styles.issueNumber}>#{issue.number}</span>
              <span style={styles.issueTitle}>{issue.title}</span>
              <span style={styles.issueMeta}>
                by {issue.user} on {issue.createdAt}
              </span>
            </a>
          ))}
        </div>
      )}
      {/* *** 🎯 這裡進行優化: 根據是否嘗試過載入，顯示不同的訊息 *** */}
      {githubIssues.length === 0 && !githubLoading && !githubError && (
          <div style={{...styles.error, background: "#f0f0f0", color: "#666", margin: "10px 0 0 0"}}>
              {githubHasAttemptedLoad
                ? "✅ 專案連線成功，但目前沒有任何狀態為 Open 的 Issue。"
                : "請點擊按鈕載入 Issue，或確認後端 .env 配置是否正確。"
              }
          </div>
      )}
    </div>
  );


  // --- 總渲染 (不變) ---

  return (

    <div style={styles.wrap}>

      <div style={styles.card}>

        <div style={styles.header}>🔮 運勢 & 天氣穿搭小助手</div>



        {/* --- 分頁切換按鈕區塊 (不變) --- */}

        <div style={styles.tabBar}>

          <button 

            style={{...styles.tabButton, ...(activeTab === 'gemini' ? styles.tabActive : {})}}

            onClick={() => setActiveTab('gemini')}

          >

            🔮 運勢分析 (Gemini)

          </button>

          <button 

            style={{...styles.tabButton, ...(activeTab === 'weather' ? styles.tabActive : styles.tabInactiveWeather)}}

            onClick={() => setActiveTab('weather')}

          >

            ☀️ 天氣與穿搭 (OpenWeather)

          </button>
          {/* --- GitHub Button (新加入) --- */}
          <button 
            style={{...styles.tabButton, ...(activeTab === 'github' ? styles.tabActive : styles.tabInactiveGithub)}}
            onClick={() => {
              setActiveTab('github');
              // 切換到 GitHub tab 時自動載入 Issue
              if (githubIssues.length === 0 && !githubLoading && !githubHasAttemptedLoad) {
                fetchGithubIssues();
              }
            }}
          >
            📚 專案 Issue (GitHub)
          </button>

        </div>



        {/* --- 分頁內容顯示 --- */}

        <div style={styles.tabContent}>

          {activeTab === 'gemini' && renderGeminiTab()}

          {activeTab === 'weather' && renderWeatherTab()}
          {activeTab === 'github' && renderGithubTab()} 

        </div>

        

        {/* --- 聊天歷史區塊 (不變) --- */}
        {/* ... (略) ... */}
        <div ref={listRef} style={styles.messages}>

          {history.map((m, idx) => (

            <div

              key={idx}

              style={{

                ...styles.msg,

                // 天氣建議給予特殊樣式

                ...(m.role === "model" && m.parts[0].text.startsWith("☀️ 天氣與穿搭建議：") ? styles.weatherAssistant : styles.assistant), 

                ...(m.role === "user" ? styles.user : {})

              }}

            >

              <div style={styles.msgRole}>{m.role === "user" ? "🧍‍♀️ 你" : "🔮 小助手"}</div>

              <div style={styles.msgBody}>

                {renderMarkdownLike(m.parts.map((p) => p.text).join("\n"))}

              </div>

            </div>

          ))}

          {loading && (

            <div style={{ ...styles.msg, ...styles.assistant }}>

              <div style={styles.msgRole}>🔮 小助手</div>

              <div style={styles.msgBody}>正在觀星推算中… ✨</div>

            </div>

          )}

            {weatherLoading && (

            <div style={{ ...styles.msg, ...styles.weatherAssistant }}>

              <div style={styles.msgRole}>☀️ 天氣助手</div>

              <div style={styles.msgBody}>正在連線雲端氣象站… 🛰️</div>

            </div>

          )}
            {/* --- GitHub Loading (新加入) --- */}
            {githubLoading && (
            <div style={{ ...styles.msg, ...styles.githubAssistant }}>
              <div style={styles.msgRole}>📚 GitHub 助手</div>
              <div style={styles.msgBody}>正在載入 Issue 列表… 📄</div>
            </div>
          )}

        </div>


        {/* --- 摘要/錯誤區塊 (不變) --- */}

        {fortune && (

          <div style={styles.fortuneCard}>

            <h3>🌟 今日運勢摘要</h3>

            <p><strong>整體運勢：</strong>{fortune["運勢"] || "未知"}</p>

            <p><strong>幸運色：</strong>{fortune["幸運色"] || "?"}</p>

            <p><strong>幸運圖案：</strong>{fortune["幸運圖案"] || "?"}</p>

          </div>

        )}



        {error && <div style={styles.error}>⚠ {error}</div>}



      </div>

    </div>

  );

}


const styles = {
 // ... (styles 物件保持不變) ...
  wrap: {

    fontFamily: '"Microsoft JhengHei", sans-serif',

    display: "grid",

    placeItems: "start",

    padding: 20,

    background: "#fff8dc",

    minHeight: "100vh",

  },

  card: {

    width: "min(900px, 100%)",

    background: "#fff",

    border: "2px solid #ffd59e",

    borderRadius: 20,

    boxShadow: "0 6px 15px rgba(255,179,71,0.25)",

    overflow: "hidden",

  },

  header: {

    padding: "14px 16px",

    fontWeight: 700,

    fontSize: 20,

    borderBottom: "3px solid #ffb347",

    background: "linear-gradient(90deg, #ffb347, #ffd59e)",

    color: "#333",

    textAlign: "center",

  },

  // --- 分頁樣式 ---

  tabBar: {

    display: "flex",

    borderBottom: "2px solid #ddd",

    backgroundColor: "#fff8dc",

  },

  tabButton: {

    flex: 1,

    padding: "12px 10px",

    border: "none",

    background: "transparent",

    cursor: "pointer",

    fontSize: 16,

    fontWeight: 600,

    color: "#8b4513",

    borderBottom: "3px solid transparent",

    transition: "all 0.3s",

  },

  tabActive: {

    color: "#ff6600",

    borderBottom: "3px solid #ff6600",

    background: "#fff",

  },

  tabInactiveWeather: {

    color: "#005f73", // 天氣未選中顏色

  },
  // --- GitHub 樣式 (新加入) ---
  tabInactiveGithub: {
    color: "#4a6d4a", // GitHub 未選中顏色 (深綠)
  },

  tabContent: {

    paddingBottom: 0,

    borderBottom: "1px solid #f0f0f0",

  },

  // --- 共通樣式 ---

  controls: {

    display: "grid",

    gap: 12,

    gridTemplateColumns: "1fr",

    padding: 14,

    background: "inherit",

  },

  label: { display: "grid", gap: 6, fontSize: 13, fontWeight: 600, color: "#663300" },

  input: {

    padding: "10px 12px",

    borderRadius: 10,

    border: "1px solid #ffb347",

    fontSize: 14,

    background: "#fff",

  },

  remember: {

    display: "flex",

    alignItems: "center",

    gap: 6,

    fontSize: 12,

    color: "#8b4513",

    marginTop: 4,

  },

  messages: {

    padding: 14,

    display: "grid",

    gap: 10,

    maxHeight: 420,

    overflow: "auto",

    background: "#fffdf2",

    borderTop: "1px solid #ffd59e",

  },

  msg: {

    borderRadius: 16,

    padding: 10,

    fontSize: 14,

    lineHeight: 1.5,

    boxShadow: "0 2px 5px rgba(0,0,0,0.08)",

  },

  user: {

    background: "#ffe6c7",

    border: "1px solid #ffcc80",

    alignSelf: "end",

    justifySelf: "end",

    maxWidth: "80%",

  },

  assistant: {

    background: "#fff3cd",

    border: "1px solid #ffd59e",

    maxWidth: "80%",

  },

  weatherAssistant: { 

    background: "#d9edf7", // 淺藍色背景

    border: "1px solid #007bff",

    maxWidth: "80%",

  },
  githubAssistant: { 
    background: "#e6f7e6", // 淺綠色背景
    border: "1px solid #4a6d4a",
    maxWidth: "80%",
  },

  msgRole: { fontSize: 12, fontWeight: 700, opacity: 0.8, marginBottom: 4 },

  msgBody: { fontSize: 14 },

  preWrap: { 

    whiteSpace: "pre-wrap", 

    wordBreak: "break-word",

    margin: 0,

    padding: 0,

    fontFamily: 'inherit',

  },

  fortuneCard: {

    background: "#fffaf0",

    border: "2px dashed #ffd59e",

    borderRadius: 16,

    margin: "10px 20px",

    padding: 16,

    boxShadow: "0 4px 10px rgba(255, 200, 100, 0.15)",

    color: "#5c3b00",

  },

  error: {

    color: "#b91c1c",

    padding: "6px 14px",

    background: "#fee2e2",

    borderRadius: 8,

    margin: 10,

  },

  composer: {

    padding: 12,

    display: "grid",

    gridTemplateColumns: "1fr auto",

    gap: 8,

    borderTop: "2px solid #ffd59e",

    background: "#fffaf0",

  },

  textInput: {

    padding: "10px 14px",

    borderRadius: 20,

    border: "1px solid #ffcc80",

    fontSize: 14,

    outline: "none",

  },

  sendBtn: {

    padding: "10px 16px",

    borderRadius: 999,

    border: "none",

    background: "linear-gradient(90deg, #ffb347, #ffd59e)",

    color: "#333",

    fontSize: 14,

    cursor: "pointer",

    fontWeight: 600,

  },

  quickWrap: {

    display: "flex",

    gap: 8,

    flexWrap: "wrap",

    margin: "8px 12px 16px",

  },

  suggestion: {

    padding: "6px 10px",

    borderRadius: 999,

    border: "1px solid #ffcc80",

    background: "#fff8dc",

    cursor: "pointer",

    fontSize: 13,

    color: "#663300",

    transition: "all 0.2s",

  },

  // --- 天氣樣式 ---

  weatherInputGroup: {

    display: "flex",

    gap: 10,

  },

  weatherTextInput: {

    padding: "10px 12px",

    borderRadius: 10,

    border: "1px solid #005f73",

    fontSize: 14,

    background: "#fff",

    width: "100%",

    fontFamily: 'inherit',

  },

  weatherSearchBtn: {

    padding: "10px 16px",

    borderRadius: 10,

    border: "none",

    background: "linear-gradient(90deg, #007bff, #00bfff)", 

    color: "white",

    fontSize: 16,

    cursor: "pointer",

    fontWeight: 600,

    marginTop: 8,

    transition: "background-color 0.2s",

  },
  // --- GitHub 專屬樣式 ---
  githubSearchBtn: {
    padding: "10px 16px",
    borderRadius: 10,
    border: "none",
    background: "linear-gradient(90deg, #333, #666)", 
    color: "white",
    fontSize: 16,
    cursor: "pointer",
    fontWeight: 600,
    marginTop: 8,
    transition: "background-color 0.2s",
    width: '100%',
  },
  issueList: {
    display: 'grid',
    gap: 8,
    borderTop: '1px solid #c0d9c0',
    paddingTop: 12,
    marginTop: 12,
  },
  issueItem: {
    display: 'flex', 
    flexDirection: 'column',
    padding: '10px 12px',
    border: '1px solid #e0e0e0',
    borderRadius: 8,
    backgroundColor: '#fff',
    textDecoration: 'none',
    color: '#333',
    transition: 'background-color 0.2s, box-shadow 0.2s',
    ':hover': {
      backgroundColor: '#f5f5f5',
      boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    },
  },
  issueNumber: {
    fontWeight: 'bold',
    color: '#666',
    alignSelf: 'flex-end', 
    fontSize: 12,
    opacity: 0.8,
  },
  issueTitle: {
    fontWeight: 600,
    color: '#0366d6', 
    display: 'block',
    marginBottom: 4,
    fontSize: 15,
  },
  issueMeta: {
    fontSize: 11,
    color: '#888',
    display: 'block',
    textAlign: 'right',
    marginTop: 4,
  },
}