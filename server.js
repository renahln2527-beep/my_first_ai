const express = require('express');
const path = require('path');
const tokenHandler = require('./api/token'); // 引入 token 逻辑

const app = express();
const port = 9000; // 阿里云 FC 默认监听 9000

// 1. 静态文件托管 (让 HTML/CSS/JS 能被访问)
app.use(express.static(path.join(__dirname, '.')));

// 2. API 路由 (接管 Vercel 的 serverless function)
app.get('/api/token', async (req, res) => {
  await tokenHandler(req, res);
});

// 3. 启动服务器
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
