# 记账本

个人用的手机记账应用。账只留在这台手机上，不上传服务器。

金额按整数分记账，避免浮点误差。账单按时间倒序排列。月结可以设置支出上限，也可以从每月某一天起算一个周期。外观可以更换配色、按钮、间距、背景图和粒子效果。

## 技术

- 页面：HTML、CSS、JavaScript
- 客户端：Capacitor Android，包名 `com.ouyang.ledger`
- 数据：账本存在 `localStorage`，背景图存在 IndexedDB

## 本地运行

```bash
npm install
node --test logic.test.mjs
```

页面可以直接打开 `index.html`。打包 Android 前先执行：

```bash
node scripts/copy-www.mjs
npx cap copy android
```

然后在 `android` 目录执行 `gradlew assembleDebug`。
