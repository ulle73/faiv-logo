const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const upload = multer({ dest: os.tmpdir() });
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

app.use(express.static('public'));

function safeFileName(name) {
  return path.basename(name).replace(/\.[^.]+$/, '.jpg');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

async function makeLogoBuffer(logoPath, targetWidth) {
  return sharp(logoPath)
    .resize({ width: Math.max(24, Math.round(targetWidth)), withoutEnlargement: true })
    .png()
    .toBuffer();
}

async function getLogoSize(buffer) {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width || 0, height: meta.height || 0 };
}

async function processImage(filePath) {
  const meta = await sharp(filePath).metadata();
  const width = meta.width || 1024;
  const height = meta.height || 1024;

  const margin = Math.max(8, Math.round(Math.min(width, height) * 0.03));
  const maxLogoWidth = Math.max(24, Math.round(width * 0.22));

  const faivLogo = await makeLogoBuffer('logos/faiv.png', maxLogoWidth);
  const lumenLogo = await makeLogoBuffer('logos/lumen.png', maxLogoWidth);
  const faivSize = await getLogoSize(faivLogo);
  const lumenSize = await getLogoSize(lumenLogo);

  const faivLeft = margin;
  const faivTop = margin;
  const lumenLeft = Math.max(margin, width - lumenSize.width - margin);
  const lumenTop = Math.max(margin, height - lumenSize.height - margin);

  return sharp(filePath)
    .rotate()
    .composite([
      { input: faivLogo, left: faivLeft, top: faivTop },
      { input: lumenLogo, left: lumenLeft, top: lumenTop },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

app.post('/upload', upload.array('files'), async (req, res) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'faiv-'));

  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).send('No files uploaded');
    }

    const outZip = new AdmZip();
    let processedCount = 0;

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();

      if (ext === '.zip') {
        const zipDir = path.join(tempDir, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        fs.mkdirSync(zipDir, { recursive: true });
        new AdmZip(file.path).extractAllTo(zipDir, true);

        for (const img of walk(zipDir)) {
          if (!IMAGE_EXTENSIONS.includes(path.extname(img).toLowerCase())) continue;
          const buffer = await processImage(img);
          outZip.addFile(safeFileName(img), buffer);
          processedCount += 1;
        }
      } else if (IMAGE_EXTENSIONS.includes(ext)) {
        const buffer = await processImage(file.path);
        outZip.addFile(safeFileName(file.originalname), buffer);
        processedCount += 1;
      }
    }

    if (processedCount === 0) {
      return res.status(400).send('No supported images found');
    }

    const zipPath = path.join(tempDir, 'faiv-watermarked.zip');
    outZip.writeZip(zipPath);

    res.download(zipPath, 'faiv-watermarked.zip', () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      for (const file of req.files) fs.rmSync(file.path, { force: true });
    });
  } catch (e) {
    console.error(e);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (req.files) {
      for (const file of req.files) fs.rmSync(file.path, { force: true });
    }
    res.status(500).send('Processing failed');
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Running on http://localhost:3000');
});
