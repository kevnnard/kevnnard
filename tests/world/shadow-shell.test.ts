import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  BackSide,
  BoxGeometry,
  Euler,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import { shadowShell } from "../../src/lib/world/cutaway.ts";
import {
  HOUSE_GROUPS,
  houseMeshes,
  type Part,
} from "../../src/lib/world/house.ts";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const solid = () => {
  const mesh = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshStandardMaterial({ shadowSide: BackSide }),
  );
  mesh.castShadow = true;
  return mesh;
};

/** Whether a world point lies inside a (possibly rotated) part's box. */
function inside(part: Part, point: Vector3) {
  if (part.shape === "prism") return false;
  const matrix = new Matrix4().compose(
    new Vector3(...part.center),
    new Quaternion().setFromEuler(new Euler(...(part.rotation ?? [0, 0, 0]))),
    new Vector3(1, 1, 1),
  );
  const local = point.clone().applyMatrix4(matrix.invert());
  return (
    Math.abs(local.x) < part.size[0] / 2 - 1e-6 &&
    Math.abs(local.y) < part.size[1] / 2 - 1e-6 &&
    Math.abs(local.z) < part.size[2] / 2 - 1e-6
  );
}

describe("cutaway shadow shell (S21)", () => {
  it("reuses each solid's geometry as an opaque, always-casting blocker", () => {
    const solids = [solid(), solid()];
    const { shell, materials } = shadowShell(solids);
    const blockers = shell.children as Mesh[];
    assert.equal(blockers.length, 2);
    for (const [i, blocker] of blockers.entries()) {
      assert.equal(blocker.geometry, solids[i].geometry, "same geometry");
      assert.ok(blocker.matrix.equals(solids[i].matrix));
      assert.equal(blocker.visible, true, "never visible=false");
      assert.equal(blocker.castShadow, true);
      assert.equal(blocker.receiveShadow, false);
    }
    assert.equal(shell.visible, true);
    assert.equal(materials.length, 2, "one camera + one depth material");
  });

  it("is camera-invisible without being transparent or hidden", () => {
    const { shell } = shadowShell([solid()]);
    const blocker = shell.children[0] as Mesh;
    const camera = blocker.material as MeshStandardMaterial;
    assert.equal(camera.colorWrite, false);
    assert.equal(camera.depthWrite, false);
    assert.equal(camera.visible, true, "the shadow pass copies visible");
    assert.equal(camera.transparent, false);
    assert.equal(camera.opacity, 1);
    assert.equal(camera.shadowSide, BackSide, "same side as the wood");
  });

  it("casts through an explicit, undithered depth material", () => {
    const { shell } = shadowShell([solid()]);
    const depth = (shell.children[0] as Mesh).customDepthMaterial;
    assert.ok(depth instanceof MeshDepthMaterial);
    assert.equal(depth.depthWrite, true);
    assert.equal(depth.depthTest, true);
    assert.equal(depth.onBeforeCompile.toString().includes("discard"), false);
    assert.equal(depth.alphaTest, 0);
    // r186 PCF samples the hardware DepthTexture (sampler2DShadow), not the
    // packed color; match the built-in shadow material's packing anyway.
    assert.equal(depth.depthPacking, new MeshDepthMaterial().depthPacking);
  });

  it("disposes only its own materials, never the shared geometry", () => {
    const solids = [solid()];
    let geometryDisposed = false;
    solids[0].geometry.addEventListener("dispose", () => {
      geometryDisposed = true;
    });
    const { materials } = shadowShell(solids);
    let disposed = 0;
    for (const material of materials)
      material.addEventListener("dispose", () => {
        disposed++;
      });
    for (const material of materials) material.dispose();
    assert.equal(disposed, 2);
    assert.equal(geometryDisposed, false);
  });

  it("keeps the window apertures open: no opaque part covers a pane", () => {
    const meshes = houseMeshes();
    const wood = HOUSE_GROUPS.flatMap((group) => meshes[group].wood);
    let panes = 0;
    for (const group of HOUSE_GROUPS)
      for (const pane of meshes[group].glass) {
        panes++;
        const matrix = new Matrix4().compose(
          new Vector3(...pane.center),
          new Quaternion().setFromEuler(
            new Euler(...(pane.rotation ?? [0, 0, 0])),
          ),
          new Vector3(1, 1, 1),
        );
        // Quarter points of each pane, clear of the cross mullions; the
        // thinnest axis is the pane's depth (x on side walls, z on others).
        const thin = pane.size.indexOf(Math.min(...pane.size));
        const [i, j] = [0, 1, 2].filter((axis) => axis !== thin);
        for (const [a, b] of [
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ]) {
          const offset = [0, 0, 0];
          offset[i] = (a * pane.size[i]) / 4;
          offset[j] = (b * pane.size[j]) / 4;
          const point = new Vector3(...offset).applyMatrix4(matrix);
          const cover = wood.find((part) => inside(part, point));
          assert.equal(cover, undefined, `${group} pane at ${point.toArray()}`);
        }
      }
    assert.ok(panes >= 6);
  });

  it("House builds the shell from wood solids only, outside the fading groups", () => {
    const house = source("src/components/world/House.tsx");
    assert.match(house, /shadowShell\(/);
    // Built from the solids list, never from the panes.
    assert.doesNotMatch(house, /shadowShell\([^)]*panes/);
    // A sibling of the cutaway groups, so hiding them leaves it alone.
    assert.match(house, /house\.add\(shell\)/);
    assert.doesNotMatch(house, /part\.add\(shell\)/);
    // The real fading solids no longer cast: the shell casts instead.
    assert.doesNotMatch(house, /castsShadow\(/);
    // Shared geometry is disposed once.
    assert.match(house, /new Set</);
  });
});
