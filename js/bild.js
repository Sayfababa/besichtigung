// Fotos verkleinern (Canvas). Die Ausrichtung (Hochformat/Querformat aus der Kamera)
// wendet der Browser beim Laden selbst an.

function ladeBild(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve({ img, url }); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht gelesen werden')); };
    img.src = url;
  });
}

function canvasZuBlob(canvas, qualitaet) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Bild konnte nicht gespeichert werden'))), 'image/jpeg', qualitaet);
  });
}

async function skaliere(img, maxSeite, qualitaet) {
  const w0 = img.naturalWidth, h0 = img.naturalHeight;
  const f = Math.min(1, maxSeite / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * f)), h = Math.max(1, Math.round(h0 * f));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasZuBlob(c, qualitaet);
  c.width = c.height = 0; // Speicher am iPhone sofort freigeben
  return { blob, w, h };
}

// Liefert { gross, vorschau, w, h }
export async function verarbeiteFoto(datei) {
  const { img, url } = await ladeBild(datei);
  try {
    const gross = await skaliere(img, 1600, 0.85);
    const vorschau = await skaliere(img, 360, 0.72);
    return { gross: gross.blob, vorschau: vorschau.blob, w: gross.w, h: gross.h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Für den PDF-Bericht: kleinere Fassung als Daten-URL
export async function fuerPdf(blob, maxSeite = 1100, qualitaet = 0.75) {
  const { img, url } = await ladeBild(blob);
  try {
    const r = await skaliere(img, maxSeite, qualitaet);
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(r.blob);
    });
    return { dataUrl, w: r.w, h: r.h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
