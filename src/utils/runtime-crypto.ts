function getCrypto(): Crypto {
  const cryptoObject = globalThis.crypto;
  if (!cryptoObject) {
    throw new Error('Secure crypto API is unavailable in this runtime');
  }
  return cryptoObject;
}

export function randomUuid(): string {
  return getCrypto().randomUUID();
}

export function randomIntInclusive(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new Error('Invalid random range');
  }

  const cryptoObject = getCrypto();
  const range = max - min + 1;
  const maxUint32 = 0x100000000;
  const cutoff = maxUint32 - (maxUint32 % range);
  const bucket = new Uint32Array(1);

  do {
    cryptoObject.getRandomValues(bucket);
  } while (bucket[0]! >= cutoff);

  return min + (bucket[0]! % range);
}
