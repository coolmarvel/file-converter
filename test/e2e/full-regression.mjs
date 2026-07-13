/**
 * out/ 빌드(난독화 포함) 전체 기능 회귀 E2E (Playwright _electron).
 *
 * 실행: npm run build 후 `node test/e2e/full-regression.mjs`
 * 필요: playwright — devDep 아님, `npm i --no-save playwright`로 임시 설치.
 *       브라우저 다운로드 불필요(node_modules의 electron 바이너리를 띄움). WSLg 등 DISPLAY 필요.
 *
 * 그룹별로 앱을 새로 띄워 상태 격리:
 *  A) 이미지 변환 전반 (jpeg/webp/bmp/ico/svg·리사이즈·회전·undo·흑백·흰색→투명·워터마크·자르기·다중→PDF)
 *  B) PDF (→PNG 페이지별, 분할/회전/삭제/순서, 병합)
 *  C) 특수 입력 (TIFF, SVG, ICO 라운드트립) — HEIC은 오프라인 픽스처 생성 불가로 제외
 *  D) AI 배경 제거 (bgrm:// 모델 서빙 + onnx 실추론 — 수십 초 소요)
 */
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'
import zlib from 'zlib'

const PROJECT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-e2e-'))
const FIX = path.join(WORK, 'fixtures')
const OUT = path.join(WORK, 'outputs')
const require_ = createRequire(path.join(PROJECT, 'package.json'))
const { _electron: electron } = require_('playwright')

fs.rmSync(FIX, { recursive: true, force: true })
fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(FIX, { recursive: true })
fs.mkdirSync(OUT, { recursive: true })

// ── 최소 PNG 인코더 (RGBA, filter 0) ─────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePng(w, h, px /* (x,y)=>[r,g,b,a] */) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 4)
    raw[row] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y)
      raw.set([r, g, b, a], row + 1 + x * 4)
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}
const pngInfo = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25] })

// ── 픽스처 생성 ──────────────────────────────────────────────────────────
async function makeFixtures() {
  // 120×80: 흰 테두리 10px + 빨강 내부
  fs.writeFileSync(
    path.join(FIX, 'red-white.png'),
    encodePng(120, 80, (x, y) => (x < 10 || y < 10 || x >= 110 || y >= 70 ? [255, 255, 255, 255] : [220, 30, 30, 255]))
  )
  // 60×60 파랑
  fs.writeFileSync(path.join(FIX, 'blue.png'), encodePng(60, 60, () => [30, 60, 220, 255]))
  // AI용 200×150: 초록 배경 + 중앙 빨강 원
  fs.writeFileSync(
    path.join(FIX, 'subject.png'),
    encodePng(200, 150, (x, y) => ((x - 100) ** 2 + (y - 75) ** 2 <= 40 ** 2 ? [220, 40, 40, 255] : [40, 180, 90, 255]))
  )
  // PDF 2장 + 1장 (pdf-lib)
  const { PDFDocument, rgb } = require_('pdf-lib')
  const mk = async (n, name) => {
    const doc = await PDFDocument.create()
    for (let i = 0; i < n; i++) {
      const p = doc.addPage([300, 200])
      p.drawRectangle({ x: 20 + i * 30, y: 40, width: 120, height: 90, color: rgb(0.9, 0.2 + 0.3 * i, 0.2) })
    }
    fs.writeFileSync(path.join(FIX, name), await doc.save())
  }
  await mk(2, 'two.pdf')
  await mk(1, 'one.pdf')
  // TIFF 64×48 그라데이션 (utif2)
  const UTIF = require_('utif2')
  const rgba = new Uint8Array(64 * 48 * 4)
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 64; x++) rgba.set([Math.round((x / 63) * 255), 80, 160, 255], (y * 64 + x) * 4)
  fs.writeFileSync(path.join(FIX, 'grad.tif'), Buffer.from(UTIF.encodeImage(rgba.buffer, 64, 48)))
  // SVG
  fs.writeFileSync(path.join(FIX, 'rect.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect width="100" height="60" fill="#cc2222"/></svg>')
}

// ── 테스트 하네스 ────────────────────────────────────────────────────────
const results = []
async function t(name, fn) {
  try {
    await fn()
    results.push({ ok: true, name })
    console.log(`  PASS ${name}`)
  } catch (e) {
    results.push({ ok: false, name, err: (e && e.message) || String(e) })
    console.log(`  FAIL ${name}: ${((e && e.message) || String(e)).slice(0, 300)}`)
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

async function launch() {
  const app = await electron.launch({ args: ['.', '--no-sandbox'], cwd: PROJECT })
  await app.evaluate(({ dialog, shell }, outDir) => {
    const base = (p) => String(p).split(/[\\/]/).pop()
    dialog.showSaveDialog = async (o) => ({ canceled: false, filePath: outDir + '/' + base((o && o.defaultPath) || 'out.bin') })
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [outDir] })
    shell.showItemInFolder = () => {}
  }, OUT)
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.getByText('파일 변환기').first().waitFor({ timeout: 15000 })
  return { app, page }
}

const addFiles = async (page, ...names) =>
  page.setInputFiles('input[type="file"][hidden]', names.map((n) => path.join(FIX, n)))

const pickTarget = (page, label) => page.getByRole('button', { name: label, exact: true }).click()

async function pickSelect(page, currentText, optionText) {
  await page.locator(`[role="combobox"]:has-text("${currentText}")`).first().click()
  await page.locator(`[role="option"]:has-text("${optionText}")`).first().click()
  await page.waitForTimeout(150)
}

/** 변환 실행 → '저장 완료' 대기 → outputs 디렉터리의 새 파일 반환 */
async function convert(page, { timeout = 60000 } = {}) {
  for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f))
  const btn = page.getByRole('button', { name: /변환 후 저장/ })
  await btn.click()
  return waitSaved(page, timeout)
}
async function waitSaved(page, timeout = 60000) {
  const alert = page.locator('[role="alert"]')
  await alert.waitFor({ timeout })
  const text = (await alert.innerText()).trim()
  // 닫고 다음 테스트로
  await page.locator('[role="alert"] button').first().click().catch(() => {})
  await alert.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
  assert(/저장 완료/.test(text), `저장 완료가 아님: "${text}"`)
  const files = fs.readdirSync(OUT).map((f) => ({ name: f, bytes: fs.readFileSync(path.join(OUT, f)) }))
  assert(files.length > 0, '출력 파일 없음')
  return files
}

/** 저장된 이미지 바이트를 앱 페이지에서 디코드해 픽셀 확인 */
async function decodeInPage(page, bytes) {
  return page.evaluate(async (b64) => {
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([arr]))
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data)
    return { w: bmp.width, h: bmp.height, tl: px(1, 1), center: px(Math.floor(bmp.width / 2), Math.floor(bmp.height / 2)) }
  }, bytes.toString('base64'))
}

const pdfPages = async (bytes) => {
  const { PDFDocument } = require_('pdf-lib')
  return (await PDFDocument.load(new Uint8Array(bytes))).getPageCount()
}

// ── 그룹 A: 이미지 변환 전반 ─────────────────────────────────────────────
async function groupA() {
  console.log('\n[A] 이미지 변환 전반')
  const { app, page } = await launch()
  try {
    await t('A1 파일 추가 → 사이드바·변환 대상 표시', async () => {
      await addFiles(page, 'red-white.png')
      await page.getByText('red-white.png').first().waitFor({ timeout: 10000 })
      await page.getByRole('button', { name: 'JPEG', exact: true }).waitFor({ timeout: 5000 })
    })
    await t('A2 PNG→JPEG', async () => {
      await pickTarget(page, 'JPEG')
      const [f] = await convert(page)
      assert(f.bytes[0] === 0xff && f.bytes[1] === 0xd8, 'JPEG 매직 아님')
    })
    await t('A3 PNG→WebP', async () => {
      await pickTarget(page, 'WebP')
      const [f] = await convert(page)
      assert(f.bytes.slice(0, 4).toString() === 'RIFF' && f.bytes.slice(8, 12).toString() === 'WEBP', 'WebP 매직 아님')
    })
    await t('A4 PNG→BMP', async () => {
      await pickTarget(page, 'BMP')
      const [f] = await convert(page)
      assert(f.bytes.slice(0, 2).toString() === 'BM', 'BMP 매직 아님')
    })
    let icoBytes = null
    await t('A5 PNG→ICO', async () => {
      await pickTarget(page, 'ICO')
      const [f] = await convert(page)
      assert(f.bytes[0] === 0 && f.bytes[1] === 0 && f.bytes[2] === 1 && f.bytes[3] === 0, 'ICO 매직 아님')
      icoBytes = f.bytes
    })
    await t('A6 PNG→SVG 벡터화', async () => {
      await pickTarget(page, 'SVG')
      const [f] = await convert(page)
      assert(f.bytes.toString().includes('<svg'), 'SVG 아님')
    })
    await t('A7 리사이즈(가로 60, 비율 유지)', async () => {
      await pickTarget(page, 'PNG')
      await page.getByPlaceholder('가로 자동').fill('60')
      const [f] = await convert(page)
      const { w, h } = pngInfo(f.bytes)
      assert(w === 60 && h === 40, `60×40 기대, ${w}×${h}`)
      await page.getByPlaceholder('가로 자동').fill('')
      await page.waitForTimeout(500)
    })
    await t('A8 회전 90° → 크기 스왑', async () => {
      await page.locator('svg[data-testid="Rotate90DegreesCwRoundedIcon"]').locator('xpath=ancestor::button[1]').click()
      await page.getByText('90°', { exact: true }).waitFor({ timeout: 3000 })
      const [f] = await convert(page)
      const { w, h } = pngInfo(f.bytes)
      assert(w === 80 && h === 120, `80×120 기대, ${w}×${h}`)
    })
    await t('A9 Ctrl+Z 실행취소 → 0° / Ctrl+Y 재실행 → 90°', async () => {
      await page.waitForTimeout(600) // 이력 디바운스
      await page.keyboard.press('Control+z')
      await page.getByText('0°', { exact: true }).waitFor({ timeout: 3000 })
      await page.keyboard.press('Control+y')
      await page.getByText('90°', { exact: true }).waitFor({ timeout: 3000 })
      await page.keyboard.press('Control+z') // 0°로 복귀
      await page.getByText('0°', { exact: true }).waitFor({ timeout: 3000 })
    })
    await t('A10 흑백 → 중앙 픽셀 무채색', async () => {
      await page.getByText('흑백', { exact: true }).click()
      const [f] = await convert(page)
      const { center } = await decodeInPage(page, f.bytes)
      assert(Math.abs(center[0] - center[1]) <= 2 && Math.abs(center[1] - center[2]) <= 2, `무채색 아님: ${center}`)
      await page.getByText('흑백', { exact: true }).click()
      await page.waitForTimeout(500)
    })
    await t('A11 흰색→투명 (테두리 투명·중앙 유지)', async () => {
      await pickSelect(page, '원본 배경', '흰색 → 투명')
      const [f] = await convert(page)
      assert(pngInfo(f.bytes).colorType === 6, 'RGBA 아님')
      const { tl, center } = await decodeInPage(page, f.bytes)
      assert(tl[3] === 0, `테두리 투명 아님 alpha=${tl[3]}`)
      assert(center[3] === 255 && center[0] > 150, `중앙 훼손: ${center}`)
      await pickSelect(page, '흰색 → 투명', '원본 배경')
    })
    await t('A12 워터마크 합성 (결과가 원본 변환과 다름)', async () => {
      await pickTarget(page, 'JPEG')
      const [plain] = await convert(page)
      await page.getByText('워터마크', { exact: true }).click()
      const [wmres] = await convert(page)
      assert(!plain.bytes.equals(wmres.bytes), '워터마크 적용 결과가 동일')
      await page.getByText('워터마크', { exact: true }).click()
      await page.waitForTimeout(500)
    })
    await t('A13 자르기 드래그 → 출력 축소', async () => {
      await pickTarget(page, 'PNG')
      await page.getByText('자르기', { exact: true }).click()
      // 미리보기 이미지 = 페이지에서 가장 큰 img (푸터 서명·앱 아이콘 제외)
      const imgs = page.locator('img')
      let box = null
      for (let i = 0; i < (await imgs.count()); i++) {
        const bb = await imgs.nth(i).boundingBox()
        if (bb && (!box || bb.width * bb.height > box.width * box.height)) box = bb
      }
      assert(box && box.width > 60, '미리보기 이미지 없음')
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      await page.mouse.move(cx - box.width / 4, cy - box.height / 4)
      await page.mouse.down()
      await page.mouse.move(cx + box.width / 4, cy + box.height / 4, { steps: 8 })
      await page.mouse.up()
      await page.getByText(/자르기 \d+×\d+%/).waitFor({ timeout: 3000 })
      const [f] = await convert(page)
      const { w, h } = pngInfo(f.bytes)
      assert(w < 120 && h < 80, `축소 안 됨: ${w}×${h}`)
      await page.locator('svg[data-testid="CloseRoundedIcon"]').locator('xpath=ancestor::button[1]').first().click() // 자르기 해제
      await page.waitForTimeout(500)
    })
    await t('A14 이미지 2장 → PDF 1개(2페이지)', async () => {
      await addFiles(page, 'blue.png')
      await page.getByText('blue.png').first().waitFor({ timeout: 5000 })
      await pickTarget(page, 'PDF')
      const files = await convert(page)
      assert(files.length === 1, `1개 기대, ${files.length}개`)
      assert(files[0].bytes.slice(0, 4).toString() === '%PDF', 'PDF 아님')
      assert((await pdfPages(files[0].bytes)) === 2, '2페이지 아님')
    })
    if (icoBytes) fs.writeFileSync(path.join(FIX, 'round.ico'), icoBytes)
  } finally {
    await app.close().catch(() => {})
  }
}

// ── 그룹 B: PDF ──────────────────────────────────────────────────────────
async function groupB() {
  console.log('\n[B] PDF 변환·문서 도구')
  const { app, page } = await launch()
  try {
    await t('B1 PDF→PNG 페이지별(2파일)', async () => {
      await addFiles(page, 'two.pdf')
      await page.getByText('two.pdf').first().waitFor({ timeout: 10000 })
      await pickTarget(page, 'PNG')
      const files = await convert(page)
      assert(files.length === 2, `2개 기대, ${files.length}개`)
      for (const f of files) assert(f.bytes[1] === 0x50, 'PNG 매직 아님')
    })
    await t('B2 페이지 도구: 분할(1,2 → 2파일)', async () => {
      for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f))
      await page.getByRole('button', { name: '페이지 도구' }).click()
      await page.getByPlaceholder('예: 1-3,4-10').fill('1,2')
      await page.getByRole('button', { name: '적용 후 저장' }).click()
      const files = await waitSaved(page)
      assert(files.length === 2, `2개 기대, ${files.length}개`)
      for (const f of files) assert((await pdfPages(f.bytes)) === 1, '각 1페이지 아님')
    })
    await t('B3 페이지 도구: 회전(전체 90°)', async () => {
      for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f))
      await page.getByRole('button', { name: '페이지 도구' }).click()
      await pickSelect(page, '분할', '회전')
      await page.getByRole('button', { name: '적용 후 저장' }).click()
      const files = await waitSaved(page)
      assert((await pdfPages(files[0].bytes)) === 2, '2페이지 유지 아님')
    })
    await t('B4 페이지 도구: 삭제(1페이지 제거)', async () => {
      for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f))
      await page.getByRole('button', { name: '페이지 도구' }).click()
      await pickSelect(page, '회전', '페이지 삭제')
      await page.getByPlaceholder('예: 2,5-7').fill('1')
      await page.getByRole('button', { name: '적용 후 저장' }).click()
      const files = await waitSaved(page)
      assert((await pdfPages(files[0].bytes)) === 1, '1페이지 아님')
    })
    await t('B5 페이지 도구: 순서 변경(2,1)', async () => {
      for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f))
      await page.getByRole('button', { name: '페이지 도구' }).click()
      await pickSelect(page, '페이지 삭제', '순서 변경')
      await page.getByPlaceholder('예: 3,1,2 (전체 나열)').fill('2,1')
      await page.getByRole('button', { name: '적용 후 저장' }).click()
      const files = await waitSaved(page)
      assert((await pdfPages(files[0].bytes)) === 2, '2페이지 아님')
    })
    await t('B6 전체 병합(2+1=3페이지)', async () => {
      await addFiles(page, 'one.pdf')
      await page.getByText('one.pdf').first().waitFor({ timeout: 5000 })
      for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f))
      await page.getByRole('button', { name: '전체 병합' }).click()
      const files = await waitSaved(page)
      assert((await pdfPages(files[0].bytes)) === 3, '3페이지 아님')
    })
  } finally {
    await app.close().catch(() => {})
  }
}

// ── 그룹 C: 특수 입력 ────────────────────────────────────────────────────
async function groupC() {
  console.log('\n[C] 특수 입력 (TIFF/SVG/ICO)')
  const { app, page } = await launch()
  try {
    await t('C1 TIFF 입력 → JPEG', async () => {
      await addFiles(page, 'grad.tif')
      await page.getByText('grad.tif').first().waitFor({ timeout: 15000 })
      await pickTarget(page, 'JPEG')
      const [f] = await convert(page)
      assert(f.bytes[0] === 0xff && f.bytes[1] === 0xd8, 'JPEG 매직 아님')
      const { w, h } = await decodeInPage(page, f.bytes)
      assert(w === 64 && h === 48, `64×48 기대, ${w}×${h}`)
      await app.close()
    })
  } finally {
    await app.close().catch(() => {})
  }
  {
    const { app, page } = await launch()
    try {
      await t('C2 SVG 입력 → PNG', async () => {
        await addFiles(page, 'rect.svg')
        await page.getByText('rect.svg').first().waitFor({ timeout: 10000 })
        await pickTarget(page, 'PNG')
        const [f] = await convert(page)
        const { center } = await decodeInPage(page, f.bytes)
        assert(center[0] > 150 && center[1] < 100, `빨강 아님: ${center}`)
      })
      await app.close()
    } finally {
      await app.close().catch(() => {})
    }
  }
  {
    const { app, page } = await launch()
    try {
      await t('C3 ICO 입력(라운드트립) → PNG', async () => {
        assert(fs.existsSync(path.join(FIX, 'round.ico')), 'A5의 ICO 산출물 없음')
        await addFiles(page, 'round.ico')
        await page.getByText('round.ico').first().waitFor({ timeout: 10000 })
        await pickTarget(page, 'PNG')
        const [f] = await convert(page)
        assert(f.bytes[1] === 0x50, 'PNG 매직 아님')
      })
    } finally {
      await app.close().catch(() => {})
    }
  }
}

// ── 그룹 D: AI 배경 제거 ─────────────────────────────────────────────────
async function groupD() {
  console.log('\n[D] AI 배경 제거 (bgrm:// + onnx)')
  const { app, page } = await launch()
  try {
    await t('D1 AI 배경 제거 → 미리보기 교체·투명 PNG', async () => {
      await addFiles(page, 'subject.png')
      await page.getByText('subject.png').first().waitFor({ timeout: 10000 })
      await pickTarget(page, 'PNG')
      await pickSelect(page, '원본 배경', 'AI 배경 제거')
      // 진행 표시가 떴다가 사라질 때까지 (모델 로드+추론, 최대 5분)
      await page.getByText(/AI 배경 제거 중|모델/).waitFor({ timeout: 30000 }).catch(() => {})
      const start = Date.now()
      while (Date.now() - start < 300000) {
        const prog = await page.locator('.MuiLinearProgress-root').count()
        const err = await page.locator('[role="alert"]').filter({ hasText: /실패|오류/ }).count()
        assert(err === 0, 'AI 배경 제거 실패 알림')
        if (prog === 0) break
        await page.waitForTimeout(1000)
      }
      const err = await page.locator('[role="alert"]').filter({ hasText: /실패|오류/ }).count()
      assert(err === 0, 'AI 배경 제거 실패 알림')
      const [f] = await convert(page, { timeout: 120000 })
      assert(pngInfo(f.bytes).colorType === 6, 'RGBA 아님')
      const { tl, center } = await decodeInPage(page, f.bytes)
      console.log(`    corner alpha=${tl[3]}, center=${JSON.stringify(center)}`)
      assert(tl[3] < 255, `모서리 배경이 그대로: alpha=${tl[3]}`)
    })
  } finally {
    await app.close().catch(() => {})
  }
}

// ── 실행 ─────────────────────────────────────────────────────────────────
const main = async () => {
  // 난독화 적용 확인 (테스트 대상이 실제로 난독화 빌드인지)
  const mainJs = fs.readFileSync(path.join(PROJECT, 'out/main/index.js'), 'utf8')
  assert(mainJs.includes('_0x'), 'out/main 이 난독화 빌드가 아님 — npm run build 먼저')
  console.log('난독화 빌드 확인됨 (out/main/index.js에 _0x 식별자)')

  await makeFixtures()
  await groupA()
  await groupB()
  await groupC()
  await groupD()

  const pass = results.filter((r) => r.ok).length
  console.log(`\n결과: ${pass}/${results.length} PASS`)
  for (const r of results.filter((r) => !r.ok)) console.log(`  ✗ ${r.name}: ${r.err}`)
  process.exit(pass === results.length ? 0 : 1)
}
main().catch((e) => {
  console.error('하네스 오류:', e)
  process.exit(2)
})
