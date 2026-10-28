// Original rounded box (T4h, S12): every edge and corner bevelled with a
// quarter arc, built at its final size so the radius stays round under any
// aspect. Pure numbers; House.tsx turns them into a merged geometry.

type Size = readonly [number, number, number];

export interface RoundedBox {
  position: number[];
  normal: number[];
  index: number[];
}

/**
 * A box of `size` centred on the origin whose edges round off with
 * `radius` (clamped to half the thinnest side) in `segments` steps per arc.
 * Each face is a grid snapped onto the inner box plus the radius, so the
 * seams between faces share positions and normals.
 */
export function roundedBox(
  size: Size,
  radius: number,
  segments = 2,
): RoundedBox {
  const half = size.map((s) => s / 2);
  const r = Math.max(0, Math.min(radius, ...half));
  const inner = half.map((h) => h - r);
  // Grid coordinates per axis: an arc's worth at each end.
  const ticks = half.map((h, axis) => {
    const list: number[] = [];
    for (let k = segments; k >= 0; k--)
      list.push(-inner[axis] - r * Math.sin(((k / segments) * Math.PI) / 2));
    for (let k = 0; k <= segments; k++)
      list.push(inner[axis] + r * Math.sin(((k / segments) * Math.PI) / 2));
    list[0] = -h;
    list[list.length - 1] = h;
    return list;
  });
  const box: RoundedBox = { position: [], normal: [], index: [] };
  const raw = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [1, -1]) {
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      const base = box.position.length / 3;
      const n = ticks[u].length;
      const m = ticks[v].length;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < m; j++) {
          raw[axis] = sign * half[axis];
          raw[u] = ticks[u][i];
          raw[v] = ticks[v][j];
          const offset = raw.map(
            (p, k) => p - Math.min(Math.max(p, -inner[k]), inner[k]),
          );
          const length = Math.hypot(...offset);
          const normal =
            length > 0
              ? offset.map((o) => o / length)
              : [0, 1, 2].map((k) => (k === axis ? sign : 0));
          box.position.push(
            ...raw.map(
              (p, k) =>
                Math.min(Math.max(p, -inner[k]), inner[k]) + normal[k] * r,
            ),
          );
          box.normal.push(...normal);
        }
      for (let i = 0; i < n - 1; i++)
        for (let j = 0; j < m - 1; j++) {
          const a = base + i * m + j;
          const b = a + m;
          const c = b + 1;
          const d = a + 1;
          if (sign > 0) box.index.push(a, b, c, a, c, d);
          else box.index.push(a, c, b, a, d, c);
        }
    }
  return box;
}
