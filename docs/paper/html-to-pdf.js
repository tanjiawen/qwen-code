/* eslint-disable */
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const htmlPath = path.join(__dirname, 'qwen-code-technical-paper.html');
  const pdfPath = path.join(__dirname, 'qwen-code-technical-paper.pdf');

  console.log('🚀 启动 Chromium...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  console.log('📄 加载 HTML...');
  await page.goto(`file://${htmlPath}`, {
    waitUntil: 'networkidle0',
    timeout: 60000,
  });

  // 等待 Mermaid.js 渲染完成
  console.log('⏳ 等待 Mermaid 图表渲染...');
  await page.waitForFunction(
    () => {
      const mermaidDivs = document.querySelectorAll('.mermaid');
      if (mermaidDivs.length === 0) return true;
      // 检查所有 mermaid div 是否都包含 svg
      return Array.from(mermaidDivs).every((div) => div.querySelector('svg'));
    },
    { timeout: 30000 },
  );

  // 额外等待确保渲染稳定
  await new Promise((r) => setTimeout(r, 2000));

  console.log('🖨️  生成 PDF...');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '2.5cm', bottom: '2.5cm', left: '2cm', right: '2cm' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate:
      '<div style="font-size:8px;width:100%;text-align:center;color:#666;padding-top:10px;">Qwen Code: 终端原生 AI 编码代理的技术架构</div>',
    footerTemplate:
      '<div style="font-size:8px;width:100%;text-align:center;color:#666;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
  });

  await browser.close();
  const fs = require('fs');
  const size = (fs.statSync(pdfPath).size / 1024).toFixed(0);
  console.log(`✅ PDF 已生成: ${pdfPath}`);
  console.log(`   文件大小: ${size} KB`);
})();
