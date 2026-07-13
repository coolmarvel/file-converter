import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectFileKind, kindFromExtension, extFor } from '../src/core/fileTypes'
import { targetsFor, canConvert, IMAGE_OUTPUTS } from '../src/core/conversions'
import { encodeBmp } from '../src/core/bmp'

test('매직 바이트로 형식 감지', () => {
  assert.equal(detectFileKind('a.bin', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), 'pdf')
  assert.equal(detectFileKind('a.bin', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png')
  assert.equal(detectFileKind('a.bin', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpeg')
  assert.equal(detectFileKind('a.bin', new Uint8Array([0x42, 0x4d, 0x36, 0x00])), 'bmp')
  assert.equal(detectFileKind('a.bin', new TextEncoder().encode('GIF89a....')), 'gif')
  assert.equal(detectFileKind('a.bin', new TextEncoder().encode('\x00\x00\x00 ftypavif....')), 'avif')
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

test('읽기 전용 포맷(GIF/SVG/AVIF)도 입력이면 변환 대상이 있다', () => {
  for (const kind of ['gif', 'svg', 'avif'] as const) {
    const tos = targetsFor(kind).map((t) => t.to)
    assert.ok(tos.includes('pdf'))
    assert.ok(tos.includes('png'))
    // 단, 읽기 전용 포맷 자신은 출력 대상이 아니다
    assert.ok(!tos.includes(kind))
    assert.ok(canConvert(kind))
  }
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
