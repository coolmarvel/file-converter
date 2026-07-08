/* 얼굴 원형 누끼 아이콘 + 브랜딩 자산 생성 (jimp)
 * 누끼: 테두리에서 시작하는 flood fill 로 "연결된 밝은 회색 배경"만 제거 → 흰 셔츠 깃(내부 고립)은 보존.
 * 사람을 부드러운 원형 그라데이션 디스크 위에 합성.
 */
const Jimp = require('jimp')
const fs = require('fs')
const path = require('path')

const SRC = '/mnt/c/Users/user/Desktop/이성현'
const PROJ = '/home/jace/file-converter'
const BUILD = path.join(PROJ, 'build')
const ASSETS = path.join(PROJ, 'src/renderer/src/assets')
fs.mkdirSync(BUILD, { recursive: true })
fs.mkdirSync(ASSETS, { recursive: true })

// 테두리 연결 배경 제거: 밝고(>200) 회색(채널 편차<22)인 픽셀만, 테두리에서 연결된 것만.
function removeBg(img) {
  const W = img.bitmap.width, H = img.bitmap.height
  const d = img.bitmap.data
  const isBg = (i) => {
    const r = d[i], g = d[i + 1], b = d[i + 2]
    const lum = 0.299 * r + 0.587 * g + 0.114 * b
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    return lum > 200 && spread < 22
  }
  const visited = new Uint8Array(W * H)
  const stack = []
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const p = y * W + x
    if (visited[p]) return
    if (!isBg(p * 4)) return
    visited[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1) }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y) }
  while (stack.length) {
    const p = stack.pop()
    const x = p % W, y = (p / W) | 0
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1)
  }
  // 배경 → 투명. 경계 살짝 페더링(배경에 인접한 유지 픽셀 alpha 소폭 감소는 생략, 다운스케일 AA로 처리)
  for (let p = 0; p < W * H; p++) if (visited[p]) d[p * 4 + 3] = 0
  return img
}

// 원형 마스크 + 얇은 흰 링 (부드러운 안티앨리어싱)
function circular(img) {
  const M = img.bitmap.width
  const R = M / 2, cx = R, cy = R
  const ringW = Math.round(M * 0.012)
  img.scan(0, 0, M, M, function (x, y, idx) {
    const d = this.bitmap.data
    const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
    if (dist <= R - ringW) {
      // 유지 (사람 or 디스크). alpha 그대로.
    } else if (dist <= R - 1) {
      d[idx] = 255; d[idx + 1] = 255; d[idx + 2] = 255; d[idx + 3] = 255
    } else if (dist <= R + 0.5) {
      d[idx] = 255; d[idx + 1] = 255; d[idx + 2] = 255
      d[idx + 3] = Math.max(0, Math.min(255, Math.round((R + 0.5 - dist) * 255)))
    } else {
      d[idx + 3] = 0
    }
  })
  return img
}

// 부드러운 파란 그라데이션 원형 디스크
function gradientDisc(M) {
  const disc = new Jimp(M, M, 0x00000000)
  const R = M / 2, cx = R, cy = R
  disc.scan(0, 0, M, M, function (x, y, idx) {
    const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
    if (dist > R) return
    const t = y / M
    const r = Math.round(242 + (214 - 242) * t)
    const g = Math.round(246 + (230 - 246) * t)
    const b = Math.round(252 + (251 - 252) * t)
    const dd = this.bitmap.data
    dd[idx] = r; dd[idx + 1] = g; dd[idx + 2] = b; dd[idx + 3] = 255
  })
  return disc
}

function buildIco(pngBuffers) {
  const n = pngBuffers.length
  const header = Buffer.alloc(6 + 16 * n)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(n, 4)
  let offset = 6 + 16 * n
  const parts = []
  pngBuffers.forEach((p, i) => {
    const e = 6 + 16 * i
    header.writeUInt8(p.size >= 256 ? 0 : p.size, e); header.writeUInt8(p.size >= 256 ? 0 : p.size, e + 1)
    header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3)
    header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6)
    header.writeUInt32LE(p.buf.length, e + 8); header.writeUInt32LE(offset, e + 12)
    offset += p.buf.length; parts.push(p.buf)
  })
  return Buffer.concat([header, ...parts])
}

;(async () => {
  const face = await Jimp.read(path.join(SRC, '이성현_반명함.jpg'))
  const W = face.bitmap.width, H = face.bitmap.height
  removeBg(face) // 배경 투명화 (원본 해상도에서)

  // 머리·어깨 정사각 크롭 → 사람 레이어
  const yOff = Math.round(H * 0.05)
  const person = face.clone().crop(0, yOff, W, W).resize(1000, 1000)

  // 디스크 위에 합성 (1024)
  const M = 1024
  const master = gradientDisc(M)
  master.composite(person, (M - 1000) / 2, (M - 1000) / 2)
  circular(master)

  await master.clone().writeAsync(path.join(BUILD, 'icon.png'))
  const sizes = [256, 128, 64, 48, 32, 16]
  const pngBufs = []
  for (const s of sizes) pngBufs.push(await master.clone().resize(s, s).getBufferAsync(Jimp.MIME_PNG))
  // png-to-ico = rcedit/Windows 호환 표준 ICO (직접 인코딩보다 exe 아이콘 임베드 신뢰도 높음)
  const pngToIco = require('png-to-ico').default || require('png-to-ico')
  fs.writeFileSync(path.join(BUILD, 'icon.ico'), await pngToIco(pngBufs))
  await master.clone().resize(256, 256).writeAsync(path.join(ASSETS, 'face.png'))

  // 서명: 이미 투명 → 트림 + 검정 또렷하게
  const sign = await Jimp.read(path.join(SRC, '이성현_서명.png'))
  sign.autocrop({ tolerance: 0.002, cropOnlyFrames: false })
  sign.scan(0, 0, sign.bitmap.width, sign.bitmap.height, function (x, y, idx) {
    const d = this.bitmap.data
    if (d[idx + 3] > 40) { d[idx] = 20; d[idx + 1] = 24; d[idx + 2] = 30 }
  })
  await sign.writeAsync(path.join(ASSETS, 'sign.png'))

  // ── NSIS 설치 화면 자산 (얼굴·서명·저작권) ──────────────
  const fontS = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK)

  // 24-bit bottom-up BMP 직접 인코딩 (NSIS 호환: 양수 높이, 알파 없음, 흰 배경 합성)
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
    buf.writeInt32LE(H, 22) // 양수 = bottom-up
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

  // 사이드바 164x314: 그라데이션 + 얼굴 원형 + 서명 + 저작권(ASCII)
  const sb = new Jimp(164, 314, 0xffffffff)
  sb.scan(0, 0, 164, 314, function (x, y, idx) {
    const t = y / 314
    const d = this.bitmap.data
    d[idx] = Math.round(255 + (232 - 255) * t)
    d[idx + 1] = Math.round(255 + (240 - 255) * t)
    d[idx + 2] = Math.round(255 + (252 - 255) * t)
    d[idx + 3] = 255
  })
  sb.composite(master.clone().resize(120, 120), (164 - 120) / 2, 26)
  const signSb = sign.clone().scaleToFit(124, 66)
  sb.composite(signSb, Math.round((164 - signSb.bitmap.width) / 2), 168)
  sb.print(fontS, 0, 250, { text: 'Created by', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 164)
  sb.print(fontS, 0, 270, { text: 'Lee Seong Hyun', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 164)
  sb.print(fontS, 0, 292, { text: '(C) 2026', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 164)
  await writeBmp(sb, 'installerSidebar.bmp')
  await writeBmp(sb, 'uninstallerSidebar.bmp')

  // 헤더 150x57: 얼굴 미니 + 이름 (한 줄, 겹침 방지)
  const fontHd = await Jimp.loadFont(Jimp.FONT_SANS_10_BLACK)
  const hd = new Jimp(150, 57, 0xffffffff)
  hd.composite(master.clone().resize(40, 40), 8, 8)
  hd.print(fontHd, 54, 23, 'File Converter')
  await writeBmp(hd, 'installerHeader.bmp')

  // 저작권 라이선스 (개인 저작물, CM병원 언급 없음)
  const license = [
    '파일 변환기 (File Converter)',
    'PDF · 이미지 · DICOM 오프라인 변환 · 편집 프로그램',
    '',
    '────────────────────────────────────────────────────────',
    'Copyright © 2026 이성현 (Lee Seong Hyun). All rights reserved.',
    '제작자 : 이성현',
    '────────────────────────────────────────────────────────',
    '',
    '1. 저작권',
    '   본 소프트웨어의 저작권은 전적으로 제작자 이성현에게 있습니다.',
    '   이성현이 직접 설계·개발한 개인 저작물입니다.',
    '',
    '2. 사용',
    '   본 프로그램은 제작자가 개인적으로 만든 프로그램입니다.',
    '',
    '3. 제한',
    '   제작자의 사전 동의 없이 본 소프트웨어를 재배포·판매하거나,',
    '   저작권 표시를 제거·변경할 수 없습니다.',
    '',
    '4. 보증의 부인',
    '   본 소프트웨어는 "있는 그대로(as-is)" 제공되며, 어떠한 명시적·묵시적',
    '   보증도 하지 않습니다. 사용으로 인한 결과의 책임은 사용자에게 있습니다.',
    '',
    '본 설치를 계속하면 위 내용에 동의하는 것으로 간주합니다.',
    ''
  ].join('\r\n')
  fs.writeFileSync(path.join(BUILD, 'license.txt'), '﻿' + license, 'utf8')

  // BMP 헤더 검증
  const chk = fs.readFileSync(path.join(BUILD, 'installerSidebar.bmp'))
  console.log('sidebar bmp: W', chk.readInt32LE(18), 'H', chk.readInt32LE(22), 'bpp', chk.readUInt16LE(28), 'comp', chk.readUInt32LE(30))
  console.log('icon.ico bytes:', fs.statSync(path.join(BUILD, 'icon.ico')).size, '| DONE')
})().catch((e) => { console.error(e); process.exit(1) })
