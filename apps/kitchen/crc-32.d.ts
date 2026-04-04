declare module "crc-32" {
  function buf(data: Uint8Array | number[]): number;
  export default { buf };
}
