import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectFileKind, kindFromExtension } from '../src/core/fileTypes'
import { targetsFor, canConvert } from '../src/core/conversions'

test('매직 바이트로 형식 감지', () => {
  assert.equal(detectFileKind('a.bin', new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), 'pdf')
  assert.equal(detectFileKind('a.bin', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png')
  assert.equal(detectFileKind('a.bin', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpeg')
})

test('DICOM은 128바이트 뒤 DICM 마커로 감지', () => {
  const buf = new Uint8Array(140)
  buf.set([0x44, 0x49, 0x43, 0x4d], 128) // "DICM"
  assert.equal(detectFileKind('noext', buf), 'dicom')
})

test('내용 없으면 확장자로 폴백', () => {
  assert.equal(detectFileKind('scan.dcm'), 'dicom')
  assert.equal(kindFromExtension('photo.JPG'), 'jpeg')
  assert.equal(kindFromExtension('weird.xyz'), 'unknown')
})

test('변환 경로: PDF는 이미지로, 이미지는 PDF/DICOM/다른 이미지로', () => {
  assert.deepEqual(targetsFor('pdf').map((t) => t.to).sort(), ['jpeg', 'png'])
  const pngTargets = targetsFor('png').map((t) => t.to)
  assert.ok(pngTargets.includes('pdf'))
  assert.ok(pngTargets.includes('dicom'))
  assert.ok(pngTargets.includes('jpeg'))
  assert.ok(!pngTargets.includes('png')) // 자기 자신으로는 변환 안 함
})

test('DICOM은 v1에서 변환 대상 없음(입력→DICOM만)', () => {
  assert.equal(canConvert('dicom'), false)
})

test('이미지→PDF는 여러 장 합치기(merges)', () => {
  assert.equal(targetsFor('png').find((t) => t.to === 'pdf')?.merges, true)
})
