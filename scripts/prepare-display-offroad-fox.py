"""Blender half of scripts/prepare-display-offroad-fox.mjs (collection-display-models T15).

Run headless by that wrapper, in one of three modes:
    blender -b --factory-startup --python scripts/prepare-display-offroad-fox.py -- \
        dump <source.obj> <surface.json>
    blender -b --factory-startup --python scripts/prepare-display-offroad-fox.py -- \
        build <source.obj> <paint.png> <out.glb>
    blender -b --factory-startup --python scripts/prepare-display-offroad-fox.py -- \
        render <in.glb> <out-prefix> [cameras.json | view ...]

Turns senoaji's "Fox X Supreme Helmet" (Sketchfab, CC BY 4.0) into the middle display
case's off-road helmet:

- dump: write every textured shell triangle with its UVs and its corners in the final
  helmet frame (metres, centred, +x front, +y up, +z the wearer's right, the glTF frame
  the site loads), so the wrapper can paint texels by their place on the helmet instead
  of guessing the atlas layout.
- build: swap the Supreme/Fox shell texture for the painted one (satin, non-metallic),
  drop the goggles (the product photos have none, and they hid the eye port, the
  forehead intakes and the side and back graphics), give the liner its own material,
  keep the vent meshes dark, centre the helmet with its chin on +x and its crown up
  (placed with the goggles' bounds, as the dump), scale it to 0.30 m tall and export.
- render: import a GLB and render left three-quarter, front, right three-quarter, back
  and top previews in a neutral studio light on a dark gray backdrop.

Parts are matched by the source's material names, which the OBJ fixes.
"""

import json
import math
import sys

import bpy
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
MODE = ARGS[0]

HEIGHT = 0.30
SHELL_MATERIAL = "Fox"
SOURCE_MATERIALS = {"Fox", "Metalicc", "red", "bLACK", "black_gloss", "White", "Google"}


def import_source(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.wm.obj_import(filepath=path)
    meshes = sorted((o for o in bpy.context.scene.objects if o.type == "MESH"),
                    key=lambda o: o.name)
    found = {m.name.split(".")[0] for o in meshes for m in o.data.materials}
    if found != SOURCE_MATERIALS:
        raise SystemExit(f"unexpected source materials {sorted(found)}")
    for obj in meshes:
        # Bake the OBJ's axis turn so vertex coordinates are world coordinates.
        obj.data.transform(obj.matrix_world)
        obj.matrix_world = Matrix.Identity(4)
    return meshes


def placement(meshes):
    """Source (front +y, up +z) to the export frame: centred, front +x, 0.30 m tall."""
    points = [v.co for o in meshes for v in o.data.vertices]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    centre = (lo + hi) / 2
    scale = HEIGHT / (hi.z - lo.z)
    return (Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Scale(scale, 4)
            @ Matrix.Translation(-centre))


def to_gltf(p):
    """Blender (z up) to glTF (y up): (x, y, z) -> (x, z, -y)."""
    return [round(p.x, 6), round(p.z, 6), round(-p.y, 6)]


def dump(source, out):
    meshes = import_source(source)
    place = placement(meshes)
    triangles = []
    for obj in meshes:
        me = obj.data
        names = [m.name.split(".")[0] for m in me.materials]
        uv = me.uv_layers.active.data
        me.calc_loop_triangles()
        for tri in me.loop_triangles:
            if names[tri.material_index] != SHELL_MATERIAL:
                continue
            triangles.append({
                "uv": [[round(c, 6) for c in uv[li].uv] for li in tri.loops],
                "p": [to_gltf(place @ me.vertices[vi].co) for vi in tri.vertices],
                "v": list(tri.vertices),
            })
    with open(out, "w") as f:
        json.dump({"triangles": triangles}, f, separators=(",", ":"))
    print("DUMPED", out, "triangles", len(triangles))


def principled(name, color, roughness, metallic=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "BLENDED"
    return mat


def paint_material(path):
    mat = principled("sayak-paint", (1, 1, 1), 0.42)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    image = nodes.new("ShaderNodeTexImage")
    image.image = bpy.data.images.load(path)
    image.interpolation = "Linear"
    links.new(image.outputs["Color"], nodes["Principled BSDF"].inputs["Base Color"])
    return mat


def split_liner(obj, material):
    """Give the liner (the second largest welded part of the shell) its own material.

    Its UV island overlaps the back of the shell in the source atlas.
    """
    me = obj.data
    names = [m.name for m in me.materials]
    painted = names.index("sayak-paint")
    parent = {}

    def find(k):
        while parent.setdefault(k, k) != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    key = lambda vi: tuple(round(c, 5) for c in me.vertices[vi].co)
    polys = [p for p in me.polygons if p.material_index == painted]
    for poly in polys:
        keys = [find(key(vi)) for vi in poly.vertices]
        for k in keys[1:]:
            parent[find(k)] = find(keys[0])
    parts = {}
    for poly in polys:
        parts.setdefault(find(key(poly.vertices[0])), []).append(poly)
    sizes = sorted(parts.values(), key=lambda ps: -sum(len(p.vertices) - 2 for p in ps))
    liner = sizes[1]
    triangles = sum(len(p.vertices) - 2 for p in liner)
    if triangles != 888:
        raise SystemExit(f"unexpected liner of {triangles} triangles")
    me.materials.append(material)
    for poly in liner:
        poly.material_index = len(me.materials) - 1


def build(source, paint, out):
    meshes = import_source(source)
    place = placement(meshes)
    linear = lambda c: tuple(((v / 255 + 0.055) / 1.055) ** 2.4 for v in c)
    materials = {
        "Fox": paint_material(paint),
        # Vent meshes behind the intakes.
        "Metalicc": principled("vent-mesh", linear((38, 39, 42)), 0.6),
    }
    parts = []
    for obj in meshes:
        me = obj.data
        if SHELL_MATERIAL not in [m.name.split(".")[0] for m in me.materials]:
            # The goggles: removed with their materials.
            bpy.data.objects.remove(obj)
            continue
        for i, mat in enumerate(me.materials):
            me.materials[i] = materials[mat.name.split(".")[0]]
        me.transform(place)
        if materials["Fox"].name in [m.name for m in me.materials]:
            split_liner(obj, principled("liner", linear((30, 31, 34)), 0.9))
        parts.append(obj)
    for obj in parts:
        obj.name = obj.data.name = "shell"
    for obj in bpy.context.scene.objects:
        obj.select_set(obj in parts)
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=True,
                              export_apply=True, export_yup=True,
                              export_image_format="AUTO")
    triangles = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in parts)
    print("PREPARED", out, "triangles", triangles,
          "parts", sorted(o.name for o in parts),
          "materials", sorted({m.name for o in parts for m in o.data.materials}))


def light(name, kind, energy, location, size, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, kind)
    data.energy = energy
    data.color = color
    if kind == "AREA":
        data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj.rotation_euler = (-Vector(location)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(obj)
    return obj


def render(glb, prefix, *only):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = 1200
    scene.render.film_transparent = False
    scene.eevee.taa_render_samples = 128
    # No date or render-time metadata, so reruns write the same bytes.
    for name in dir(scene.render):
        if name.startswith("use_stamp"):
            setattr(scene.render, name, False)
    # Standard keeps the paint close to its sRGB palette.
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("studio")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.09, 0.09, 0.096, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    # The import keeps the chin on +x; the wearer's left (glTF -z) is Blender +y.
    # The baked photos already carry studio shading, so the lights stay low.
    # Soft key high on the wearer's left, a broad fill from the right side,
    # a low rim behind; key and rim sit off the front camera's mirror line over
    # the nearly flat peak, so the peak does not flash white.
    light("key", "AREA", 45, (0.35, 0.9, 1.15), 0.7)
    light("fill", "AREA", 20, (0.3, -1.0, -0.05), 1.0)
    light("rim", "AREA", 20, (-1.0, -0.5, 0.15), 0.8)
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    if only and only[0].endswith(".json"):
        # The cameras fitted to the product photos: orthographic, basis and
        # centre in the glTF frame, so each render lines up with its photo.
        with open(only[0]) as f:
            cameras = json.load(f)
        scene.render.resolution_x = scene.render.resolution_y = 1400
        camera.data.type = "ORTHO"
        b = lambda v: Vector((v[0], -v[2], v[1]))
        for cam in cameras:
            right, up, back = b(cam["right"]), b(cam["up"]), b(cam["dir"])
            camera.data.ortho_scale = cam["size"]
            camera.matrix_world = Matrix((
                (right.x, up.x, back.x, 0),
                (right.y, up.y, back.y, 0),
                (right.z, up.z, back.z, 0),
                (0, 0, 0, 1),
            ))
            camera.location = b(cam["centre"]) + back * 1.0
            scene.render.filepath = f"{prefix}{cam['name']}.png"
            bpy.ops.render.render(write_still=True)
            print("RENDERED", scene.render.filepath)
        return
    camera.data.lens = 85
    target = Vector((0, 0, 0))
    # Angles of the Motocard "Sayak" product photos: left three-quarter front,
    # front, right three-quarter (chin to the right; glTF +z is Blender -y),
    # back, and top (chin down).
    views = {
        "three-quarter": (0.75, 0.75, 0.3),
        "front": (1, 0, 0.2),
        "side": (0.55, -1, 0.25),
        "back": (-1, 0, 0.3),
        "top": (0.05, 0, 1),
    }
    for name, direction in views.items():
        if only and name not in only:
            continue
        camera.location = Vector(direction).normalized() * 1.05
        camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = f"{prefix}{name}.png"
        bpy.ops.render.render(write_still=True)
        print("RENDERED", scene.render.filepath)

if MODE == "dump":
    dump(*ARGS[1:3])
elif MODE == "build":
    build(*ARGS[1:4])
elif MODE == "render":
    render(*ARGS[1:])
else:
    raise SystemExit(f"unknown mode {MODE!r}")
