import { GoogleGenerativeAI } from "@google/generative-ai";
import React, { useEffect, useMemo, useRef, useState } from "react";

export default function FortuneChat({
  defaultModel = "gemini-2.5-flash",
}) {
  const [model, setModel] = useState(defaultModel);
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rememberKey, setRememberKey] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fortune, setFortune] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("gemini_api_key");
    if (saved) setApiKey(saved);
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
  }, [history, loading]);

  const ai = useMemo(() => {
    try {
      return apiKey ? new GoogleGenerativeAI(apiKey) : null;
    } catch {
      return null;
    }
  }, [apiKey]);

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
          <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {ln}
          </div>
        ))}
      </>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.header}>🔮 運勢小助手</div>

        <div style={styles.controls}>
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

        <div ref={listRef} style={styles.messages}>
          {history.map((m, idx) => (
            <div
              key={idx}
              style={{
                ...styles.msg,
                ...(m.role === "user" ? styles.user : styles.assistant),
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
        </div>

        {/* ✨ 運勢摘要卡 */}
        {fortune && (
          <div style={styles.fortuneCard}>
            <h3>🌟 今日運勢摘要</h3>
            <p><strong>整體運勢：</strong>{fortune["運勢"] || "未知"}</p>
            <p><strong>幸運色：</strong>{fortune["幸運色"] || "?"}</p>
            <p><strong>幸運圖案：</strong>{fortune["幸運圖案"] || "?"}</p>
          </div>
        )}

        {error && <div style={styles.error}>⚠ {error}</div>}

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
      </div>
    </div>
  );
}

const styles = {
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
  controls: {
    display: "grid",
    gap: 12,
    gridTemplateColumns: "1fr",
    padding: 14,
    background: "#fff8dc",
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
  msgRole: { fontSize: 12, fontWeight: 700, opacity: 0.8, marginBottom: 4 },
  msgBody: { fontSize: 14 },
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
};
