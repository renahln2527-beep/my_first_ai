# Kiddo World 奇妙世界

针对 7 岁儿童的英语启蒙 Web App：通过照顾电子宠物激励孩子学习英语。

## 文件结构

```
├── index.html      # 单页入口，Tailwind CDN + 主布局
├── data.js         # 词汇表 vocabularyList（挂载到 window）
├── js/
│   ├── store.js    # LocalStorage：宠物状态、苹果数、学习时长、学会/错词
│   ├── pet.js      # 宠物养成：饥饿度、进化、喂食、拖拽苹果
│   ├── learn.js    # 学习区：听/说/读/写四关，得苹果与飞入背包动画
│   └── app.js      # 主应用：视图、家长锁、护眼休息、魔法绘本 Mock
└── README.md
```

## 运行方式

直接用浏览器打开 `index.html` 即可，无需构建。建议用本地服务器（如 `npx serve .`）以便麦克风等权限正常。

## 功能概览

- **学习即喂养**：完成听/说/读/写任务得苹果，苹果飞入右下角背包。
- **宠物养成**：左下角宠物（蛋→小鸡→恐龙），饥饿度随时间和离线递减，拖拽苹果喂食。
- **魔法绘本**：输入关键词生成英文短文并朗读（当前为 Mock，可接真实 API）。
- **家长入口**：右上角锁头，答对乘法题后查看今日学习时长、学会单词、错词。
- **护眼**：连续使用 20 分钟后强制休息 2 分钟。

## 技术栈

HTML5、Tailwind CSS（CDN）、原生 JavaScript、LocalStorage、Web Speech API（TTS/STT）。
