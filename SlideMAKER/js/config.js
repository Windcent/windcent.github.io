/**
 * SlideMAKER - Configuration & Constants
 * Guides & Brand Colors inspired by Université de Sherbrooke (UdeS) Template
 */

const CONFIG = {
  appName: 'SlideMAKER',
  version: '2.0.0',

  // Official & Harmonious UdeS Brand Color Palette extracted from template_background.pdf
  colors: {
    udesGreen: '#00A350',      // Primary UdeS Green
    udesForest: '#087E5B',     // Forest Green
    udesLime: '#7FC23F',       // Energetic Lime Green
    udesSlate: '#306A5B',      // Slate Green
    udesDark: '#0D382A',       // Deep Dark Green
    udesBlack: '#0F172A',      // Charcoal Black
    udesWhite: '#FFFFFF',      // Pure White
    udesGrayLight: '#F1F5F9',  // Very Light Gray
    udesGray: '#94A3B8',       // Medium Gray
    udesGrayDark: '#334155',   // Dark Gray
    accentGold: '#F59E0B',     // Golden Amber
    accentTeal: '#06B6D4',     // Modern Cyan
    accentPurple: '#8B5CF6',   // Soft Violet
    accentCoral: '#F43F5E'      // Vivid Coral
  },

  // Color Swatches for Quick Color Pickers
  colorPalette: [
    '#00A350', '#087E5B', '#7FC23F', '#306A5B', '#0D382A',
    '#D4AF37', '#F5D061', '#B8860B', '#09090B', '#18140C',
    '#0F172A', '#1E293B', '#334155', '#64748B', '#94A3B8', '#CBD5E1', '#F1F5F9', '#FFFFFF',
    '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'
  ],

  // Gradient Presets matching UdeS & Black/Gold design aesthetics
  gradientPresets: [
    { name: 'Obsidian & Gold', value: 'linear-gradient(135deg, #09090B 0%, #1C170D 60%, #3A2C10 100%)' },
    { name: 'Royal Gold Sheen', value: 'linear-gradient(135deg, #9A7B2C 0%, #D4AF37 50%, #F5D061 100%)' },
    { name: 'Midnight Velvet', value: 'radial-gradient(circle at top right, #2A2110 0%, #09090B 72%)' },
    { name: 'UdeS Green Gradient', value: 'linear-gradient(135deg, #00A350 0%, #087E5B 100%)' },
    { name: 'Lime & Emerald', value: 'linear-gradient(135deg, #7FC23F 0%, #00A350 100%)' },
    { name: 'Dark & Forest', value: 'linear-gradient(135deg, #0F172A 0%, #087E5B 100%)' },
    { name: 'Slate & Emerald', value: 'linear-gradient(135deg, #306A5B 0%, #0D382A 100%)' },
    { name: 'Subtle Dawn', value: 'linear-gradient(135deg, #F8FAFC 0%, #E2E8F0 100%)' },
    { name: 'UdeS Light Mist', value: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)' },
    { name: 'Elegant Night', value: 'linear-gradient(135deg, #0F172A 0%, #020617 100%)' }
  ],

  // Available Backgrounds (Color-Editable Vector SVG Templates)
  pdfBackgrounds: [
    {
      id: 'template_a',
      name: 'Cover Curves',
      pageNumber: 1,
      image: 'assets/backgrounds/template_a.png',
      thumbnail: 'assets/thumbnails/thumb_template_a.jpg',
      aspectRatio: 1.7778
    },
    {
      id: 'template_b',
      name: 'Watermark Band',
      pageNumber: 2,
      image: 'assets/backgrounds/template_b.png',
      thumbnail: 'assets/thumbnails/thumb_template_b.jpg',
      aspectRatio: 1.7778
    },
    {
      id: 'template_c',
      name: 'Wave Banner',
      pageNumber: 3,
      image: 'assets/backgrounds/template_c.png',
      thumbnail: 'assets/thumbnails/thumb_template_c.jpg',
      aspectRatio: 1.7778
    },
    {
      id: 'template_d',
      name: 'Left Sidebar',
      pageNumber: 4,
      image: 'assets/backgrounds/template_d.png',
      thumbnail: 'assets/thumbnails/thumb_template_d.jpg',
      aspectRatio: 1.7778
    },
    {
      id: 'template_e',
      name: 'Top Ribbon',
      pageNumber: 5,
      image: 'assets/backgrounds/template_e.png',
      thumbnail: 'assets/thumbnails/thumb_template_e.jpg',
      aspectRatio: 1.7778
    }
  ],

  // Color Palettes for Editable SVG Background Templates
  svgTemplatePalettes: {
    'udes-emerald': {
      primary: '#00A350',
      secondary: '#306A5B',
      highlight: '#7FC23F',
      accent: '#7D5184',
      surface: '#FFFFFF'
    },
    'black-gold': {
      primary: '#0D0C09',
      secondary: '#2B2212',
      highlight: '#D4AF37',
      accent: '#F5D061',
      surface: '#141418'
    }
  },

  // Official Logos
  logos: [
    { name: 'UdeS Official (Color/Dark)', src: 'assets/logo_uds_b.png' },
    { name: 'UdeS Emblem (Vector/AVIF)', src: 'assets/logo_uds_a.avif' }
  ],

  defaultFont: 'JetBrains Mono',

  // Available Typography
  fonts: [
    { name: 'JetBrains Mono', family: "'JetBrains Mono', monospace", category: 'Code / Technical (Default)' },
    { name: 'Outfit', family: "'Outfit', sans-serif", category: 'Modern / Titles' },
    { name: 'Inter', family: "'Inter', sans-serif", category: 'Body & Neutral' },
    { name: 'Montserrat', family: "'Montserrat', sans-serif", category: 'Geometric' },
    { name: 'Roboto', family: "'Roboto', sans-serif", category: 'Standard' },
    { name: 'Playfair Display', family: "'Playfair Display', serif", category: 'Elegant / Serif' }
  ],

  // Standard Canvas Dimensions (16:9 Widescreen by default matching Google Slides)
  aspectRatios: {
    '16_9': { name: '16:9 Widescreen (1280×720)', width: 1280, height: 720, ratio: 1.777778 },
    'a4_landscape': { name: 'A4 Landscape (PDF Template 842×595)', width: 1190, height: 842, ratio: 1.4133 },
    '4_3': { name: '4:3 Standard (1024×768)', width: 1024, height: 768, ratio: 1.333333 }
  },

  defaultAspectRatio: '16_9',

  // Available Vector Shapes
  shapes: [
    { id: 'rect', name: 'Rectangle', icon: 'fa-square' },
    { id: 'rounded-rect', name: 'Rounded Rectangle', icon: 'fa-square', radius: 16 },
    { id: 'pill', name: 'Pill / Badge', icon: 'fa-capsules', radius: 999 },
    { id: 'circle', name: 'Circle', icon: 'fa-circle' },
    { id: 'triangle', name: 'Triangle', icon: 'fa-play fa-rotate-270' },
    { id: 'diamond', name: 'Diamond', icon: 'fa-diamond' },
    { id: 'star', name: 'Star', icon: 'fa-star' },
    { id: 'arrow-right', name: 'Right Arrow', icon: 'fa-arrow-right' },
    { id: 'arrow-left', name: 'Left Arrow', icon: 'fa-arrow-left' },
    { id: 'callout', name: 'Speech Bubble', icon: 'fa-comment' },
    { id: 'hexagon', name: 'Hexagon', icon: 'fa-cube' }
  ],

  // Pre-configured Curated Icons (FontAwesome)
  popularIcons: [
    'fa-lightbulb', 'fa-chart-line', 'fa-graduation-cap', 'fa-brain',
    'fa-rocket', 'fa-check-circle', 'fa-award', 'fa-bullseye',
    'fa-book-open', 'fa-microscope', 'fa-atom', 'fa-globe',
    'fa-user-graduate', 'fa-calendar-alt', 'fa-laptop-code', 'fa-shield-halved',
    'fa-folder-open', 'fa-comments', 'fa-quote-left', 'fa-arrow-trend-up'
  ]
};

// Color-Editable SVG Background Template Generator
const SvgBackgrounds = {
  // Exact contour of the official UdeS stylised "S" emblem traced from 4K template_d.png (normalized 0..100)
  UDES_STYLIZED_S_PATH: 'M 91.8 0.8 Q 92.6 0.0 95.3 0.0 Q 98.1 0.0 99.0 0.4 Q 100.0 0.8 99.8 13.8 Q 99.5 26.7 96.0 31.1 Q 92.6 35.5 90.9 36.4 Q 89.3 37.2 87.9 38.5 Q 86.5 39.9 84.2 40.2 Q 81.9 40.5 81.5 41.0 Q 81.0 41.6 75.0 41.6 Q 69.0 41.6 65.2 40.0 Q 61.3 38.3 56.5 32.9 Q 51.6 27.5 50.8 24.9 Q 50.0 22.3 50.0 14.9 Q 50.0 7.4 46.0 7.6 Q 42.0 7.7 38.5 10.4 Q 34.9 13.2 34.8 14.2 Q 34.6 15.2 34.0 15.4 Q 33.5 15.7 32.1 18.6 Q 30.8 21.5 30.6 24.9 Q 30.5 28.4 30.9 30.6 Q 31.3 32.8 32.4 35.0 Q 33.5 37.2 37.0 40.4 Q 40.4 43.5 45.0 44.9 Q 49.7 46.3 65.5 47.4 Q 81.3 48.5 84.8 50.1 Q 88.2 51.8 90.1 53.5 Q 92.0 55.1 94.8 58.4 Q 97.5 61.7 98.6 66.1 Q 99.7 70.5 99.7 76.2 Q 99.7 81.8 99.2 83.4 Q 98.6 85.1 97.5 86.2 Q 96.4 87.3 96.0 88.9 Q 95.6 90.6 95.0 90.3 Q 94.5 90.1 93.8 91.2 Q 93.1 92.3 90.9 93.9 Q 88.7 95.6 84.1 97.5 Q 79.4 99.4 60.7 99.6 Q 42.0 99.7 41.6 98.8 Q 41.2 97.8 41.2 94.8 Q 41.2 91.7 40.4 89.5 Q 39.6 87.3 35.9 84.0 Q 32.1 80.7 28.4 79.9 Q 24.7 79.1 22.5 79.3 Q 20.3 79.6 18.1 80.7 Q 15.9 81.8 14.4 83.3 Q 12.9 84.8 11.2 87.3 Q 9.6 89.8 9.1 94.6 Q 8.5 99.4 4.5 99.6 Q 0.5 99.7 0.5 88.7 Q 0.5 77.7 2.6 73.2 Q 4.7 68.6 9.5 64.6 Q 14.3 60.6 17.9 59.5 Q 21.4 58.4 25.4 58.4 Q 29.4 58.4 34.3 59.9 Q 39.3 61.4 39.0 61.8 Q 38.7 62.3 40.7 63.5 Q 42.6 64.7 45.0 68.2 Q 47.5 71.6 48.9 76.8 Q 50.3 82.1 50.0 86.7 Q 49.7 91.2 50.0 92.0 Q 50.3 92.8 51.2 93.2 Q 52.2 93.7 54.7 93.2 Q 57.1 92.6 60.8 89.8 Q 64.6 87.1 66.3 84.8 Q 68.1 82.4 68.9 78.2 Q 69.8 74.1 69.8 72.4 Q 69.8 70.8 68.4 67.2 Q 67.0 63.6 64.4 60.9 Q 61.8 58.1 60.5 57.3 Q 59.1 56.5 56.0 55.4 Q 53.0 54.3 52.2 54.5 Q 51.4 54.8 49.9 54.2 Q 48.4 53.7 33.8 52.6 Q 19.2 51.5 15.3 49.9 Q 11.5 48.2 8.5 45.3 Q 5.5 42.4 5.0 42.5 Q 4.4 42.7 4.2 41.5 Q 4.1 40.2 2.0 36.8 Q 0.0 33.3 0.0 24.6 Q 0.0 16.0 0.8 14.6 Q 1.6 13.2 3.0 12.6 Q 4.4 12.1 8.8 7.4 Q 13.2 2.8 14.1 2.8 Q 15.1 2.8 16.6 1.9 Q 18.1 1.1 20.3 0.7 Q 22.5 0.3 40.2 0.3 Q 58.0 0.3 58.1 3.2 Q 58.2 6.1 58.9 8.3 Q 59.6 10.5 61.0 11.6 Q 62.4 12.7 62.6 13.8 Q 62.9 14.9 64.7 16.8 Q 66.5 18.7 67.5 18.7 Q 68.4 18.7 68.6 19.2 Q 68.7 19.8 69.7 20.1 Q 70.6 20.4 72.2 20.0 Q 73.9 19.6 76.5 20.0 Q 79.1 20.4 81.4 19.4 Q 83.8 18.5 83.9 17.8 Q 84.1 17.1 84.9 17.1 Q 85.7 17.1 86.2 16.6 Q 86.8 16.0 86.8 14.4 Q 86.8 12.9 88.4 12.2 Q 90.1 11.6 90.4 9.5 Q 90.7 7.4 91.1 7.2 Q 91.5 6.9 91.2 4.3 Q 90.9 1.7 91.8 0.8 Z',

  // Exact contour of the official UDS badge letterforms (U, D with counter, S) traced from logo_uds_b.png (84x44 box)
  UDES_UDS_LETTERS_PATH: 'M 65.01 7.64 L 68.4 7.76 L 73.15 8.92 L 72.92 15.05 L 70.89 15.17 L 70.55 11.46 L 70.32 10.88 L 69.42 10.07 L 67.38 9.49 L 64.55 9.49 L 62.75 10.07 L 61.28 11.46 L 60.71 13.08 L 60.94 15.28 L 61.5 16.33 L 63.42 18.06 L 70.21 21.54 L 72.02 22.69 L 73.49 24.2 L 74.39 25.71 L 74.84 27.44 L 74.84 28.95 L 74.28 31.03 L 73.37 32.65 L 72.58 33.58 L 70.66 34.97 L 67.61 36.01 L 62.97 36.13 L 56.87 34.51 L 57.21 27.79 L 59.35 27.79 L 59.58 31.73 L 59.81 32.54 L 60.26 33.0 L 61.62 33.69 L 63.88 34.27 L 67.15 34.16 L 68.85 33.46 L 70.43 31.84 L 71.0 29.64 L 70.66 27.67 L 70.21 26.86 L 69.08 25.71 L 67.95 24.89 L 61.5 21.77 L 60.15 20.84 L 58.11 18.64 L 57.32 16.79 L 57.09 15.28 L 57.21 13.43 L 57.66 12.04 L 58.56 10.54 L 59.35 9.73 L 60.94 8.68 L 62.41 8.11 Z M 9.04 7.87 L 17.86 7.87 L 17.86 9.61 L 16.62 9.84 L 15.71 10.65 L 15.49 11.23 L 15.6 26.98 L 15.94 28.95 L 17.07 31.49 L 18.54 33.0 L 20.24 33.81 L 21.37 34.04 L 23.74 34.04 L 26.0 33.23 L 27.92 31.15 L 28.94 28.6 L 29.28 25.94 L 29.28 11.35 L 28.49 10.07 L 27.02 9.61 L 27.02 7.87 L 34.59 7.87 L 34.59 9.61 L 32.79 10.07 L 32.22 10.65 L 31.88 11.46 L 31.88 26.17 L 31.43 28.95 L 30.86 30.68 L 29.85 32.42 L 27.81 34.39 L 26.34 35.2 L 24.42 35.78 L 22.38 36.01 L 19.9 35.89 L 17.64 35.43 L 16.28 34.85 L 14.81 33.81 L 13.68 32.54 L 12.78 30.92 L 12.21 29.29 L 11.64 26.05 L 11.64 11.46 L 11.19 10.42 L 10.63 9.96 L 9.04 9.61 Z M 37.08 13.2 L 46.47 13.32 L 48.84 13.89 L 50.87 15.05 L 52.8 17.25 L 53.7 19.45 L 53.93 20.84 L 53.7 24.32 L 53.14 25.94 L 52.23 27.44 L 49.86 29.53 L 47.26 30.45 L 45.56 30.68 L 37.08 30.68 L 37.08 29.53 L 38.33 29.18 L 38.78 28.6 L 38.78 15.28 L 38.44 14.71 L 37.08 14.24 Z M 41.38 14.47 L 44.66 14.47 L 47.03 15.05 L 48.5 15.98 L 49.52 17.02 L 50.42 18.64 L 50.99 21.19 L 50.99 22.81 L 50.42 25.24 L 49.63 26.75 L 48.5 27.91 L 47.03 28.83 L 44.54 29.41 L 41.38 29.41 Z',

  isDarkHex(hex) {
    if (!hex || !hex.startsWith('#') || hex.length < 7) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 130;
  },

  isVeryDarkHex(hex) {
    if (!hex || !hex.startsWith('#') || hex.length < 7) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 55;
  },

  buildUdsFooterLogo(badgeFill, surfaceColor) {
    const surfaceDark = this.isDarkHex(surfaceColor);
    const badgeDark = this.isDarkHex(badgeFill);
    const wordmarkColor = surfaceDark ? '#FAF8F2' : '#0F172A';
    const finalBadgeFill = (surfaceDark && badgeDark) ? '#D4AF37' : badgeFill;
    const finalBadgeText = this.isDarkHex(finalBadgeFill) ? '#FAF8F2' : '#09090B';
    return `
      <g transform="translate(1072, 654)">
        <rect x="0" y="0" width="84" height="44" fill="${finalBadgeFill}"/>
        <path d="${this.UDES_UDS_LETTERS_PATH}" fill="${finalBadgeText}" fill-rule="evenodd"/>
        <text x="94" y="19" font-family="Georgia, 'Playfair Display', serif" font-size="16" font-weight="400" fill="${wordmarkColor}">Université de</text>
        <text x="94" y="37" font-family="Georgia, 'Playfair Display', serif" font-size="16" font-weight="400" fill="${wordmarkColor}">Sherbrooke</text>
      </g>
    `;
  },

  getDefaultColors(themeKey) {
    const key = themeKey || (window.state && window.state.presentationTheme) || 'udes-emerald';
    return { ...(CONFIG.svgTemplatePalettes[key] || CONFIG.svgTemplatePalettes['udes-emerald']) };
  },

  buildSvg(templateId = 'template_a', customColors = null, themeKey = null) {
    const c = Object.assign(this.getDefaultColors(themeKey), customColors || {});
    const esc = (v) => String(v || '').replace(/"/g, '&quot;');
    const p = esc(c.primary);
    const s = esc(c.secondary);
    const h = esc(c.highlight);
    const a = esc(c.accent);
    const sf = esc(c.surface);
    const sPath = this.UDES_STYLIZED_S_PATH;
    const isDarkPrimary = this.isVeryDarkHex(p);

    if (templateId === 'template_a') {
      // Faithful Cover Curves matching measured 1280x720 proportions + UDS footer logo
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
        <defs>
          <clipPath id="smCoverMain"><rect x="0" y="0" width="1280" height="630"/></clipPath>
        </defs>
        <rect width="1280" height="720" fill="${sf}"/>
        <g clip-path="url(#smCoverMain)">
          <rect x="0" y="0" width="1280" height="630" fill="${p}"/>
          <ellipse cx="-16" cy="-58" rx="200" ry="198" fill="${a}"/>
          <path d="M 0 256 L 152 256 C 318 256 426 146 474 0 L 566 0 L 546 276 C 532 446 418 528 272 528 C 118 528 18 426 0 296 Z" fill="${s}"/>
          <path d="M 632 630 L 664 236 C 680 68 790 -18 948 -18 C 1106 -18 1202 88 1212 252 L 1044 252 C 858 252 738 394 720 630 Z" fill="${h}"/>
          <circle cx="1268" cy="630" r="258" fill="${s}" opacity="0.72"/>
        </g>
        <rect x="0" y="630" width="1280" height="90" fill="${sf}"/>
        ${this.buildUdsFooterLogo(p, sf)}
      </svg>`;
    }

    if (templateId === 'template_b') {
      // Faithful "Univers en soi" 4-row watermark + horizontal band y=316..407
      const wmOpacity = isDarkPrimary ? '0.016' : '0.18';
      const bandOpacity = isDarkPrimary ? '0.72' : '0.78';
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
        <rect width="1280" height="720" fill="${p}"/>
        <g font-family="Outfit, Inter, sans-serif" fill="${h}" opacity="${wmOpacity}">
          <text x="16" y="162" font-size="162" font-weight="400" letter-spacing="4">Univers en soi</text>
          <text x="16" y="320" font-size="152" font-weight="400" letter-spacing="6">UNIVERS EN SOI</text>
          <text x="16" y="502" font-size="162" font-weight="700" letter-spacing="4">Univers en soi</text>
          <text x="16" y="678" font-size="152" font-weight="700" letter-spacing="6">UNIVERS EN SOI</text>
        </g>
        <rect x="0" y="316" width="1280" height="91" fill="${s}" opacity="${bandOpacity}"/>
      </svg>`;
    }

    if (templateId === 'template_c') {
      // Faithful full-bleed tiled UdeS stylised "S" pattern + horizontal surface bar x=472..1280, y=318..406
      const tileOpacity = isDarkPrimary ? '0.015' : '0.14';
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="smUdsSTile" width="144" height="144" patternUnits="userSpaceOnUse">
            <path d="${sPath}" transform="translate(11, 11) scale(1.22)" fill="${h}" opacity="${tileOpacity}"/>
          </pattern>
        </defs>
        <rect width="1280" height="720" fill="${p}"/>
        <rect width="1280" height="720" fill="url(#smUdsSTile)"/>
        <rect x="472" y="318" width="808" height="88" fill="${sf}"/>
      </svg>`;
    }

    if (templateId === 'template_d') {
      // Faithful Left Sidebar (width=297) with 2-col x 5-row alternating filled & outlined UdeS stylised "S" + UDS footer logo
      const fillOp = isDarkPrimary ? '0.02' : '0.18';
      const strokeOp = isDarkPrimary ? '0.045' : '0.35';
      const strokeW = isDarkPrimary ? '1.2' : '1.8';
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="smUdsSidebar" width="148" height="300" patternUnits="userSpaceOnUse" patternTransform="translate(-68, -6)">
            <path d="${sPath}" transform="translate(14, 14) scale(1.22)" fill="${h}" opacity="${fillOp}"/>
            <path d="${sPath}" transform="translate(14, 164) scale(1.22)" fill="none" stroke="${h}" stroke-width="${strokeW}" opacity="${strokeOp}"/>
          </pattern>
        </defs>
        <rect width="1280" height="720" fill="${sf}"/>
        <rect x="0" y="0" width="297" height="720" fill="${p}"/>
        <rect x="0" y="0" width="297" height="720" fill="url(#smUdsSidebar)"/>
        ${this.buildUdsFooterLogo(p, sf)}
      </svg>`;
    }

    // template_e: Faithful Top Ribbon Header (height=63) + UDS footer logo
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
      <defs>
        <clipPath id="smTopRibbonClip"><rect x="0" y="0" width="1280" height="63"/></clipPath>
      </defs>
      <rect width="1280" height="720" fill="${sf}"/>
      <g clip-path="url(#smTopRibbonClip)">
        <rect x="0" y="0" width="1280" height="63" fill="${p}"/>
        <path d="M 100 0 L 552 0 C 540 24 526 44 512 63 L 136 63 C 122 44 110 24 100 0 Z" fill="${s}" opacity="0.88"/>
        <path d="M 688 0 L 824 0 C 812 22 800 44 788 63 L 684 63 C 685 42 686 20 688 0 Z" fill="${h}"/>
        <path d="M 1156 0 L 1280 0 L 1280 63 L 1088 63 C 1108 38 1130 16 1156 0 Z" fill="${s}"/>
      </g>
      ${this.buildUdsFooterLogo(p, sf)}
    </svg>`;
  },

  toDataUrl(templateId = 'template_a', customColors = null, themeKey = null) {
    const svg = this.buildSvg(templateId, customColors, themeKey);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  },

  createBgConfig(templateId = 'template_a', customColors = null, themeKey = null) {
    const colors = Object.assign(this.getDefaultColors(themeKey), customColors || {});
    const meta = CONFIG.pdfBackgrounds.find(b => b.id === templateId) || CONFIG.pdfBackgrounds[0];
    return {
      type: 'svg-template',
      templateId: templateId,
      pdfId: templateId,
      pageNumber: meta ? meta.pageNumber : 1,
      colors: colors,
      value: this.toDataUrl(templateId, colors, themeKey)
    };
  },

  buildLogoDataUrl(logoType = 'uds-badge', themeKey = null) {
    const key = themeKey || (window.state && window.state.presentationTheme) || 'udes-emerald';
    const isGold = key === 'black-gold';
    const badgeFill = isGold ? '#D4AF37' : '#00A350';
    const letterFill = isGold ? '#09090B' : '#FFFFFF';
    let svg;
    if (logoType === 'uds-emblem') {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${this.UDES_STYLIZED_S_PATH}" fill="${badgeFill}"/></svg>`;
    } else {
      svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 44"><rect width="84" height="44" fill="${badgeFill}"/><path d="${this.UDES_UDS_LETTERS_PATH}" fill="${letterFill}" fill-rule="evenodd"/></svg>`;
    }
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
};

// Export to global scope
window.CONFIG = CONFIG;
window.SvgBackgrounds = SvgBackgrounds;
