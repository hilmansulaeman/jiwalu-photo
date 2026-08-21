import { getFrameSettings } from './frameConfig.js';
import { DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH, fetchCustomFrames, normalizeFrameConfig, validateFrameConfig } from './customFrameConfig.js';
import { getBackendApiUrl } from './backendApi.js';

export const TIERS = [
  { id: 'basic', name: 'Basic', pricePerHead: 35000, poseLimit: 8, printLimit: 1 },
  { id: 'standard', name: 'Standard', pricePerHead: 50000, poseLimit: 16, printLimit: 2 },
  { id: 'premium', name: 'Premium', pricePerHead: 75000, poseLimit: 24, printLimit: 4 },
];

export const FILTERS = [
  { id: 'normal', name: 'Normal', css: 'none' },
  { id: 'bw', name: 'Black & White', css: 'grayscale(1) contrast(1.08)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.45) contrast(0.95) saturate(0.9)' },
  { id: 'warm', name: 'Warm', css: 'sepia(0.16) saturate(1.28) brightness(1.04)' },
  { id: 'cool', name: 'Cool', css: 'saturate(1.1) hue-rotate(175deg) brightness(1.02)' },
  { id: 'bright', name: 'Bright', css: 'brightness(1.18) contrast(1.02)' },
  { id: 'contrast', name: 'Contrast', css: 'contrast(1.28) saturate(1.08)' },
];

export const FILTER_CATEGORIES = {
  ALL: [],
  ESSENTIAL: ['ORIGINAL', 'BRIGHTEN', 'DARKEN', 'WARM', 'COOL', 'BLUR', 'SHARPEN', 'BEAUTY', 'CONTRAST +', 'CONTRAST -', 'SATURATION +', 'SATURATION -'],
  RETRO: ['CINEMATIC', 'VINTAGE', 'WARM VINTAGE', 'SEPIA', 'OLD FILM', 'VINTAGE SCR...', 'RETRO PURPLE', 'RETRO TEAL', 'RETRO GOLD', 'RETRO ROSE', 'KODACHROME', 'TECHNICOLOR'],
  FUN: ['GLITCH', 'PURE NOISE', 'PIXELATE', 'ASCII', 'REFLECTION', 'EMBOSS', 'BLOCKY', '3D STRONG', 'NIGHT VISION', 'X-RAY', 'CARTOON', 'COMIC'],
  COOL: ['DREAMY', 'CHROMATIC', 'BLOOM', 'TILT SHIFT'],
  CUSTOM: []
};

Object.keys(FILTER_CATEGORIES).forEach(k => {
  if (k !== 'ALL') FILTER_CATEGORIES.ALL.push(...FILTER_CATEGORIES[k]);
});

export const FRAMES = [
  { id: 'clean', name: 'Clean White', tone: '#ffffff', accent: '#111827', type: 'basic' },
  { id: 'birthday', name: 'Birthday', tone: '#ffec99', accent: '#ff4d8d', type: 'premium' },
  { id: 'birthday-cake', name: 'Birthday Kue', tone: '#fff1f2', accent: '#f43f5e', type: 'premium' },
  { id: 'wedding', name: 'Wedding', tone: '#fffaf0', accent: '#c8a96a', type: 'premium' },
  { id: 'wedding-cake', name: 'Wedding Kue', tone: '#fff7ed', accent: '#b48a5a', type: 'special' },
  { id: 'retro', name: 'Retro Strip', tone: '#f6efe4', accent: '#e05a47', type: 'basic' },
  { id: 'fun', name: 'Fun Colorful', tone: '#d9f99d', accent: '#1d4ed8', type: 'premium' },
  { id: 'holiday-beach', name: 'Holiday Pantai', tone: '#dff8ff', accent: '#f59e0b', type: 'special' },
  { id: 'holiday-mountain', name: 'Holiday Gunung', tone: '#ecfdf5', accent: '#15803d', type: 'special' },
  { id: 'holiday-island', name: 'Holiday Pulau', tone: '#e0f2fe', accent: '#0f766e', type: 'special' },
];

export const PHOTO_MODES = [
  { id: 'layout-3', name: '3 Foto', count: 3, columns: 1, description: 'Tiga foto vertikal' },
  { id: 'layout-4', name: '4 Foto', count: 4, columns: 1, description: 'Empat foto vertikal' },
  { id: 'layout-6', name: '6 Foto', count: 6, columns: 2, description: 'Enam foto grid 2 kolom' },
  { id: 'layout-8', name: '8 Foto', count: 8, columns: 2, description: 'Delapan foto grid 2 kolom' },
];

export const PAPER_SIZES = [
  { id: 'strip-2x6', name: 'Strip 2x6', width: 600, height: 1800, inchWidth: 2, inchHeight: 6, description: 'Strip photobooth 2 x 6 inch' },
  { id: '4r', name: '4R', width: 1200, height: 1800, inchWidth: 4, inchHeight: 6, description: 'Ukuran cetak 4 x 6 inch' },
  { id: '2r', name: '2R', width: 750, height: 1050, inchWidth: 2.5, inchHeight: 3.5, description: 'Ukuran cetak 2.5 x 3.5 inch' },
  { id: '3r', name: '3R', width: 1050, height: 1500, inchWidth: 3.5, inchHeight: 5, description: 'Ukuran cetak 3.5 x 5 inch' },
  { id: '5r', name: '5R', width: 1500, height: 2100, inchWidth: 5, inchHeight: 7, description: 'Ukuran cetak 5 x 7 inch' },
];

export const SAWERIA_QR_URL = 'https://saweria.co/widgets/qr?streamKey=7755a5f97b72d7496a127ffe24b563e8';
export const SAWERIA_PAGE_URL = 'https://saweria.co/FaukoDev';
export const SAWERIA_ALERT_URL = 'https://saweria.co/widgets/alert?streamKey=7755a5f97b72d7496a127ffe24b563e8';

export function getFilterStyle(filterId) {
  return FILTERS.find((filter) => filter.id === filterId)?.css ?? 'none';
}

const CUSTOM_FILTERS_CACHE = {};

export async function fetchCustomFilters() {
  try {
    const res = await fetch(`${getBackendApiUrl()}/api/admin/filters`);
    if (!res.ok) throw new Error('Failed to fetch filters');
    const json = await res.json();
    
    // Reset custom categories
    Object.keys(FILTER_CATEGORIES).forEach(k => {
      if (k !== 'ALL' && k !== 'ESSENTIAL' && k !== 'RETRO' && k !== 'FUN' && k !== 'COOL' && k !== 'CUSTOM') {
        delete FILTER_CATEGORIES[k];
      }
    });
    FILTER_CATEGORIES.CUSTOM = [];
    
    if (json.data && Array.isArray(json.data)) {
      json.data.forEach(filter => {
        const cat = filter.category || 'CUSTOM';
        if (!FILTER_CATEGORIES[cat]) {
          FILTER_CATEGORIES[cat] = [];
        }
        if (!FILTER_CATEGORIES[cat].includes(filter.name)) {
          FILTER_CATEGORIES[cat].push(filter.name);
        }
        CUSTOM_FILTERS_CACHE[filter.name.toUpperCase()] = filter.css;
      });
    }

    // Rebuild ALL category
    FILTER_CATEGORIES.ALL = [];
    Object.keys(FILTER_CATEGORIES).forEach(k => {
      if (k !== 'ALL') FILTER_CATEGORIES.ALL.push(...FILTER_CATEGORIES[k]);
    });
  } catch (err) {
    console.error('Error fetching custom filters:', err);
  }
}

export function getEditorFilterStyle(filterName) {
  const upperName = filterName?.toUpperCase();
  if (CUSTOM_FILTERS_CACHE[upperName]) {
    return CUSTOM_FILTERS_CACHE[upperName];
  }

  switch (upperName) {
    case 'B&W': return 'grayscale(100%)';
    case 'NEGATIVE': return 'invert(1)';
    case 'BRIGHTEN': return 'brightness(1.3)';
    case 'DARKEN': return 'brightness(0.7)';
    case 'WARM': return 'sepia(0.4) saturate(1.4) hue-rotate(-15deg)';
    case 'COOL': return 'saturate(1.2) hue-rotate(15deg) contrast(1.1)';
    case 'BLUR': return 'blur(3px)';
    case 'SHARPEN': return 'contrast(1.5) saturate(1.2)';
    case 'BEAUTY': return 'brightness(1.15) contrast(0.9) blur(0.5px)';
    case 'CONTRAST +': return 'contrast(1.4)';
    case 'CONTRAST -': return 'contrast(0.6)';
    case 'SATURATION +': return 'saturate(1.6)';
    case 'SATURATION -': return 'saturate(0.4)';
    case 'CINEMATIC': return 'contrast(1.3) saturate(0.8) sepia(0.3)';
    case 'VINTAGE': return 'sepia(0.6) contrast(1.2) brightness(0.9)';
    case 'SEPIA': return 'sepia(1)';
    case 'OLD FILM': return 'sepia(0.8) contrast(1.5) brightness(0.8) grayscale(0.5)';
    case 'RETRO PURPLE': return 'hue-rotate(45deg) saturate(1.5) contrast(1.2)';
    case 'RETRO TEAL': return 'hue-rotate(-45deg) saturate(1.5) contrast(1.2)';
    case 'NIGHT VISION': return 'sepia(1) hue-rotate(90deg) saturate(3) brightness(1.2)';
    case 'X-RAY': return 'invert(1) grayscale(1) contrast(2)';
    case 'GRAYSCALE': return 'grayscale(1)';
    case 'DREAMY': return 'brightness(1.2) contrast(0.8) blur(1px) saturate(1.2)';
    case 'BLOOM': return 'brightness(1.3) contrast(1.1) blur(0.5px)';
    default: return 'none';
  }
}

export function createDownloadName(date = new Date()) {
  const stamp = date.toISOString().replace(/\.\d{3}Z$/, '').replace('T', '-').replaceAll(':', '-');
  return `potobox-${stamp}.png`;
}

export function getPhotoCardLayout(modeId, paperSizeId = '4r') {
  const mode = PHOTO_MODES.find(m => m.id === modeId) || PHOTO_MODES[0];
  const paper = PAPER_SIZES.find(size => size.id === paperSizeId) || PAPER_SIZES[1];
  const columns = mode.columns || 1;
  const rows = Math.ceil(mode.count / columns);
  const padding = Math.round(paper.width * 0.07);
  const gap = Math.round(paper.width * 0.035);
  const logoHeight = Math.round(paper.height * 0.12);

  return {
    type: 'grid',
    width: paper.width,
    height: paper.height,
    paperSizeId: paper.id,
    paperName: paper.name,
    columns,
    rows,
    photoCount: mode.count,
    padding,
    gap,
    logoHeight,
  };
}

export function getPrintPaper(paperSizeId = '4r', orientation = 'portrait') {
  const paper = PAPER_SIZES.find(size => size.id === paperSizeId) || PAPER_SIZES[1];
  const landscape = orientation === 'landscape';
  const shouldSwap = landscape && paper.height > paper.width;
  return {
    ...paper,
    width: shouldSwap ? paper.height : paper.width,
    height: shouldSwap ? paper.width : paper.height,
    inchWidth: shouldSwap ? paper.inchHeight : paper.inchWidth,
    inchHeight: shouldSwap ? paper.inchWidth : paper.inchHeight,
    orientation: landscape ? 'landscape' : 'portrait',
  };
}

export async function composePhotoCard({ photos, filterId, frameId, frame, frameConfig, slotState, modeId, paperSizeId = '4r', mimeType = 'image/png' }) {
  if (!photos?.length) return null;

  // Fallback to modeCount for backward compatibility if needed, but we prefer modeId
  const layout = getPhotoCardLayout(modeId || 'layout-3', paperSizeId);
  const resolvedFrameId = frameId || frame?.id || '';
  const isCustom = resolvedFrameId.startsWith('custom_') || Boolean(frameConfig?.frameImage || frame?.frameImage || frame?.url);
  let customFrame = null;
  if (frameConfig) {
    customFrame = normalizeFrameConfig(frameConfig);
  } else if (frame && isCustom) {
    customFrame = normalizeFrameConfig(frame);
  } else if (isCustom) {
    const customFrames = await fetchCustomFrames();
    const fetchedFrame = customFrames.find(f => f.id === resolvedFrameId);
    customFrame = fetchedFrame ? normalizeFrameConfig(fetchedFrame) : null;
  }

  const customFrameValidation = customFrame ? validateFrameConfig(customFrame) : null;
  const hasCustomSlots = customFrameValidation?.isUsable && customFrame?.slots?.length > 0;

  // If the custom frame JSON provides specific canvas dimensions, use them.
  // Otherwise: custom frames default to 1080x1920 (Figma export default), grid frames use layout.
  const canvasWidth = hasCustomSlots
    ? (customFrame.width || DEFAULT_FRAME_WIDTH)
    : layout.width;
  const canvasHeight = hasCustomSlots
    ? (customFrame.height || DEFAULT_FRAME_HEIGHT)
    : layout.height;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = hasCustomSlots && customFrame.background ? customFrame.background : '#fffdf8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const loadedImages = await Promise.all(photos.map((photo) => loadImage(photo.src || photo)));

  if (hasCustomSlots) {
    // --- DRAW CUSTOM SLOTS ---
    customFrame.slots.forEach((slot, index) => {
      const transform = slotState?.[index] || {};
      if (!Number.isInteger(transform.photoIdx)) return;
      const photoIndex = transform.photoIdx;
      const img = loadedImages[((photoIndex % loadedImages.length) + loadedImages.length) % loadedImages.length];
      if (!img) return;
      const baseFilter = getFilterStyle(filterId);
      const slotFilter = getEditorFilterStyle(transform.filter || 'ORIGINAL');
      const combinedFilter = [baseFilter, slotFilter].filter((filter) => filter && filter !== 'none').join(' ') || 'none';

      drawPhotoInSlot(ctx, img, slot, transform, combinedFilter);
    });

  } else {
    const frameSettings = getFrameSettings();
    const logoY = layout.padding + layout.logoHeight * 0.36;

    ctx.fillStyle = '#17202a';
    ctx.font = `800 ${Math.round(layout.width * 0.04)}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(frameSettings.brandLine1, layout.width / 2, logoY);
    ctx.fillText(frameSettings.brandLine2, layout.width / 2, logoY + Math.round(layout.width * 0.045));

    if (frameSettings.showDate) {
      ctx.font = `400 ${Math.round(layout.width * 0.022)}px Inter, Arial, sans-serif`;
      const today = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
      ctx.fillText(today, layout.width / 2, logoY + Math.round(layout.width * 0.085));
    }

    const gridTop = layout.padding + layout.logoHeight;
    const gridHeight = layout.height - gridTop - layout.padding;
    const pWidth = (layout.width - layout.padding * 2 - layout.gap * (layout.columns - 1)) / layout.columns;
    const pHeight = (gridHeight - layout.gap * (layout.rows - 1)) / layout.rows;

    for (let i = 0; i < layout.photoCount; i++) {
      const transform = slotState?.[i] || {};
      if (!Number.isInteger(transform.photoIdx)) continue;
      const photoIndex = transform.photoIdx;
      const img = loadedImages[((photoIndex % loadedImages.length) + loadedImages.length) % loadedImages.length];
      if (!img) continue;
      const row = Math.floor(i / layout.columns);
      const col = i % layout.columns;
      const x = layout.padding + col * (pWidth + layout.gap);
      const y = gridTop + row * (pHeight + layout.gap);
      const baseFilter = getFilterStyle(filterId);
      const slotFilter = getEditorFilterStyle(transform.filter || 'ORIGINAL');
      const combinedFilter = [baseFilter, slotFilter].filter((filter) => filter && filter !== 'none').join(' ') || 'none';

      ctx.save();
      ctx.beginPath();
      roundRect(ctx, x, y, pWidth, pHeight, 18);
      ctx.clip();
      ctx.filter = combinedFilter;
      drawImageCover(ctx, img, x, y, pWidth, pHeight);
      ctx.filter = 'none';
      ctx.restore();

      ctx.lineWidth = Math.max(3, Math.round(layout.width * 0.005));
      ctx.strokeStyle = 'rgba(23, 32, 42, 0.12)';
      roundRect(ctx, x, y, pWidth, pHeight, 18);
      ctx.stroke();
    }
  }

  if (isCustom && hasCustomSlots) {
    if (customFrame?.frameImage) {
      try {
        // Must wait for image to load to draw it
        const overlayImg = await loadImage(customFrame.frameImage);
        ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
      } catch (e) {
        console.error('Failed to load custom frame image', e);
      }
    }
  } else {
    drawFrame(ctx, resolvedFrameId, canvas.width, canvas.height);
  }
  
  return canvas.toDataURL(mimeType, 0.95);
}

export async function composePhotoOutputs(options) {
  const digitalImage = await composePhotoCard(options);
  if (!digitalImage) {
    return { digitalImage: null, printImage: null, printMeta: null };
  }

  const customFrame = options.frameConfig
    ? normalizeFrameConfig(options.frameConfig)
    : options.frame
      ? normalizeFrameConfig(options.frame)
      : null;

  const templateType = customFrame?.templateType || 'print_sheet';
  const selectedPaper = getPrintPaper(options.paperSizeId || customFrame?.paperSize || '4r', customFrame?.orientation || options.orientation || 'portrait');
  const printMode = customFrame?.printMode || 'auto';
  const printCopies = Math.max(1, Math.min(Number(customFrame?.printCopies || options.printCopies || 1), 4));
  const shouldDuplicateStrip = templateType === 'strip' && printMode !== 'same' && selectedPaper.id !== 'strip-2x6';

  if (!shouldDuplicateStrip) {
    return {
      digitalImage,
      printImage: digitalImage,
      printMeta: {
        paperSizeId: selectedPaper.id,
        paperName: selectedPaper.name,
        width: selectedPaper.width,
        height: selectedPaper.height,
        inchWidth: selectedPaper.inchWidth,
        inchHeight: selectedPaper.inchHeight,
        orientation: selectedPaper.orientation,
        templateType,
        printMode,
        copies: 1,
      },
    };
  }

  const printImage = await composeStripPrintSheet({
    stripDataUrl: digitalImage,
    paper: selectedPaper,
    copies: printCopies,
    mimeType: options.mimeType || 'image/png',
  });

  return {
    digitalImage,
    printImage,
    printMeta: {
      paperSizeId: selectedPaper.id,
      paperName: selectedPaper.name,
      width: selectedPaper.width,
      height: selectedPaper.height,
      inchWidth: selectedPaper.inchWidth,
      inchHeight: selectedPaper.inchHeight,
      orientation: selectedPaper.orientation,
      templateType,
      printMode,
      copies: printCopies,
    },
  };
}

async function composeStripPrintSheet({ stripDataUrl, paper, copies = 2, mimeType = 'image/png' }) {
  paper = paper || getPrintPaper('4r');
  const canvas = document.createElement('canvas');
  canvas.width = paper.width;
  canvas.height = paper.height;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const stripImage = await loadImage(stripDataUrl);
  const safeCopies = Math.max(1, Math.min(Number(copies) || 2, 4));
  const gap = Math.round(canvas.width * 0.035);
  const padding = Math.round(canvas.width * 0.05);
  const slotWidth = (canvas.width - padding * 2 - gap * (safeCopies - 1)) / safeCopies;
  const slotHeight = canvas.height - padding * 2;
  const scale = Math.min(slotWidth / stripImage.naturalWidth, slotHeight / stripImage.naturalHeight);
  const drawWidth = stripImage.naturalWidth * scale;
  const drawHeight = stripImage.naturalHeight * scale;
  const y = (canvas.height - drawHeight) / 2;

  for (let i = 0; i < safeCopies; i += 1) {
    const x = padding + i * (slotWidth + gap) + (slotWidth - drawWidth) / 2;
    ctx.drawImage(stripImage, x, y, drawWidth, drawHeight);
  }

  return canvas.toDataURL(mimeType, 0.95);
}

export function drawFrame(ctx, frameId, width, height) {
  const frame = FRAMES.find((item) => item.id === frameId) ?? FRAMES[0];
  const border = Math.max(22, Math.round(Math.min(width, height) * 0.045));

  ctx.save();
  ctx.lineWidth = border;
  ctx.strokeStyle = frame.tone;
  ctx.strokeRect(border / 2, border / 2, width - border, height - border);

  if (frameId === 'clean') {
    ctx.lineWidth = Math.max(2, border * 0.08);
    ctx.strokeStyle = 'rgba(17, 24, 39, 0.2)';
    ctx.strokeRect(border, border, width - border * 2, height - border * 2);
  }

  if (frameId === 'birthday') {
    drawConfetti(ctx, width, height, border);
    drawRibbonText(ctx, 'HAPPY DAY', width, height, frame.accent);
  }

  if (frameId === 'birthday-cake') {
    drawCake(ctx, width / 2, height, border, frame.accent);
  }

  if (frameId === 'wedding') {
    drawCornerFlorals(ctx, width, height, border, frame.accent);
    drawRibbonText(ctx, 'JUST MARRIED', width, height, frame.accent);
  }

  if (frameId === 'wedding-cake') {
    drawCornerFlorals(ctx, width, height, border, frame.accent);
    drawCake(ctx, width / 2, height, border, frame.accent);
  }

  if (frameId === 'retro') {
    const innerBorder = border * 0.4;
    ctx.lineWidth = innerBorder;
    ctx.strokeStyle = frame.accent;
    ctx.strokeRect(border + innerBorder / 2, border + innerBorder / 2, width - border * 2 - innerBorder, height - border * 2 - innerBorder);
    drawRibbonText(ctx, 'CLASSIC', width, height, frame.accent);
  }

  if (frameId === 'fun') {
    drawFunFrame(ctx, width, height, border);
  }

  if (frameId === 'holiday-beach') {
    drawHolidayBeach(ctx, width, height, border);
    drawRibbonText(ctx, 'SUMMER VIBES', width, height, '#0284c7');
  }

  if (frameId === 'holiday-mountain') {
    drawHolidayMountain(ctx, width, height, border);
    drawRibbonText(ctx, 'WILD & FREE', width, height, '#065f46');
  }

  if (frameId === 'holiday-island') {
    drawHolidayIsland(ctx, width, height, border);
    drawRibbonText(ctx, 'TROPICAL PARADISE', width, height, '#115e59');
  }

  ctx.restore();
}

function drawImageCover(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const offsetX = x + (width - drawnWidth) / 2;
  const offsetY = y + (height - drawnHeight) / 2;
  ctx.drawImage(image, offsetX, offsetY, drawnWidth, drawnHeight);
}

function drawPhotoInSlot(ctx, image, slot, transform = {}, filter = 'none') {
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;
  const rx = -slot.width / 2;
  const ry = -slot.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  if (slot.rotate) {
    ctx.rotate((slot.rotate * Math.PI) / 180);
  }

  ctx.beginPath();
  roundRect(ctx, rx, ry, slot.width, slot.height, slot.borderRadius || 0);
  ctx.clip();

  ctx.filter = filter;
  ctx.translate(Number(transform.x || 0), Number(transform.y || 0));
  ctx.rotate(((Number(transform.rotate) || 0) * Math.PI) / 180);
  ctx.scale(
    (transform.flipH ? -1 : 1) * (Number(transform.zoom) || 1),
    (transform.flipV ? -1 : 1) * (Number(transform.zoom) || 1),
  );
  drawImageCover(ctx, image, rx, ry, slot.width, slot.height);
  ctx.filter = 'none';
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawRibbonText(ctx, text, width, height, color) {
  const fontSize = Math.max(18, Math.round(width * 0.035));
  ctx.font = `700 ${fontSize}px Inter, Arial, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.fillText(text, width / 2, height - fontSize * 1.15);
}

function drawConfetti(ctx, width, height, border) {
  const colors = ['#ff4d8d', '#22c55e', '#38bdf8', '#40a3eb', '#a855f7'];
  for (let index = 0; index < 42; index += 1) {
    const x = (index * 89) % width;
    const y = index % 2 === 0 ? (index * 41) % (border * 3) : height - ((index * 37) % (border * 3));
    ctx.fillStyle = colors[index % colors.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(index * 0.35);
    ctx.fillRect(-border * 0.08, -border * 0.22, border * 0.16, border * 0.44);
    ctx.restore();
  }
}

function drawCornerFlorals(ctx, width, height, border, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, border * 0.09);
  const size = border * 2.15;
  [
    [border * 0.75, border * 0.75, 1, 1],
    [width - border * 0.75, border * 0.75, -1, 1],
    [border * 0.75, height - border * 0.75, 1, -1],
    [width - border * 0.75, height - border * 0.75, -1, -1],
  ].forEach(([x, y, sx, sy]) => {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * size);
    ctx.quadraticCurveTo(x + sx * size * 0.6, y + sy * size * 0.45, x + sx * size, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(200, 169, 106, 0.26)';
    ctx.beginPath();
    ctx.ellipse(x + sx * size * 0.42, y + sy * size * 0.38, border * 0.28, border * 0.16, 0.8, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawFunFrame(ctx, width, height, border) {
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
  for (let i = 0; i < 26; i += 1) {
    ctx.fillStyle = colors[i % colors.length];
    const radius = border * (0.18 + (i % 3) * 0.04);
    const x = i % 2 === 0 ? border * 0.65 : width - border * 0.65;
    const y = border + ((height - border * 2) / 25) * i;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCake(ctx, centerX, baseY, border, color) {
  const width = border * 2.1;
  const layerHeight = border * 0.34;
  ctx.fillStyle = '#fff7ed';
  roundRect(ctx, centerX - width / 2, baseY - layerHeight * 2, width, layerHeight, layerHeight * 0.28);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, centerX - width * 0.4, baseY - layerHeight * 3, width * 0.8, layerHeight, layerHeight * 0.28);
  ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(centerX - border * 0.04, baseY - layerHeight * 3.65, border * 0.08, border * 0.32);
  ctx.beginPath();
  ctx.arc(centerX, baseY - layerHeight * 3.75, border * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawHolidayBeach(ctx, width, height, border) {
  ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
  ctx.fillRect(0, 0, width, border * 1.2);
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(width - border * 1.5, border * 1.25, border * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0ea5e9';
  ctx.lineWidth = Math.max(4, border * 0.12);
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    const y = height - border * (1.4 + i * 0.36);
    ctx.moveTo(border * 0.9, y);
    ctx.quadraticCurveTo(width * 0.33, y - border * 0.28, width * 0.58, y);
    ctx.quadraticCurveTo(width * 0.78, y + border * 0.24, width - border * 0.9, y);
    ctx.stroke();
  }
}

function drawHolidayMountain(ctx, width, height, border) {
  ctx.fillStyle = 'rgba(21, 128, 61, 0.18)';
  ctx.fillRect(0, 0, width, border * 1.2);
  const baseY = height - border * 0.72;
  [
    [border * 0.9, baseY, width * 0.25, height - border * 3.6, width * 0.48, baseY],
    [width * 0.42, baseY, width * 0.68, height - border * 3.25, width - border * 0.8, baseY],
  ].forEach((points) => {
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    ctx.lineTo(points[2], points[3]);
    ctx.lineTo(points[4], points[5]);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(points[2], points[3]);
    ctx.lineTo(points[2] - border * 0.32, points[3] + border * 0.62);
    ctx.lineTo(points[2] + border * 0.34, points[3] + border * 0.62);
    ctx.closePath();
    ctx.fill();
  });
}

function drawHolidayIsland(ctx, width, height, border) {
  ctx.fillStyle = 'rgba(15, 118, 110, 0.16)';
  ctx.fillRect(0, 0, width, border * 1.2);
  const trunkX = width - border * 1.7;
  const trunkY = height - border * 1.15;
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = border * 0.14;
  ctx.beginPath();
  ctx.moveTo(trunkX, trunkY);
  ctx.quadraticCurveTo(trunkX + border * 0.28, trunkY - border * 0.8, trunkX, trunkY - border * 1.5);
  ctx.stroke();
  ctx.fillStyle = '#0f766e';
  for (let i = 0; i < 5; i += 1) {
    ctx.save();
    ctx.translate(trunkX, trunkY - border * 1.58);
    ctx.rotate(-0.9 + i * 0.45);
    ctx.beginPath();
    ctx.ellipse(border * 0.42, 0, border * 0.55, border * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height - border * 0.72, width * 0.22, border * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}
