import { contextBridge, ipcRenderer } from 'electron'

/** 렌더러에 노출되는 안전한 API 표면. 파일시스템은 전부 여기를 거친다. */
const api = {
  saveBuffer: (defaultName: string, data: Uint8Array): Promise<string | null> =>
    ipcRenderer.invoke('fs:saveBuffer', defaultName, data),
  pickSaveDir: (): Promise<string | null> => ipcRenderer.invoke('fs:pickSaveDir'),
  writeInDir: (dirPath: string, fileName: string, data: Uint8Array): Promise<string> =>
    ipcRenderer.invoke('fs:writeInDir', dirPath, fileName, data),
  showItem: (fullPath: string): Promise<void> => ipcRenderer.invoke('shell:showItem', fullPath),
  /** 렌더러 크래시 → 자동 복구(reload) 후 호출됨. 사용자 안내용. */
  onRecovered: (cb: (reason: string) => void): void => {
    ipcRenderer.on('app:recovered', (_e, reason: string) => cb(reason))
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
