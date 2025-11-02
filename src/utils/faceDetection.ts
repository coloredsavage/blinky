// Eye landmark indices for MediaPipe Face Mesh
export const LEFT_EYE_INDICES = [33, 133, 160, 159, 158, 144, 145, 153];
export const RIGHT_EYE_INDICES = [362, 263, 387, 386, 385, 373, 374, 380];

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const getEyesBoundingBox = (landmarks: any[]): BoundingBox | null => {
  if (!landmarks || landmarks.length === 0) return null;

  const eyeIndices = [...LEFT_EYE_INDICES, ...RIGHT_EYE_INDICES];

  let minX = 1, maxX = 0, minY = 1, maxY = 0;

  eyeIndices.forEach(idx => {
    const point = landmarks[idx];
    if (point) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  });

  return { minX, maxX, minY, maxY };
};

export const calculateEAR = (landmarks: any[], eyeIndices: number[]): number => {
  if (!landmarks || eyeIndices.length !== 8) return 0;

  const [p1, p2, p3, p4, p5, p6, p7, p8] = eyeIndices.map(i => landmarks[i]);

  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6 || !p7 || !p8) return 0;

  const vertical1 = Math.sqrt(
    Math.pow(p2.x - p6.x, 2) + Math.pow(p2.y - p6.y, 2) + Math.pow(p2.z - p6.z, 2)
  );
  const vertical2 = Math.sqrt(
    Math.pow(p3.x - p5.x, 2) + Math.pow(p3.y - p5.y, 2) + Math.pow(p3.z - p5.z, 2)
  );
  const horizontal = Math.sqrt(
    Math.pow(p1.x - p4.x, 2) + Math.pow(p1.y - p4.y, 2) + Math.pow(p1.z - p4.z, 2)
  );

  return (vertical1 + vertical2) / (2.0 * horizontal);
};
