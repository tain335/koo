export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}
// aabb包围盒
export function intersect(a: Rect, b: Rect): boolean {
  const bottom = Math.min(a.bottom, b.bottom);
  const top = Math.max(a.top, b.top);
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const diffX = right - left;
  const diffY = bottom - top;
  if (diffX >= 0 && diffY >= 0) {
    return true;
  }
  return false;
}
