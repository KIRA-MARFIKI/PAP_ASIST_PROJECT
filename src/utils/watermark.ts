/**
 * Utilitas watermarking terpusat untuk proteksi merek PaP Asist (PAP10.webp).
 * Semua fitur tangkapan kamera, unduhan gambar, maupun ekspor laporan (CSV/PDF/gambar)
 * di masa depan wajib menggunakan helper di file ini sebelum output disimpan atau diunduh.
 */

const DEFAULT_WATERMARK_SRC = '/PAP10.webp';

let cachedSpritePromise: Promise<HTMLCanvasElement> | null = null;
let cachedSpriteSrc = '';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat aset watermark: ${src}`));
    img.src = src;
  });
}

// Konversi latar putih solid pada PAP10.webp menjadi transparan agar stempel menyatu di foto terang maupun gelap.
async function getTransparentWatermarkSprite(watermarkSrc: string): Promise<HTMLCanvasElement> {
  if (cachedSpritePromise && cachedSpriteSrc === watermarkSrc) {
    return cachedSpritePromise;
  }

  cachedSpriteSrc = watermarkSrc;
  cachedSpritePromise = loadImage(watermarkSrc)
    .then((img) => {
      const targetHeight = 240;
      const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
      const targetWidth = Math.max(1, Math.round(targetHeight * aspect));

      const sprite = document.createElement('canvas');
      sprite.width = targetWidth;
      sprite.height = targetHeight;
      const ctx = sprite.getContext('2d');
      if (!ctx) return sprite;

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r > 235 && g > 235 && b > 235) {
          data[i + 3] = 0;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      return sprite;
    })
    .catch((err) => {
      cachedSpritePromise = null;
      throw err;
    });

  return cachedSpritePromise;
}

export async function applyWatermarkToCanvas(
  canvas: HTMLCanvasElement,
  watermarkSrc = DEFAULT_WATERMARK_SRC
): Promise<HTMLCanvasElement> {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    return canvas;
  }

  try {
    const sprite = await getTransparentWatermarkSprite(watermarkSrc);
    const minSide = Math.min(canvas.width, canvas.height);

    // Pola watermark diagonal halus di seluruh area gambar
    const tileHeight = Math.max(48, Math.round(minSide * 0.2));
    const tileWidth = Math.max(32, Math.round((tileHeight * sprite.width) / Math.max(1, sprite.height)));
    const stepX = Math.round(tileWidth * 2.2);
    const stepY = Math.round(tileHeight * 1.9);

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((-24 * Math.PI) / 180);

    const diag = Math.ceil(Math.hypot(canvas.width, canvas.height));
    for (let y = -diag; y <= diag; y += stepY) {
      for (let x = -diag; x <= diag; x += stepX) {
        ctx.drawImage(sprite, x, y, tileWidth, tileHeight);
      }
    }
    ctx.restore();

    // Tanda watermark sudut kanan bawah yang tetap rapi dan terbaca
    const badgeHeight = Math.max(34, Math.round(minSide * 0.12));
    const badgeWidth = Math.max(24, Math.round((badgeHeight * sprite.width) / Math.max(1, sprite.height)));
    const margin = Math.max(12, Math.round(minSide * 0.03));

    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.drawImage(
      sprite,
      canvas.width - badgeWidth - margin,
      canvas.height - badgeHeight - margin,
      badgeWidth,
      badgeHeight
    );
    ctx.restore();
  } catch {
    // Jika aset watermark gagal dimuat, biarkan canvas tetap dapat dipakai tanpa memblokir proses.
  }

  return canvas;
}

export async function applyWatermarkToImageFile(
  file: File,
  watermarkSrc = DEFAULT_WATERMARK_SRC
): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 800;
    canvas.height = img.naturalHeight || 600;

    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    await applyWatermarkToCanvas(canvas, watermarkSrc);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    );
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'pap-asist-part';
    return new File([blob], `${baseName}-pap.jpg`, { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function downloadWatermarkedImage(
  imageSrc: string,
  filename: string,
  watermarkSrc = DEFAULT_WATERMARK_SRC
): Promise<void> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || 800;
  canvas.height = img.naturalHeight || 800;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  await applyWatermarkToCanvas(canvas, watermarkSrc);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename.endsWith('.jpg') ? filename : `${filename}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
