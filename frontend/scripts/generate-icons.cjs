/**
 * Script untuk generate Android launcher icons dari logo Populi Center.
 * 
 * Cara pakai:
 *   node scripts/generate-icons.cjs
 * 
 * Membutuhkan: sharp (npm install -D sharp)
 * Atau jalankan manual via Android Studio Image Asset Studio.
 */

const fs = require('fs');
const path = require('path');

// Android icon sizes
const ICON_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Foreground icon sizes (adaptive icon, 108dp with safe zone)
const FOREGROUND_SIZES = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.log('=== PETUNJUK MANUAL ===');
    console.log('');
    console.log('sharp tidak terinstall. Gunakan Android Studio Image Asset Studio:');
    console.log('');
    console.log('1. Buka Android Studio');
    console.log('2. Klik kanan folder "res" di panel Project');
    console.log('3. Pilih: New → Image Asset');
    console.log('4. Di "Foreground Layer":');
    console.log('   - Source Asset: Path → pilih file: frontend/public/logo-populi-center.png');
    console.log('   - Resize: 60%');
    console.log('5. Di "Background Layer":');
    console.log('   - Source Asset: Color → #FFFFFF (putih)');
    console.log('6. Klik Next → Finish');
    console.log('');
    console.log('Ini akan otomatis generate semua ukuran icon yang dibutuhkan.');
    return;
  }

  const sourceLogo = path.join(__dirname, '..', 'public', 'logo-populi-center.png');
  const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

  if (!fs.existsSync(sourceLogo)) {
    console.error('Logo tidak ditemukan:', sourceLogo);
    process.exit(1);
  }

  console.log('Generating Android icons from:', sourceLogo);

  // Generate launcher icons (square with padding)
  for (const [folder, size] of Object.entries(ICON_SIZES)) {
    const outDir = path.join(resDir, folder);
    fs.mkdirSync(outDir, { recursive: true });

    // ic_launcher.png — square icon with white background
    await sharp(sourceLogo)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(outDir, 'ic_launcher.png'));

    // ic_launcher_round.png — same but will be masked as circle by Android
    await sharp(sourceLogo)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(outDir, 'ic_launcher_round.png'));

    console.log(`  ✓ ${folder}: ${size}x${size}px`);
  }

  // Generate foreground icons (adaptive icon)
  for (const [folder, size] of Object.entries(FOREGROUND_SIZES)) {
    const outDir = path.join(resDir, folder);
    fs.mkdirSync(outDir, { recursive: true });

    // Logo centered with padding (safe zone is 66% of total)
    const logoSize = Math.round(size * 0.55);
    const padding = Math.round((size - logoSize) / 2);

    await sharp(sourceLogo)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: padding,
        bottom: size - logoSize - padding,
        left: padding,
        right: size - logoSize - padding,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(path.join(outDir, 'ic_launcher_foreground.png'));

    console.log(`  ✓ ${folder} foreground: ${size}x${size}px`);
  }

  console.log('\nDone! Icons generated successfully.');
}

main().catch(console.error);
