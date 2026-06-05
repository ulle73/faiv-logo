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
  margin