import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

// ── Tipografía base ────────────────────────────────────────
export const FONT_DISPLAY = "'Space Grotesk', 'Inter', 'Segoe UI', sans-serif";
export const FONT_BODY = "'IBM Plex Sans', 'Inter', 'Segoe UI', sans-serif";
export const FONT_MONO = "'JetBrains Mono', ui-monospace, 'Segoe UI Mono', monospace";
// CumpliSign (manual): Space Grotesk primaria + Space Mono técnica
export const FONT_BODY_CS = "'Space Grotesk', sans-serif";
export const FONT_MONO_CS = "'Space Mono', monospace";

// ── Skins ──────────────────────────────────────────────────
// Cada skin define paleta dark/light (superficies + acento), radio de
// borde y fuentes. La marca (nombre/logo) es la misma para todas; el
// skin es la vestimenta de la interfaz.
export type Skin = 'guardrails' | 'cumplisign' | 'titan';
export const SKINS: { id: Skin; nombre: string; desc: string }[] = [
  { id: 'guardrails', nombre: 'Clásica', desc: 'Consola SOC slate + ámbar (la original)' },
  { id: 'cumplisign', nombre: 'CumpliSign', desc: 'Navy + turquesa del manual de marca' },
  { id: 'titan', nombre: 'Titan', desc: 'Brutalismo industrial: negro, plata y azul' },
];

interface SkinPalette {
  bg: string; container: string; elevated: string;
  border: string; borderSubtle: string;
  text: string; textSecondary: string;
  accent: string; accentStrong: string;
  info: string; link: string;
  /** extras para componentes clave */
  siderBg?: string;
  tableHeaderBg?: string;
  menuSelectedBg?: string;
  menuSelectedBgLight?: string;
}

interface SkinDef {
  dark: SkinPalette;
  light: SkinPalette;
  radius: number;
  fontBody: string;
  fontMono: string;
  fontDisplay: string;
}

// ── Clásica (GuardRails): la paleta histórica, intacta ──
const CLASSIC: SkinDef = {
  radius: 6,
  fontBody: FONT_BODY, fontMono: FONT_MONO, fontDisplay: FONT_DISPLAY,
  dark: {
    bg: '#0d1417', container: '#141c21', elevated: '#1a242b',
    border: '#25313a', borderSubtle: '#1e2a32',
    text: '#eef2f3', textSecondary: '#9fb0ba',
    accent: '#f5b93f', accentStrong: '#ffc94d',
    info: '#2dd4bf', link: '#35c2b4',
    siderBg: '#0a1114', tableHeaderBg: '#101a1f',
    menuSelectedBg: 'rgba(245,185,63,0.12)', menuSelectedBgLight: 'rgba(181,126,0,0.10)',
  },
  light: {
    bg: '#f5f3ee', container: '#ffffff', elevated: '#ffffff',
    border: '#e3ded2', borderSubtle: '#ece8dd',
    text: '#17211f', textSecondary: '#5b6a72',
    accent: '#b57e00', accentStrong: '#8a5f00',
    info: '#0f8078', link: '#0f8078',
    tableHeaderBg: '#f2efe8',
    menuSelectedBg: 'rgba(245,185,63,0.12)', menuSelectedBgLight: 'rgba(181,126,0,0.10)',
  },
};

// ── CumpliSign: kit oficial navy #0A142B + turquesa #20BDB8;
// claro con niebla #EFF4F5, teal accesible #087C79 y secundario #52616F ──
const CUMPLISIGN: SkinDef = {
  radius: 8,
  fontBody: FONT_BODY_CS, fontMono: FONT_MONO_CS, fontDisplay: FONT_DISPLAY,
  dark: {
    bg: '#0a142b', container: '#101d3c', elevated: '#152550',
    border: '#23325c', borderSubtle: '#1b294d',
    text: '#eff4f5', textSecondary: '#8e9db8',
    accent: '#20bdb8', accentStrong: '#4fd8d3',
    info: '#20bdb8', link: '#4fd8d3',
    siderBg: '#081024', tableHeaderBg: '#12204a',
    menuSelectedBg: 'rgba(32,189,184,0.14)', menuSelectedBgLight: 'rgba(8,124,121,0.10)',
  },
  light: {
    bg: '#eff4f5', container: '#ffffff', elevated: '#ffffff',
    border: '#d2dee1', borderSubtle: '#e1eaec',
    text: '#0a142b', textSecondary: '#52616f',
    accent: '#087c79', accentStrong: '#05605e',
    info: '#087c79', link: '#087c79',
    tableHeaderBg: '#e4eef0',
    menuSelectedBg: 'rgba(32,189,184,0.16)', menuSelectedBgLight: 'rgba(8,124,121,0.10)',
  },
};

// ── Titan: brutalismo industrial (negro #050505 / plata #C4C4C4 /
// blanco #F2F2EF / azul #A8C7DA; claro en papel con azul #33566E) ──
const TITAN: SkinDef = {
  radius: 0,
  fontBody: FONT_MONO_CS, fontMono: FONT_MONO_CS, fontDisplay: FONT_MONO_CS,
  dark: {
    bg: '#050505', container: '#0b0b0b', elevated: '#121212',
    border: '#2a2a2a', borderSubtle: '#1e1e1e',
    text: '#f2f2ef', textSecondary: '#c4c4c4',
    accent: '#a8c7da', accentStrong: '#cfe2ed',
    info: '#a8c7da', link: '#a8c7da',
    siderBg: '#050505', tableHeaderBg: '#161616',
    menuSelectedBg: 'rgba(168,199,218,0.14)', menuSelectedBgLight: 'rgba(51,86,110,0.12)',
  },
  light: {
    bg: '#f2f2ef', container: '#ffffff', elevated: '#ffffff',
    border: '#d2d2cd', borderSubtle: '#e0e0db',
    text: '#050505', textSecondary: '#33566e',
    accent: '#33566e', accentStrong: '#050505', // M-06: azul de apoyo para interacción visible
    info: '#33566e', link: '#33566e',
    tableHeaderBg: '#e8e8e3',
    menuSelectedBg: 'rgba(168,199,218,0.25)', menuSelectedBgLight: 'rgba(51,86,110,0.12)',
  },
};

const SKIN_DEFS: Record<Skin, SkinDef> = {
  guardrails: CLASSIC,
  cumplisign: CUMPLISIGN,
  titan: TITAN,
};

export type Mode = 'dark' | 'light';

export function skinDef(skin: Skin): SkinDef {
  return SKIN_DEFS[skin] ?? CLASSIC;
}

// ── Tokens AntD por skin + modo ────────────────────────────
export function antdTheme(skin: Skin, mode: Mode): ThemeConfig {
  const s = skinDef(skin);
  const p = s[mode];
  const dark = mode === 'dark';
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: p.accent,
      colorInfo: p.info,
      colorLink: p.link,
      colorTextBase: p.text,
      colorBgBase: p.bg,
      colorBgContainer: p.container,
      colorBgElevated: p.elevated,
      colorBorder: p.border,
      colorBorderSecondary: p.borderSubtle,
      colorText: p.text,
      colorTextSecondary: p.textSecondary,
      fontFamily: s.fontBody,
      fontFamilyCode: s.fontMono,
      borderRadius: s.radius,
      fontSize: 14,
      controlHeight: 36,
      wireframe: false,
    },
    components: {
      Layout: {
        headerBg: p.container,
        siderBg: dark ? (p.siderBg ?? p.container) : p.container,
        bodyBg: p.bg,
      },
      Menu: {
        darkItemBg: 'transparent',
        darkSubMenuItemBg: 'transparent',
        itemSelectedBg: dark ? (p.menuSelectedBg ?? 'transparent') : (p.menuSelectedBgLight ?? 'rgba(0,0,0,0.05)'),
        itemSelectedColor: p.accent,
        darkItemColor: dark ? p.textSecondary : p.text,
      },
      Table: {
        headerBg: p.tableHeaderBg ?? (dark ? '#101a1f' : '#f2efe8'),
        headerColor: p.textSecondary,
        rowHoverBg: dark ? `${p.accent}0d` : `${p.accent}0a`,
        borderColor: p.borderSubtle,
        cellPaddingBlock: 10,
        fontFamily: s.fontBody,
      },
      Card: { colorBgContainer: p.container, colorBorderSecondary: p.borderSubtle },
      Statistic: { fontFamily: s.fontMono },
      Tag: { fontFamily: s.fontMono },
      Modal: { contentBg: p.elevated, headerBg: p.elevated },
      Form: { labelColor: p.textSecondary },
      Typography: { fontFamilyCode: s.fontMono },
      Button: { fontFamily: s.fontBody, fontWeight: 500 },
    },
  };
}

// ── Tokens de superficie para CSS custom ───────────────────
export function surfaceVars(skin: Skin, mode: Mode): Record<string, string> {
  const s = skinDef(skin);
  const p = s[mode];
  return {
    '--bg': p.bg,
    '--surface': p.container,
    '--elevated': p.elevated,
    '--border': p.border,
    '--border-subtle': p.borderSubtle,
    '--text': p.text,
    '--text-2': p.textSecondary,
    '--accent': p.accent,
    '--accent-strong': p.accentStrong,
    '--info': p.info,
    '--radius': `${s.radius}px`,
    '--font-display': s.fontDisplay,
    '--font-body': s.fontBody,
    '--font-mono': s.fontMono,
  };
}

// Compat: paleta legacy exportada (consumidores antiguos)
export const palette = { dark: CLASSIC.dark, light: CLASSIC.light } as const;
