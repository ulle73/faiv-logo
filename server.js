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

// Adjust these values if you want to fine tune the exact look.
// The