import { describe, expect, it } from 'vitest';
import {
  FILTERS,
  FRAMES,
  PAPER_SIZES,
  PHOTO_MODES,
  SAWERIA_ALERT_URL,
  SAWERIA_PAGE_URL,
  SAWERIA_QR_URL,
  createDownloadName,
  getPhotoCardLayout,
  getFilterStyle,
} from '../src/utils/photoConfig.js';

describe('photo configuration', () => {
  it('provides the required filter, frame, and photo mode choices', () => {
    expect(FILTERS.map((filter) => filter.id)).toEqual([
      'normal',
      'bw',
      'vintage',
      'warm',
      'cool',
      'bright',
      'contrast',
    ]);
    expect(FRAMES.map((frame) => frame.id)).toEqual([
      'clean',
      'birthday',
      'birthday-cake',
      'wedding',
      'wedding-cake',
      'retro',
      'fun',
      'holiday-beach',
      'holiday-mountain',
      'holiday-island',
    ]);
    expect(PHOTO_MODES.map((mode) => mode.id)).toEqual([
      'layout-3',
      'layout-4',
      'layout-6',
      'layout-8',
    ]);
    expect(PAPER_SIZES.map((paper) => paper.id)).toEqual(['strip-2x6', '4r', '2r', '3r', '5r']);
    expect(SAWERIA_QR_URL).toBe('https://saweria.co/widgets/qr?streamKey=7755a5f97b72d7496a127ffe24b563e8');
    expect(SAWERIA_PAGE_URL).toBe('https://saweria.co/FaukoDev');
    expect(SAWERIA_ALERT_URL).toBe('https://saweria.co/widgets/alert?streamKey=7755a5f97b72d7496a127ffe24b563e8');
  });

  it('returns card layouts for photo count and paper size modes', () => {
    expect(getPhotoCardLayout('layout-4', '4r')).toMatchObject({
      type: 'grid',
      paperSizeId: '4r',
      columns: 1,
      width: 1200,
      height: 1800,
      photoCount: 4,
    });
    expect(getPhotoCardLayout('layout-8', '2r')).toMatchObject({
      type: 'grid',
      paperSizeId: '2r',
      columns: 2,
      rows: 4,
      width: 750,
      height: 1050,
      photoCount: 8,
    });
    expect(getPhotoCardLayout('layout-3', 'strip-2x6')).toMatchObject({
      paperSizeId: 'strip-2x6',
      width: 600,
      height: 1800,
      photoCount: 3,
    });
  });

  it('returns browser CSS filter styles for selected filters', () => {
    expect(getFilterStyle('normal')).toBe('none');
    expect(getFilterStyle('bw')).toContain('grayscale');
    expect(getFilterStyle('unknown')).toBe('none');
  });

  it('creates stable png download filenames', () => {
    expect(createDownloadName(new Date('2026-04-21T10:30:05Z'))).toBe(
      'potobox-2026-04-21-10-30-05.png',
    );
  });
});
