import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename } from 'path'
import { writeFile, mkdir } from 'fs/promises'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: '파일 변환기',
    icon: app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // 렌더러가 메모리 부족 등으로 죽으면(대용량 PDF 등) 앱이 그냥 꺼진 것처럼 보인다
  // → 창을 자동으로 다시 로드해 복구한다. (반복 크래시 루프 방지로 10초에 1회만)
  let lastRecover = 0
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return
    const now = Date.now()
    if (now - lastRecover < 10_000) return
    lastRecover = now
    // 복구 후 렌더러에 알림 → 화면에 "복구됨" 안내 (조용히 리셋되면 앱이 꺼진 걸로 오해)
    mainWindow.webContents.once('did-finish-load', () => mainWindow.webContents.send('app:recovered', details.reason))
    mainWindow.webContents.reload()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // electron-vite dev 모드에서는 이 env 로 렌더러 개발 서버 URL이 주입된다
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC: 파일 저장 관련 (렌더러는 파일시스템 직접 접근 불가) ──────────────

/** 단일 결과물을 저장 다이얼로그로 저장 → 저장한 경로 또는 null(취소) */
ipcMain.handle('fs:saveBuffer', async (_e, defaultName: string, data: Uint8Array) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    title: '저장 위치 선택'
  })
  if (canceled || !filePath) return null
  await writeFile(filePath, Buffer.from(data))
  return filePath
})

/** 여러 결과물을 한 번에 저장할 폴더 선택 → 폴더 경로 또는 null */
ipcMain.handle('fs:pickSaveDir', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: '저장 폴더 선택'
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})

/** 지정 폴더에 파일 쓰기 (pdf→여러 이미지처럼 결과가 여러 개일 때) → 전체 경로 */
ipcMain.handle('fs:writeInDir', async (_e, dirPath: string, fileName: string, data: Uint8Array) => {
  await mkdir(dirPath, { recursive: true })
  const full = join(dirPath, basename(fileName))
  await writeFile(full, Buffer.from(data))
  return full
})

/** 저장한 파일/폴더를 탐색기에서 열기 */
ipcMain.handle('shell:showItem', async (_e, fullPath: string) => {
  shell.showItemInFolder(fullPath)
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
