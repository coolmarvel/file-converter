/* 앱 브랜딩 자산 생성 — 중립 아이콘 (개인 사진 사용 금지 정책, ADR-0004 개정)
 * SVG(그라데이션 라운드 사각형 + 문서 + 순환 화살표) → resvg 렌더 → icon.png/ico,
 * UI용 app-icon.png, NSIS 사이드바/헤더 BMP까지 생성.
 * 임시 의존성: npm i --no-save @resvg/resvg-js png-to-ico jimp
 * 주의: 얼굴 사진(face.png)은 더 이상 만들지 않는다. sign.png(서명)는 워터마크 기능용으로 유지·불변.
 */
const { Resvg } = require('@resvg/resvg-js')
const Jimp = require('jimp')
const fs = require('fs')
const path = require('path')

const PROJ = path.join(__dirname, '..')
const BUILD = path.join(PROJ, 'build')
const ASSETS = path.join(PROJ, 'src/renderer/src/assets')
fs.mkdirSync(BUILD, { recursive: true })
fs.mkdirSync(ASSETS, { recursive: true })

// ── 아이콘 SVG (1024×1024) ─────────────────────────────
function buildIconSvg() {
  const C = 512 // 중심
  const R = 380 // 화살표 궤도 반지름
  const SW = 58 // 화살표 두께
  const pt = (deg) => {
    const a = (deg * Math.PI) / 180
    return [C + R * Math.cos(a), C + R * Math.sin(a)]
  }
  const f = (n) => n.toFixed(1)
  // 호 + 진행 방향 화살촉 (시계방향). startDeg→endDeg 는 화면 각도(y 아래 방향).
  const arrowArc = (startDeg, endDeg) => {
    const [sx, sy] = pt(startDeg)
    const [ex, ey] = pt(endDeg)
    const a = (endDeg * Math.PI) / 180
    const tx = -Math.sin(a) // 시계방향 접선
    const ty = Math.cos(a)
    const px = -ty // 접선의 수직
    const py = tx
    const tipX = ex + tx * 95
    const tipY = ey + ty * 95
    const b1x = ex + px * 62
    const b1y = ey + py * 62
    const b2x = ex - px * 62
    const b2y = ey - py * 62
    return (
      `<path d="M ${f(sx)} ${f(sy)} A ${R} ${R} 0 0 1 ${f(ex)} ${f(ey)}" ` +
      `stroke="#FFFFFF" stroke-width="${SW}" stroke-linecap="round" fill="none"/>` +
      `<path d="M ${f(tipX)} ${f(tipY)} L ${f(b1x)} ${f(b1y)} L ${f(b2x)} ${f(b2y)} Z" ` +
      `fill="#FFFFFF" stroke="#FFFFFF" stroke-width="14" stroke-linejoin="round"/>`
    )
  }
  // 문서 시트: 중앙, 내용 줄 3개
  const sheetW = 330, sheetH = 420, sx = C - sheetW / 2, sy = C - sheetH / 2
  const line = (y, w) =>
    `<rect x="${C - w / 2}" y="${y}" width="${w}" height="34" rx="17" fill="#B9CFF9"/>`
  return `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5E9BFF"/>
      <stop offset="1" stop-color="#2B5FD9"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="232" fill="url(#bg)"/>
  <rect width="1024" height="512" rx="232" fill="url(#sheen)"/>
  <rect x="${sx}" y="${sy}" width="${sheetW}" height="${sheetH}" rx="40" fill="#FFFFFF"/>
  ${line(sy + 92, 210)}
  ${line(sy + 176, 210)}
  ${line(sy + 260, 150)}
  ${arrowArc(196, 344)}
  ${arrowArc(16, 164)}
</svg>`
}

function renderPng(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
}

// 24-bit bottom-up BMP (NSIS 호환: 양수 높이, 알파 없음, 흰 배경 합성)
function writeBmp(img, name) {
  const flat = new Jimp(img.bitmap.width, img.bitmap.height, 0xffffffff)
  flat.composite(img, 0, 0)
  const W = flat.bitmap.width, H = flat.bitmap.height, data = flat.bitmap.data
  const rowSize = Math.floor((24 * W + 31) / 32) * 4
  const pad = rowSize - W * 3
  const pix = rowSize * H
  const buf = Buffer.alloc(54 + pix)
  buf.write('BM', 0)
  buf.writeUInt32LE(54 + pix, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(W, 18)
  buf.writeInt32LE(H, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(0, 30)
  buf.writeUInt32LE(pix, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)
  let off = 54
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      buf[off++] = data[i + 2]
      buf[off++] = data[i + 1]
      buf[off++] = data[i]
    }
    for (let p = 0; p < pad; p++) buf[off++] = 0
  }
  fs.writeFileSync(path.join(BUILD, name), buf)
}

;(async () => {
  const svg = buildIconSvg()

  // icon.png (1024) — SVG 직접 렌더라 어떤 크기에서도 부드러움
  fs.writeFileSync(path.join(BUILD, 'icon.png'), renderPng(svg, 1024))

  // icon.ico — 각 크기를 SVG에서 개별 렌더(다운스케일 아님 → 소형에서도 선명)
  const pngToIco = require('png-to-ico').default || require('png-to-ico')
  const sizes = [256, 128, 64, 48, 32, 16]
  const icoPngs = sizes.map((s) => renderPng(svg, s))
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), await pngToIco(icoPngs))

  // UI용 앱 아이콘 (헤더 로고)
  fs.writeFileSync(path.join(ASSETS, 'app-icon.png'), renderPng(svg, 256))

  // ── NSIS 설치 화면 자산 (아이콘 + 서명 + 저작권 텍스트, 사진 없음) ──
  const fontS = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK)
  const icon120 = await Jimp.read(renderPng(svg, 120))
  const sign = await Jimp.read(path.join(ASSETS, 'sign.png'))

  // 사이드바 164×314: 그라데이션 + 아이콘 + 서명 + 저작권(ASCII)
  const sb = new Jimp(164, 314, 0xffffffff)
  sb.scan(0, 0, 164, 314, function (x, y, idx) {
    const t = y / 314
    const d = this.bitmap.data
    d[idx] = Math.round(255 + (232 - 255) * t)
    d[idx + 1] = Math.round(255 + (240 - 255) * t)
    d[idx + 2] = Math.round(255 + (252 - 255) * t)
    d[idx + 3] = 255
  })
  sb.composite(icon120, (164 - 120) / 2, 26)
  const signSb = sign.clone().scaleToFit(124, 66)
  sb.composite(signSb, Math.round((164 - signSb.bitmap.width) / 2), 168)
  sb.print(fontS, 0, 250, { text: 'Created by', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 164)
  sb.print(fontS, 0, 270, { text: 'Lee Seong Hyun', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 164)
  sb.print(fontS, 0, 292, { text: '(C) 2026', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 164)
  writeBmp(sb, 'installerSidebar.bmp')
  writeBmp(sb, 'uninstallerSidebar.bmp')

  // 헤더 150×57: 아이콘 미니 + 이름
  const fontHd = await Jimp.loadFont(Jimp.FONT_SANS_10_BLACK)
  const icon40 = await Jimp.read(renderPng(svg, 40))
  const hd = new Jimp(150, 57, 0xffffffff)
  hd.composite(icon40, 8, 8)
  hd.print(fontHd, 54, 23, 'File Converter')
  writeBmp(hd, 'installerHeader.bmp')

  // 검증 출력
  const chk = fs.readFileSync(path.join(BUILD, 'installerSidebar.bmp'))
  console.log('sidebar bmp: W', chk.readInt32LE(18), 'H', chk.readInt32LE(22), 'bpp', chk.readUInt16LE(28))
  console.log('icon.ico bytes:', fs.statSync(path.join(BUILD, 'icon.ico')).size, '| DONE')
})().catch((e) => { console.error(e); process.exit(1) })
