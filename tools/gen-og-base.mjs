// tools/gen-og-base.mjs
// Composites the left overlay + logo onto the branded OG card.
// Output: public/assets/share/og/homerates-og-base.png
// Run once: node tools/gen-og-base.mjs

import sharp from 'sharp';

const W = 1200, H = 630;

// SVG gradient overlay — dark on left, fades into dashboard graphics on right
const overlay = Buffer.from(`
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="52%" stop-color="#080c12" stop-opacity="1"/>
      <stop offset="100%" stop-color="#080c12" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
</svg>`);

// Resize logo to height 104px (transparent background — blends naturally)
const logo = await sharp('public/assets/homerates-logo-horizontal.png')
  .resize({ height: 104, fit: 'contain' })
  .png()
  .toBuffer({ resolveWithObject: true });

await sharp('public/assets/share/og/homerates-brand-default-og-1200x630-v1.png')
  .composite([
    { input: overlay, top: 0, left: 0, blend: 'over' },
    { input: logo.data, top: 40, left: 54, blend: 'over' },
  ])
  .png()
  .toFile('public/assets/share/og/homerates-og-base.png');

console.log('✅ Generated: public/assets/share/og/homerates-og-base.png');
