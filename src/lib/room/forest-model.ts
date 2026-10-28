import { Box3, Matrix4, type Object3D, Vector3 } from "three";

/** Unit-height, grounded frame without baking into quantized Int16 vertices. */
export function treeFrame(root: Object3D): Matrix4 {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root);
  const center = box.getCenter(new Vector3());
  const height = box.max.y - box.min.y;
  return new Matrix4()
    .makeScale(1 / height, 1 / height, 1 / height)
    .multiply(new Matrix4().makeTranslation(-center.x, -box.min.y, -center.z));
}
