export type MeshVertex = [number, number, number];
export type MeshTriangle = [MeshVertex, MeshVertex, MeshVertex];

/** Test the positions actually sent to the Float32 GPU buffer, with no area tolerance. */
export function drawableTriangle(face: readonly MeshVertex[]): boolean {
  if (face.length !== 3 || face.some(p => p.length !== 3 || !p.every(Number.isFinite))) {
    throw new Error('Invalid mesh triangle');
  }
  const [a, b, c] = face.map(p => p.map(Math.fround));
  if (![...a, ...b, ...c].every(Number.isFinite)) throw new Error('Mesh position exceeds GPU precision range');
  const u = b.map((n, i) => n - a[i]), v = c.map((n, i) => n - a[i]);
  return u[1] * v[2] - u[2] * v[1] !== 0 ||
    u[2] * v[0] - u[0] * v[2] !== 0 ||
    u[0] * v[1] - u[1] * v[0] !== 0;
}

/** Repeated faces do not cancel a roof's boundary; shared edges still do. */
export function roofBoundaryEdges(parts: readonly { material: string; vertices: MeshVertex[] }[]):
  { a: MeshVertex; b: MeshVertex }[] {
  const key = (p: MeshVertex) => p.join(',');
  const seen = new Set<string>();
  const edges = new Map<string, { a: MeshVertex; b: MeshVertex; count: number }>();
  for (const part of parts) {
    if (part.material !== 'roof') continue;
    if (part.vertices.length % 3) throw new Error('Incomplete roof triangle');
    for (let i = 0; i < part.vertices.length; i += 3) {
      const tri = part.vertices.slice(i, i + 3);
      if (tri.some(p => p.length !== 3 || !p.every(Number.isFinite))) throw new Error('Invalid roof vertex');
      const keys = tri.map(key);
      // A repeated point cannot enclose a face in any projection.
      if (new Set(keys).size < 3) continue;
      const faceKey = [...keys].sort().join('|');
      if (seen.has(faceKey)) continue;
      seen.add(faceKey);
      for (let j = 0; j < 3; j++) {
        const next = (j + 1) % 3, edgeKey = [keys[j], keys[next]].sort().join('|');
        const prior = edges.get(edgeKey);
        if (prior) prior.count++;
        else edges.set(edgeKey, { a: tri[j], b: tri[next], count: 1 });
      }
    }
  }
  return [...edges.values()].filter(edge => edge.count === 1).map(({ a, b }) => ({ a, b }));
}
