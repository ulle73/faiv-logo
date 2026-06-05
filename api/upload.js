const formidable = require('formidable');
const AdmZip = require('adm-zip');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

const SETTINGS = {
  faivWidthPercent: 0.17,
  lumenWidthPercent: 0.16,
  marginLeftPercent: 0.04,
  marginTopPercent: 0.045,
  marginRightPercent: 0.045,
  marginBottomPercent: 0.045,
};

module.exports.config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
  maxDuration: 60,
};

function parseForm(req) {
  const form = formidable({
    multiples: true,
    uploadDir: os.tmpdir(),
    keepExtensions: true,
    maxFileSize: 200 * 1024 * 1024,
    maxTotalFileSize: 250 * 1024 * 1024,
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getFilePath(file) {
  return file.filepath || file.path;
}

function getOriginalName(file) {
  return file.originalFilename || file.name || 'image.jpg';
}

function safeFileName(name, fallbackIndex) {
  const base = path.basename(name || `image-${fallbackIndex}.jpg`).replace(/\.[^.]+$/, '');
  return `${base || `image-${fallbackIndex}`}.jpg`;
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
  return {
    width: meta.width || 0,
    height: meta.height || 0,
  };
}

async function processImage(filePath) {
  const imageBuffer = await sharp(filePath).rotate().toBuffer();
  const meta = await sharp(imageBuffer).metadata();

  const width = meta.width || 1024;
  const height = meta.height || 1024;

  const faivLogo = await makeLogoBuffer(path.join(process.cwd(), 'logos/faiv.png'), width * SETTINGS.faivWidthPercent);
  const lumenLogo = await makeLogoBuffer(path.join(process.cwd(), 'logos/lumen.png'), width * SETTINGS.lumenWidthPercent);

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'faiv-'));
  const uploadedPaths = [];

  try {
    const faivPath = path.join(process.cwd(), 'logos/faiv.png');
    const lumenPath = path.join(process.cwd(), 'logos/lumen.png');

    if (!fs.existsSync(faivPath) || !fs.existsSync(lumenPath)) {
      return res.status(500).send('Missing logos/faiv.png or logos/lumen.png');
    }

    const { files } = await parseForm(req);
    const uploadedFiles = asArray(files.files);

    if (uploadedFiles.length === 0) {
      return res.status(400).send('No files uploaded');
    }

    const outZip = new AdmZip();
    let processedCount = 0;

    for (const file of uploadedFiles) {
      const filePath = getFilePath(file);
      const originalName = getOriginalName(file);
      const ext = path.extname(originalName).toLowerCase();
      uploadedPaths.push(filePath);

      if (ext === '.zip') {
        const zipDir = path.join(tempDir, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        fs.mkdirSync(zipDir, { recursive: true });
        new AdmZip(filePath).extractAllTo(zipDir, true);

        for (const img of walk(zipDir)) {
          if (!IMAGE_EXTENSIONS.includes(path.extname(img).toLowerCase())) continue;
          const buffer = await processImage(img);
          outZip.addFile(safeFileName(img, processedCount + 1), buffer);
          processedCount += 1;
        }
      } else if (IMAGE_EXTENSIONS.includes(ext)) {
        const buffer = await processImage(filePath);
        outZip.addFile(safeFileName(originalName, processedCount + 1), buffer);
        processedCount += 1;
      }
    }

    if (processedCount === 0) {
      return res.status(400).send('No supported images found');
    }

    const zipBuffer = outZip.toBuffer();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="faiv-watermarked.zip"');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(zipBuffer);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Processing failed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    for (const filePath of uploadedPaths) {
      fs.rmSync(filePath, { force: true });
    }
  }
};
