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

const SETTINGS = {
  faivWidthPercent: 0.17,
  lumenWidthPercent: 0.16,
  marginLeftPercent: 0.04,
  marginTopPercent: 0.045,
  marginRightPercent: 0.045,
  marginBottomPercent: 0.045,
};

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

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
    .resize({ width: Math.max(24, Math.round(targetWidth)), withoutEnlargement: false })
    .png()
    .toBuffer();
}

async function getImageSize(buffer) {
  const meta = await sharp(buffer).metadata();
  return { width: meta.width || 0, height: meta.height || 0 };
}

async function processImage(filePath) {
  const imageBuffer = await sharp(filePath).rotate().toBuffer();
  const meta = await sharp(imageBuffer).metadata();
  const width = meta.width || 1024;
  const height = meta.height || 1024;

  const faivLogo = await makeLogoBuffer('logos/faiv.png', width * SETTINGS.faivWidthPercent);
  const lumenLogo = await makeLogoBuffer('logos/lumen.png', width * SETTINGS.lumenWidthPercent);
  const lumenSize = await getImageSize(lumenLogo);

  const faivLeft = Math.round(width * SETTINGS.marginLeftPercent);
  const faivTop = Math.round(height * SETTINGS.marginTopPercent);
  const lumenLeft = Math.round(width - lumenSize.width - width * SETTINGS.marginRightPercent);
  const lumenTop = Math.round(height - lumenSize.height - height * SETTINGS.marginBottomPercent);

  return sharp(imageBuffer)
    .composite([
      { input: faivLogo, left: faivLeft, top: faivTop },
      { input: lumenLogo, left: lumenLeft, top: lumenTop },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}

async function handleUpload(req, res) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'faiv-'));

  try {
    if (!req.files || req.files.length === 0) return res.status(400).send('No files uploaded');
    if (!fs.existsSync('logos/faiv.png') || !fs.existsSync('logos/lumen.png')) {
      return res.status(500).send('Missing logos/faiv.png or logos/lumen.png');
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

    if (processedCount === 0) return res.status(400).send('No supported images found');

    const zipPath = path.join(tempDir, 'faiv-watermarked.zip');
    outZip.writeZip(zipPath);
    res.download(zipPath, 'faiv-watermarked.zip', () => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      for (const file of req.files) fs.rmSync(file.path, { force: true });
    });
  } catch (error) {
    console.error(error);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (req.files) for (const file of req.files) fs.rmSync(file.path, { force: true });
    res.status(500).send('Processing failed');
  }
}

app.post('/upload', upload.array('files'), handleUpload);
app.post('/api/upload', upload.array('files'), handleUpload);

app.listen(process.env.PORT || 3000, () => {
  console.log('Running on http://localhost:3000');
});
