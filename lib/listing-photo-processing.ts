import sharp from "sharp";
import { createHash } from "node:crypto";

export const MAX_LISTING_PHOTO_BYTES=3_000_000;
export async function processListingPhoto(bytes:Uint8Array) {
  if(bytes.length<12||bytes.length>MAX_LISTING_PHOTO_BYTES) throw new Error("photo_size");
  const b=Buffer.from(bytes);
  const jpeg=b[0]===255&&b[1]===216&&b[2]===255;
  const png=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=b.toString("ascii",0,4)==="RIFF"&&b.toString("ascii",8,12)==="WEBP";
  const heif=b.toString("ascii",4,8)==="ftyp"&&["heic","heix","hevc","hevx","mif1","avif","avis"].includes(b.toString("ascii",8,12));
  if(!jpeg&&!png&&!webp&&!heif) throw new Error("photo_format");
  try {
    const decoder=sharp(b,{limitInputPixels:24_000_000,failOn:"warning",animated:false}).timeout({seconds:10});
    const meta=await decoder.metadata();
    if((meta.pages??1)>1||!meta.width||!meta.height||Math.min(meta.width,meta.height)<300) throw new Error("photo_dimensions");
    // rotate applies EXIF orientation; default re-encoding strips EXIF/GPS/IPTC/XMP.
    const out=await decoder.rotate().resize({width:1800,height:1800,fit:"inside",withoutEnlargement:true}).webp({quality:85}).toBuffer({resolveWithObject:true});
    if(out.data.length>1_500_000||Math.min(out.info.width,out.info.height)<300) throw new Error("photo_dimensions");
    return {bytes:out.data,width:out.info.width,height:out.info.height,sha256:createHash("sha256").update(out.data).digest("hex")};
  }catch(error){
    if(error instanceof Error&&error.message==="photo_dimensions") throw error;
    throw new Error(heif?"photo_heic_unavailable":"photo_decode");
  }
}
