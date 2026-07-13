import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectFileKind, kindFromExtension, extFor } from '../src/core/fileTypes'
import { targetsFor, canConvert, IMAGE_OUTPUTS } from '../src/core/conversions'
import { encodeBmp } from '../src/core/bmp'
import { encodeIco } from '../src/core/ico'

test('매직 바이트로 형식 감지', () => {
  assert.equal(detectFileKind('a.bin', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), 'pdf')
  assert.equal(detectFileKind('a.bin', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png')
  assert.equal(detectFileKind('a.bin', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpeg')
  assert.equal(detectFileKind('a.bin', new Uint8Array([0x42, 0x4d, 0x36, 0x00])), 'bmp')
  assert.equal(detectFileKind('a.bin', new TextEncoder().encode('GIF89a....')), 'gif')
  assert.equal(detectFileKind('a.bin', new TextEncoder().encode('\x00\x00\x00 ftypavif....')), 'avif')
  assert.equal(detectFileKind('a.bin', new TextEncoder().encode('\x00\x00\x00 ftypheic....')), 'heic')
  assert.equal(detectFileKind('a.bin', new TextEncoder().encode('\x00\x00\x00 ftypmif1....')), 'heic')
  assert.equal(detectFileKind('a.bin', new TextEncoder().encode('II*\x00....')), 'tiff')
  assert.equal(detectFileKind('a.bin', new TextEncoder().encode('MM\x00*....')), 'tiff')
  assert.equal(detectFileKind('a.bin', new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x02, 0x00])), 'ico')
  assert.equal(detectFileKind('a.bin', new TextEncoder().encode('<?xml version="1.0"?>\n<svg xmlns=')), 'svg')
})

test('내용 없으면 확장자로 폴백', () => {
  assert.equal(kindFromExtension('photo.JPG'), 'jpeg')
  assert.equal(kindFromExtension('pic.bmp'), 'bmp')
  assert.equal(kindFromExtension('anim.gif'), 'gif')
  assert.equal(kindFromExtension('logo.svg'), 'svg')
  assert.equal(kindFromExtension('weird.xyz'), 'unknown')
  // DICOM 지원 제거(2026-07-13) — 전용 변환기 프로젝트로 분리
  assert.equal(kindFromExtension('scan.dcm'), 'unknown')
})

test('저장용 대표 확장자', () => {
  assert.equal(extFor('jpeg'), 'jpg')
  assert.equal(extFor('webp'), 'webp')
  assert.equal(extFor('bmp'), 'bmp')
})

test('변환 경로: PDF는 이미지로, 이미지는 PDF/이미지 출력 포맷으로', () => {
  assert.deepEqual(targetsFor('pdf').map((t) => t.to).sort(), ['jpeg', 'png', 'webp'])
  const pngTargets = targetsFor('png').map((t) => t.to)
  assert.ok(pngTargets.includes('pdf'))
  for (const out of IMAGE_OUTPUTS) assert.ok(pngTargets.includes(out))
  // 같은 포맷으로도 변환 가능 (크기·품질만 바꿔 재저장)
  assert.ok(pngTargets.includes('png'))
  assert.ok(!pngTargets.includes('dicom' as never))
})

test('읽기 전용 포맷(GIF/AVIF/HEIC/TIFF)도 입력이면 변환 대상이 있다', () => {
  for (const kind of ['gif', 'avif', 'heic', 'tiff'] as const) {
    const tos = targetsFor(kind).map((t) => t.to)
    assert.ok(tos.includes('pdf'))
    assert.ok(tos.includes('png'))
    // 단, 래스터 재저장 대상엔 자기 자신이 없다 (IMAGE_OUTPUTS 밖)
    assert.ok(!IMAGE_OUTPUTS.includes(kind))
    assert.ok(canConvert(kind))
  }
})

test('특수 출력: 이미지 소스는 ICO/SVG 벡터화 대상이 있고, SVG 소스는 SVG 벡터화가 없다', () => {
  const pngTos = targetsFor('png').map((t) => t.to)
  assert.ok(pngTos.includes('ico'))
  assert.ok(pngTos.includes('svg'))
  const svgTos = targetsFor('svg').map((t) => t.to)
  assert.ok(svgTos.includes('ico'))
  assert.ok(!svgTos.includes('svg'))
})

test('ICO 인코더: 헤더·엔트리·PNG 임베드', () => {
  const png1 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])
  const png2 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9])
  const ico = encodeIco([
    { size: 256, png: png1 },
    { size: 16, png: png2 }
  ])
  const view = new DataView(ico.buffer)
  assert.equal(view.getUint16(2, true), 1) // type = icon
  assert.equal(view.getUint16(4, true), 2) // count
  assert.equal(ico[6], 0) // 256 → 0 표기
  assert.equal(ico[6 + 16], 16)
  const off1 = view.getUint32(6 + 12, true)
  assert.equal(off1, 6 + 32) // 헤더 뒤부터 데이터
  assert.deepEqual([...ico.subarray(off1, off1 + png1.length)], [...png1])
  const off2 = view.getUint32(6 + 16 + 12, true)
  assert.deepEqual([...ico.subarray(off2, off2 + png2.length)], [...png2])
  assert.equal(ico.length, 6 + 32 + png1.length + png2.length)
})

test('이미지→PDF는 여러 장 합치기(merges)', () => {
  assert.equal(targetsFor('png').find((t) => t.to === 'pdf')?.merges, true)
})

test('BMP 인코더: 헤더·크기·픽셀(BGR, bottom-up, 행 패딩)', () => {
  // 2×2: 좌상 빨강, 우상 초록, 좌하 파랑, 우하 흰색
  const rgba = new Uint8Array([
    255, 0, 0, 255,   0, 255, 0, 255,
    0, 0, 255, 255,   255, 255, 255, 255
  ])
  const bmp = encodeBmp(2, 2, rgba)
  const view = new DataView(bmp.buffer)
  assert.equal(bmp[0], 0x42) // 'B'
  assert.equal(bmp[1], 0x4d) // 'M'
  const rowSize = 8 // 2px*3B=6 → 4바이트 배수로 8
  assert.equal(view.getUint32(2, true), 54 + rowSize * 2) // 파일 크기
  assert.equal(view.getInt32(18, true), 2) // width
  assert.equal(view.getInt32(22, true), 2) // height
  assert.equal(view.getUint16(28, true), 24) // bpp
  // bottom-up: 첫 행 = 원본 아랫줄(파랑, 흰색), BGR 순서
  assert.deepEqual([...bmp.subarray(54, 60)], [255, 0, 0, 255, 255, 255]) // 파랑(B=255,G=0,R=0), 흰색
  // 둘째 행 = 원본 윗줄(빨강, 초록)
  assert.deepEqual([...bmp.subarray(54 + rowSize, 54 + rowSize + 6)], [0, 0, 255, 0, 255, 0])
})
