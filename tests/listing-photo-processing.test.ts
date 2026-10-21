import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {processListingPhoto,MAX_LISTING_PHOTO_BYTES} from '../lib/listing-photo-processing.ts';
test('processed listing photos strip EXIF, decode actual bytes and bound output dimensions',async()=>{
 const source=await sharp({create:{width:2400,height:1600,channels:3,background:'#456b52'}}).jpeg().withMetadata({orientation:6}).withExif({IFD0:{Artist:'Synthetic test'},IFD2:{GPSLatitude:'45/1 30/1 0/1'}}).toBuffer();
 const result=await processListingPhoto(source);const meta=await sharp(result.bytes).metadata();
 assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);assert.equal(meta.xmp,undefined);assert.equal(meta.width,1200);assert.equal(meta.height,1800);assert.equal(result.sha256.length,64);
});
test('spoofed images, SVG, undersized and oversized uploads are rejected',async()=>{
 for(const bytes of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),Buffer.from([255,216,255,...Array(30).fill(0)]),Buffer.alloc(MAX_LISTING_PHOTO_BYTES+1)]) await assert.rejects(processListingPhoto(bytes));
 const small=await sharp({create:{width:100,height:100,channels:3,background:'red'}}).png().toBuffer();await assert.rejects(processListingPhoto(small),/photo_dimensions/);
});
