import React from 'react'
import ReactDOM from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { theme } from './theme'
import { applyTokens } from './styles/tokens'
import './styles/base.css'
import App from './App'

// 토큰(SSOT)을 :root CSS 변수로 주입 — base.css 와 sx 의 var() 가 이 값을 읽는다. 렌더 전에 1회.
applyTokens()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
