'use strict';

const fs   = require('fs');
const path = require('path');
const { generateDialogue } = require('./src/dialogue');
const { renderComic }      = require('./src/renderer');

async function main() {
  const args  = process.argv.slice(2);
  const topic = args.join(' ').trim();

  if (!topic) {
    console.error('Usage: node index.js <topic>');
    console.error('');
    console.error('Examples:');
    console.error('  node index.js "remote work struggles"');
    console.error('  node index.js "AI in marketing"');
    console.error('  node index.js "Monday mornings"');
    process.exit(1);
  }

  console.log(`\n🎨  Generating comic: "${topic}"\n`);

  // ── Step 1: Generate dialogue via Claude ──────────────────────────────────
  console.log('✏️   Writing script with Claude…');
  let comicData;
  try {
    comicData = await generateDialogue(topic);
  } catch (err) {
    console.error('❌  Failed to generate dialogue:', err.message);
    process.exit(1);
  }

  console.log(`✅  Script ready — ${comicData.panels.length} panels`);
  comicData.panels.forEach((p, i) => {
    p.characters.forEach(c => {
      console.log(`    Panel ${i + 1} [${c.id}/${c.expression}]: ${c.dialogue}`);
    });
  });

  // ── Step 2: Render the comic strip ────────────────────────────────────────
  console.log('\n🖼️   Rendering comic strip…');
  let imageBuffer;
  try {
    imageBuffer = renderComic(comicData.panels, topic);
  } catch (err) {
    console.error('❌  Failed to render comic:', err.message);
    process.exit(1);
  }

  // ── Step 3: Save to file ─────────────────────────────────────────────────
  const safeName = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  const filename   = `comic_${safeName}.png`;
  const outputPath = path.resolve(process.cwd(), filename);

  fs.writeFileSync(outputPath, imageBuffer);

  console.log(`✅  Comic saved → ${outputPath}`);
  console.log(`    Size: ${(imageBuffer.length / 1024).toFixed(1)} KB\n`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
