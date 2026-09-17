const puppeteer = require('puppeteer');
const path = require('path');

const cards = [
  { file: 'opening-mobile.html',  out: 'opening-mobile.jpg',  width: 1080, height: 1920 },
  { file: 'closing-mobile.html',  out: 'closing-mobile.jpg',  width: 1080, height: 1920 },
  { file: 'opening-youtube.html', out: 'opening-youtube.jpg', width: 1280, height: 720  },
  { file: 'closing-youtube.html', out: 'closing-youtube.jpg', width: 1280, height: 720  },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });

  for (const card of cards) {
    const page = await browser.newPage();
    await page.setViewport({ width: card.width, height: card.height, deviceScaleFactor: 2 });

    const url = `file://${path.resolve(__dirname, card.file)}`;
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Wait for Google Fonts to load
    await new Promise(r => setTimeout(r, 1500));

    const outPath = path.resolve(__dirname, card.out);
    await page.screenshot({
      path: outPath,
      type: 'jpeg',
      quality: 95,
      clip: { x: 0, y: 0, width: card.width, height: card.height },
    });

    console.log(`✓ ${card.out} (${card.width}×${card.height})`);
    await page.close();
  }

  await browser.close();
  console.log('\nAll cards saved to marketing/');
})();
