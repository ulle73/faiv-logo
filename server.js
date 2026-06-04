const express=require('express');
const multer=require('multer');
const AdmZip=require('adm-zip');
const sharp=require('sharp');
const fs=require('fs');
const path=require('path');
const os=require('os');

const app=express();
const upload=multer({dest:os.tmpdir()});
app.use(express.static('public'));

async function processImage(filePath,faivLogo,lumenLogo){
 const meta=await sharp(filePath).metadata();
 const width=meta.width;
 const height=meta.height;
 return sharp(filePath)
 .composite([
 {input:faivLogo,left:Math.round(width*0.03),top:Math.round(height*0.03)},
 {input:lumenLogo,left:Math.round(width*0.72),top:Math.round(height*0.85)}
 ])
 .jpeg({quality:92})
 .toBuffer();
}

app.post('/upload',upload.array('files'),async(req,res)=>{
 const tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'faiv-'));
 try{
 const faivLogo=await sharp('logos/faiv.png').resize({width:180}).png().toBuffer();
 const lumenLogo=await sharp('logos/lumen.png').resize({width:220}).png().toBuffer();
 const outZip=new AdmZip();
 for(const file of req.files){
 const ext=path.extname(file.originalname).toLowerCase();
 if(ext==='.zip'){
 const zipDir=path.join(tempDir,Date.now().toString());
 fs.mkdirSync(zipDir,{recursive:true});
 new AdmZip(file.path).extractAllTo(zipDir,true);
 const walk=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(dir,d.name)):[path.join(dir,d.name)]);
 for(const img of walk(zipDir)){
 if(!['.jpg','.jpeg','.png','.webp'].includes(path.extname(img).toLowerCase())) continue;
 const buffer=await processImage(img,faivLogo,lumenLogo);
 outZip.addFile(path.basename(img).replace(/\.[^.]+$/,'.jpg'),buffer);
 }
 } else if(['.jpg','.jpeg','.png','.webp'].includes(ext)) {
 const buffer=await processImage(file.path,faivLogo,lumenLogo);
 outZip.addFile(file.originalname.replace(/\.[^.]+$/,'.jpg'),buffer);
 }
 }
 const zipPath=path.join(tempDir,'result.zip');
 outZip.writeZip(zipPath);
 res.download(zipPath,'faiv-watermarked.zip');
 }catch(e){
 console.error(e);
 res.status(500).send('Processing failed');
 }
});

app.listen(process.env.PORT||3000,()=>console.log('Running'));
