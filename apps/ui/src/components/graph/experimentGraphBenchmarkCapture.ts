export type BenchmarkGraphCapturePayload = Readonly<{
  png: Blob;
  pngBase64: string;
  svgSha256: string;
  pngSha256: string;
  analysisStateFingerprint: string;
}>;

export async function createBenchmarkGraphCapturePayload(
  input: Readonly<{
    svgText: string;
    width: number;
    height: number;
    analysisState: string;
  }>,
  ports: Readonly<{
    renderPng: (svgText: string, width: number, height: number) => Promise<Blob>;
    sha256: (value: string | Blob) => Promise<string>;
    encodeBase64: (blob: Blob) => Promise<string>;
  }>,
): Promise<BenchmarkGraphCapturePayload> {
  const png = await ports.renderPng(input.svgText, input.width, input.height);
  const [svgSha256, pngSha256, analysisStateFingerprint, pngBase64] = await Promise.all([
    ports.sha256(input.svgText),
    ports.sha256(png),
    ports.sha256(input.analysisState),
    ports.encodeBase64(png),
  ]);
  return { png, pngBase64, svgSha256, pngSha256, analysisStateFingerprint };
}
