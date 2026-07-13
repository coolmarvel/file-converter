/** 타입 정의가 없는 순수 JS 라이브러리용 최소 심 */

declare module 'utif2' {
  export interface IFD {
    width: number
    height: number
    [tag: string]: unknown
  }
  export function decode(buffer: ArrayBuffer): IFD[]
  export function decodeImage(buffer: ArrayBuffer, ifd: IFD): void
  export function toRGBA8(ifd: IFD): Uint8Array
}

declare module 'imagetracerjs' {
  export interface TraceOptions {
    numberofcolors?: number
    ltres?: number
    qtres?: number
    pathomit?: number
    strokewidth?: number
    scale?: number
    blurradius?: number
    blurdelta?: number
    [key: string]: unknown
  }
  const ImageTracer: {
    imagedataToSVG(imageData: ImageData, options?: TraceOptions | string): string
  }
  export default ImageTracer
}
