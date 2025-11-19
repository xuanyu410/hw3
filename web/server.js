// server.js (Node.js/Express 伺服器)

// 載入環境變數
require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
// 建議使用 Node.js 內建的 fetch，如果你的 Node.js 版本較舊（<18），才需要安裝 node-fetch
const fetch = global.fetch || require('node-fetch'); 

const app = express();
const PORT = 3001; // 選擇一個與前端不同的埠號，例如 3001

// 允許跨域請求 (CORS)
app.use(cors()); 

// 取得環境變數中的變數
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER; 
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;   

// 檢查 API Key 和 GitHub 設置
if (!OPENWEATHER_API_KEY) {
    console.error("錯誤: OPENWEATHER_API_KEY 未在 .env 檔案中設定！");
    process.exit(1);
}
if (!GITHUB_REPO_OWNER || !GITHUB_REPO_NAME) {
    console.error("警告: GITHUB_REPO_OWNER 或 GITHUB_REPO_NAME 未在 .env 檔案中設定。GitHub Issue 路由可能無法正常運作。");
}


// --- 路由 1: OpenWeather 天氣代理 ---
app.get('/api/weather-proxy', async (req, res) => {
    // 1. 從前端獲取參數 (城市和日期)
    const { city, date } = req.query;

    if (!city || !date) {
        return res.status(400).json({ error: "缺少必要的 city 或 date 參數" });
    }

    const cityEncoded = encodeURIComponent(city);
    // OpenWeather 5天/3小時預報 URL
    const weatherUrl = `http://api.openweathermap.org/data/2.5/forecast?q=${cityEncoded}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=zh_cn`;

    try {
        const response = await fetch(weatherUrl);
        const json = await response.json();

        if (json.cod !== "200") {
            // OpenWeather API 返回的錯誤，例如城市不存在
            return res.status(404).json({ 
                error: json.message || "無法獲取天氣數據，請檢查城市名稱。",
            });
        }
        
        // 2. 根據日期篩選數據
        const targetDate = date; // 格式: YYYY-MM-DD
        
        // 尋找目標日期中午 12 點左右的預報
        const targetForecast = json.list.find(forecast => {
            // forecast.dt_txt 格式是 "YYYY-MM-DD HH:MM:SS"
            return forecast.dt_txt.startsWith(targetDate) && forecast.dt_txt.includes("12:00:00");
        });

        if (!targetForecast) {
            // 如果找不到，則取目標日期的第一個預報
            const firstForecastForTargetDay = json.list.find(forecast => forecast.dt_txt.startsWith(targetDate));
            if (firstForecastForTargetDay) {
                return res.json({ 
                    forecast: firstForecastForTargetDay,
                    city: json.city.name 
                });
            }
            return res.status(404).json({ 
                error: `找不到 ${targetDate} 的天氣預報數據。請嘗試更改日期或地點。` 
            });
        }
        
        // 3. 成功回傳目標預報數據
        res.json({ 
            forecast: targetForecast,
            city: json.city.name 
        });

    } catch (error) {
        console.error("OpenWeather API 呼叫錯誤:", error);
        res.status(500).json({ error: "伺服器在呼叫外部 API 時發生錯誤。" });
    }
});


// --- 路由 2: GitHub Issue 代理 (新增) ---
app.get('/api/github-issues', async (req, res) => {
    const owner = GITHUB_REPO_OWNER;
    const repo = GITHUB_REPO_NAME;
    
    if (!owner || !repo) {
        return res.status(500).json({ error: "伺服器未設定 GitHub 專案資訊 (.env 檔案缺少 GITHUB_REPO_OWNER 或 GITHUB_REPO_NAME)" });
    }

    // 取得公開的 Issue (Open State), 依最新建立時間排序
    const issuesUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&sort=created&direction=desc&per_page=5`;
    
    try {
        const githubResponse = await fetch(issuesUrl, {
            // 建議在 Header 中包含 User-Agent (使用 owner 名稱即可)
            headers: {
                'User-Agent': owner,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        const issuesJson = await githubResponse.json();

        if (!githubResponse.ok) {
            // 如果儲存庫不存在或設定錯誤，會返回 404/403
            return res.status(githubResponse.status).json({ 
                error: issuesJson.message || "查詢 GitHub Issue 失敗。",
                detail: `請檢查儲存庫 ${owner}/${repo} 是否公開且名稱正確。`
            });
        }

        // 篩選出需要的資訊後回傳給前端
        const simplifiedIssues = issuesJson.map(issue => ({
            number: issue.number,
            title: issue.title,
            url: issue.html_url,
            user: issue.user.login,
            // 格式化日期：例如 "11/19"
            createdAt: new Date(issue.created_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })
        }));
        
        res.json(simplifiedIssues);

    } catch (error) {
        console.error("GitHub API 呼叫錯誤:", error);
        res.status(500).json({ error: "伺服器在呼叫 GitHub API 時發生錯誤。" });
    }
});


// --- 啟動伺服器 ---
app.listen(PORT, () => {
    console.log(`✅ 後端代理伺服器已啟動，正在監聽 http://localhost:${PORT}`);
});