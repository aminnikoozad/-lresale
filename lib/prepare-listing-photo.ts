// Local compression only. The server independently decodes, validates and strips metadata.
export async function prepareListingPhoto(file: File): Promise<File> {
  if (!/\.(jpe?g|png|webp|avif|hei[cf])$/i.test(file.name)) throw new Error('format');
  if (file.size > 25_000_000) throw new Error('source_size');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('decode')), 15_000);
      image.onload = () => { clearTimeout(timer); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error('decode')); };
      image.src = url;
    });
    const w = image.naturalWidth, h = image.naturalHeight;
    if (!w || !h || w * h > 50_000_000 || Math.min(w, h) < 300) throw new Error('dimensions');
    const scale = Math.min(1, 1800 / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    if (Math.min(canvas.width, canvas.height) < 300) throw new Error('dimensions');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('decode');
    // Flatten transparent backgrounds; modern browsers apply EXIF orientation when drawing.
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    try {
      for (const quality of [0.88, 0.78, 0.68]) {
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (blob && blob.size > 0 && blob.size <= 3_000_000)
          return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {type: 'image/jpeg'});
      }
      throw new Error('compression');
    } finally { canvas.width = 0; canvas.height = 0; }
  } finally { image.src = ''; URL.revokeObjectURL(url); }
}
