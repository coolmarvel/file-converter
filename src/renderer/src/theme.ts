import { createTheme } from '@mui/material/styles'

/**
 * 자매 프로젝트 pdf-editor 의 디자인 시스템(TailAdmin → MUI 스킨)을 이식한 테마.
 * 브랜드 색만 다르다 — pdf-editor 는 pdfguru 레드, 여기는 파일 변환기 고유의 파랑(#3b74f2,
 * 구 styles.css 의 --accent · 앱 아이콘과 동일 계열). 나머지 토큰(그레이·섀도·라운드·컴포넌트
 * 오버라이드)은 두 앱이 같은 규칙을 공유한다.
 */

// ── 디자인 토큰 ──
export const ui = {
  gray: {
    25: '#fcfcfd',
    50: '#f9fafb',
    100: '#f2f4f7',
    200: '#e4e7ec',
    300: '#d0d5dd',
    400: '#98a2b3',
    500: '#667085',
    600: '#475467',
    700: '#344054',
    800: '#1d2939',
    900: '#101828'
  },
  // 브랜드(파랑) 스케일 — 기존 --accent(#3b74f2) 기준
  brand: {
    50: '#eef3fe',
    100: '#dbe6fc',
    500: '#3b74f2',
    600: '#2c5cd9',
    700: '#2149b3'
  },
  shadow: {
    xs: '0px 1px 2px 0px rgba(16, 24, 40, 0.05)',
    sm: '0px 1px 3px 0px rgba(16, 24, 40, 0.1), 0px 1px 2px 0px rgba(16, 24, 40, 0.06)',
    md: '0px 4px 8px -2px rgba(16, 24, 40, 0.1), 0px 2px 4px -2px rgba(16, 24, 40, 0.06)',
    lg: '0px 12px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03)',
    focusRing: '0px 0px 0px 4px rgba(59, 116, 242, 0.12)'
  }
} as const

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: ui.brand[500], dark: ui.brand[600], light: ui.brand[50] },
    secondary: { main: '#5b5bd6' },
    background: { default: ui.gray[50], paper: '#ffffff' },
    text: { primary: ui.gray[900], secondary: ui.gray[500] },
    divider: ui.gray[200]
  },
  shape: { borderRadius: 8 },
  typography: {
    // Segoe UI 우선: 숫자·영문을 Malgun Gothic 으로 그리면 작은 크기에서 깨져 보인다 (한글은 Malgun 폴백)
    fontFamily: `'Segoe UI', 'Malgun Gothic', '맑은 고딕', -apple-system, Roboto, sans-serif`,
    fontSize: 15,
    caption: { fontSize: 13 },
    button: { textTransform: 'none', fontWeight: 500 }
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8, fontWeight: 500, paddingLeft: 16, paddingRight: 16 },
        contained: {
          boxShadow: ui.shadow.xs,
          '&:hover': { boxShadow: ui.shadow.xs }
        },
        outlined: {
          backgroundColor: '#fff',
          borderColor: ui.gray[300],
          color: ui.gray[700],
          '&:hover': { backgroundColor: ui.gray[50], borderColor: ui.gray[300] }
        },
        textInherit: { color: ui.gray[700], '&:hover': { backgroundColor: ui.gray[100] } },
        outlinedInherit: {
          backgroundColor: '#fff',
          borderColor: ui.gray[300],
          color: ui.gray[700],
          '&:hover': { backgroundColor: ui.gray[50], borderColor: ui.gray[300] }
        }
      }
    },
    MuiIconButton: {
      styleOverrides: {
        root: { color: ui.gray[700], '&:hover': { backgroundColor: ui.gray[100] } }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: '#fff',
          boxShadow: ui.shadow.xs,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: ui.gray[300] },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: ui.gray[400] },
          '&.Mui-focused': { boxShadow: ui.shadow.focusRing },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: ui.brand[500], borderWidth: 1 }
        }
      }
    },
    MuiMenu: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        paper: { borderRadius: 12, border: `1px solid ${ui.gray[200]}`, boxShadow: ui.shadow.lg, marginTop: 4 },
        list: { padding: 6 }
      }
    },
    MuiPopover: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        paper: { borderRadius: 12, border: `1px solid ${ui.gray[200]}`, boxShadow: ui.shadow.lg }
      }
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '1px 0',
          fontSize: 14.5,
          fontWeight: 500,
          color: ui.gray[700],
          '&:hover': { backgroundColor: ui.gray[100] },
          '&.Mui-selected': { backgroundColor: ui.brand[50], color: ui.brand[500] },
          '&.Mui-selected:hover': { backgroundColor: ui.brand[100] }
        }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16, boxShadow: ui.shadow.lg }
      }
    },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 700, color: ui.gray[900] } } },
    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 500 },
      styleOverrides: {
        tooltip: { backgroundColor: ui.gray[800], borderRadius: 8, fontSize: 12.5, fontWeight: 500, padding: '6px 10px' },
        arrow: { color: ui.gray[800] }
      }
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: { backgroundColor: ui.gray[100], borderRadius: 8, padding: 2, gap: 2 }
      }
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          border: 0,
          borderRadius: '6px !important',
          padding: '4px 12px',
          color: ui.gray[500],
          fontWeight: 500,
          '&:hover': { backgroundColor: ui.gray[200] },
          '&.Mui-selected': { backgroundColor: '#fff', color: ui.gray[900], boxShadow: ui.shadow.xs },
          '&.Mui-selected:hover': { backgroundColor: '#fff' }
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        outlined: { borderColor: ui.gray[200] }
      }
    },
    MuiSelect: {
      styleOverrides: {
        select: { fontSize: 14.5 }
      }
    }
  }
})
