// server.js (Node.js/Express 伺服器)

// 載入環境變數
require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
// 新版 Node.js 環境會使用內建 fetch，但為了確保舊版相容性，保留 node-fetch
const fetch = require('node-fetch'); 

const app = express();
// 部署關鍵修改 1：使用 Render 提供的 PORT 環境變數
const PORT = process.env.PORT || 3001; // 確保使用 process.env.PORT

// 允許跨域請求 (CORS)
app.use(cors());

// 取得環境變數中的 API Key 及 GitHub 相關變數
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER; // 從 .env 讀取預設 Owner
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME;   // 從 .env 讀取預設 Repo
const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN; // 新增 Token

// 檢查 API Key 是否存在
if (!OPENWEATHER_API_KEY) {
    console.error("錯誤: OPENWEATHER_API_KEY 未在 .env 檔案中設定！");
    process.exit(1);
}

// 輔助函式：建立 GitHub API 請求所需的 Headers (包含 Token)
function getGithubHeaders(owner) {
    const headers = {
        'User-Agent': owner,
        'Accept': 'application/vnd.github.v3+json',
    };
    if (GITHUB_ACCESS_TOKEN) {
        // 如果有設定 Token，則加入驗證 Header
        headers['Authorization'] = `token ${GITHUB_ACCESS_TOKEN}`;
    }
    return headers;
}

// --- 路由 1: OpenWeather 天氣代理 ---
// ... (此處省略，保持不變) ...
app.get('/api/weather-proxy', async (req, res) => {
    // 1. 從前端獲取參數 (城市和日期)
    const { city, date } = req.query;

    if (!city || !date) {
        return res.status(400).json({ error: "缺少 city 或 date 參數" });
    }

    const API_URL = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${OPENWEATHER_API_KEY}&units=metric&lang=zh_tw`;

    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (!response.ok) {
            // 如果 OpenWeather API 返回錯誤，通常是城市名稱錯誤
            return res.status(response.status).json({ 
                error: data.message || "查詢 OpenWeather API 失敗。",
                detail: `請檢查城市名稱是否正確。`
            });
        }
        
        // 篩選出目標日期 (date) 附近的預報 (取最近的，通常是當天中午)
        const targetDate = new Date(date);
        const targetForecast = data.list.reduce((closest, forecast) => {
            const forecastDate = new Date(forecast.dt_txt);
            // 只考慮目標日期之後的預報
            if (forecastDate >= targetDate && (!closest || (forecastDate - targetDate) < (new Date(closest.dt_txt) - targetDate))) {
                return forecast;
            }
            return closest;
        }, null);

        if (!targetForecast) {
            return res.status(404).json({ error: "找不到目標日期的天氣預報。" });
        }

        res.json({
            city: data.city.name, // 回傳實際查到的城市名
            forecast: targetForecast
        });
        
    } catch (error) {
        console.error("代理伺服器錯誤:", error);
        res.status(500).json({ error: "內部伺服器錯誤。" });
    }
});


// --- 路由 2: 🎯 新增 - 查詢指定使用者公開專案列表 ---
app.get('/api/github-repos', async (req, res) => {
    const owner = req.query.owner; // 從前端獲取使用者名稱
    if (!owner) {
        return res.status(400).json({ error: "缺少 owner 參數 (GitHub 使用者名稱)。" });
    }

    // 查詢該使用者公開儲存庫，依最近更新時間排序，只取前 10 個
    const reposUrl = `https://api.github.com/users/${owner}/repos?type=owner&sort=updated&direction=desc&per_page=10`;

    try {
        const githubResponse = await fetch(reposUrl, {
            headers: getGithubHeaders(owner) // 使用輔助函式
        });
        
        const reposJson = await githubResponse.json();

        if (!githubResponse.ok) {
            return res.status(githubResponse.status).json({ 
                error: reposJson.message || `查詢使用者 ${owner} 的專案列表失敗。`,
                detail: `請檢查使用者名稱是否正確，或是否超過 API 限制。`
            });
        }

        // 篩選出需要的資訊後回傳給前端
        const simplifiedRepos = reposJson
            .filter(repo => !repo.fork) // 只顯示非 Fork 的專案
            .map(repo => ({
                name: repo.name, // 專案名稱
                description: repo.description, // 專案描述
                language: repo.language, // 主要語言
                updatedAt: new Date(repo.updated_at).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) // 更新日期
            }));
        
        res.json(simplifiedRepos);

    } catch (error) {
        console.error("GitHub Repos 代理伺服器錯誤:", error);
        res.status(500).json({ error: "內部伺服器錯誤。" });
    }
});


// --- 路由 3: 🎯 修改 - 查詢指定專案的 Issues ---
app.get('/api/github-issues', async (req, res) => {
    // 透過查詢參數 (query params) 傳入 owner 和 repo
    const owner = req.query.owner || GITHUB_REPO_OWNER;
    const repo = req.query.repo || GITHUB_REPO_NAME;
    
    if (!owner || !repo) {
        return res.status(400).json({ error: "缺少專案擁有者 (owner) 或專案名稱 (repo) 參數。" });
    }

    // 查詢 Issue (Open State), 依最新建立時間排序
    const issuesUrl = `https://api.github.com/repos/${owner}/${repo}/issues?state=open&sort=created&direction=desc&per_page=5`;
    
    try {
        const githubResponse = await fetch(issuesUrl, {
            headers: getGithubHeaders(owner) // 使用輔助函式
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
            // 格式化日期
            createdAt: new Date(issue.created_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })
        }));
        
        res.json(simplifiedIssues);

    } catch (error) {
        console.error("GitHub Issues 代理伺服器錯誤:", error);
        res.status(500).json({ error: "內部伺服器錯誤。" });
    }
});


// --- 伺服器啟動 ---
app.listen(PORT, () => {
    console.log(`🚀 代理伺服器啟動，正在監聽埠號 http://localhost:${PORT}`);
});