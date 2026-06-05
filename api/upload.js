const formidableModule = require('formidable');
const formidable = formidableModule.formidable || formidableModule.default || formidableModule;
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
