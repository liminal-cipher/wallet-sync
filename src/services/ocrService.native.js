export async function recogniseImage(uri) {
  try {
    const { default: ocr } = await import("rn-mlkit-ocr");
    return (await ocr.recognizeText(uri, "korean")).text;
  } catch {
    throw new Error("이미지 인식을 완료하지 못했습니다. 한국어 OCR 개발 빌드가 필요합니다. 원본은 보관되며 직접 입력할 수 있습니다.");
  }
}
