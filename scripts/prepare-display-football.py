"""Blender half of scripts/prepare-display-football.mjs (collection-display-models T7).

Run headless by that wrapper:
    blender -b --factory-startup --python scripts/prepare-display-football.py -- \
        <source.glb> <livery.png> <surface.png> <out.glb>

Turns Exodusks' "Buffalo Bills Helmet" (a Riddell SpeedFlex, Sketchfab, CC BY 4.0)
into the left display case's helmet:

1. Drop the Bills decals (side logo, crown stripes, front and back stickers).
2. Project the gold and black Rams-style livery onto the shell: the atlas is laid out
   in (azimuth, elevation) around the helmet centre, u = 0.5 + az / 2pi and
   v = (pi/2 - el) / (pi/2 - EL_MIN), so the UVs follow from each vertex's direction.
3. Paint the facemask, bumpers, clips and chin strap black, and add a smoked black
   eye shield in the window between the cage's top and second bars.
4. Decimate the interior padding, merge the parts into six named meshes, centre the
   helmet with its facemask on +x and its crown up, scale it to 0.30 m tall and export.

Materials are matched by their source names, which the GLB fixes.
"""

import math
import sys

import bpy
from mathutils import Matrix, Vector

SOURCE, LIVERY, SURFACE, OUTPUT = sys.argv[sys.argv.index("--") + 1:][:4]

EL_MIN = math.radians(-72)
HEIGHT = 0.30
PADDING_RATIO = 0.15

SHELL = {"Handle1Mtl"}
FACEMASK = {"Facemask1Mtl"}
DECALS = {"Material.014", "Material.015", "Material.022", "Material.023", "Material.024",
          "Material.025", "Material.026", "Material.029", "Material.030", "Material.031"}
PADDING = {"Material", "Material.010", "Material.011", "Material.012", "Material.013",
           "Material.016", "Material.017", "Material.018", "Material.019", "Material.020"}
HARDWARE = {"Material.021"}
TRIM = {"Chinstrap1Mtl", "Material.002", "Material.003", "Material.004", "Material.005",
        "Material.006", "Material.007", "Material.009", "Material.027", "Material.028"}


def material_of(obj):
    slot = obj.material_slots[0] if obj.material_slots else None
    return slot.material.name if slot and slot.material else ""


def plain_material(name, color, roughness, metallic=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "BLENDED"
        mat.use_backface_culling = False
    return mat


def livery_material():
    mat = bpy.data.materials.new("livery")
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]
    color = nodes.new("ShaderNodeTexImage")
    color.image = bpy.data.images.load(LIVERY)
    surface = nodes.new("ShaderNodeTexImage")
    surface.image = bpy.data.images.load(SURFACE)
    surface.image.colorspace_settings.name = "Non-Color"
    split = nodes.new("ShaderNodeSeparateColor")
    links.new(color.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(surface.outputs["Color"], split.inputs["Color"])
    links.new(split.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(split.outputs["Blue"], bsdf.inputs["Metallic"])
    return mat


def bounds(objects):
    points = [o.matrix_world @ v.co for o in objects for v in o.data.vertices]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    return lo, hi


def project_livery(shell, centre):
    """One UV layer from each vertex's (azimuth, elevation); front +y, up +z, right +x."""
    me = shell.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    uv = me.uv_layers.new(name="UVMap")
    world = [shell.matrix_world @ v.co for v in me.vertices]
    for poly in me.polygons:
        coords = []
        for li in poly.loop_indices:
            p = world[me.loops[li].vertex_index] - centre
            az = math.atan2(p.x, p.y)
            el = math.asin(max(-1.0, min(1.0, p.z / max(p.length, 1e-9))))
            v = (math.pi / 2 - el) / (math.pi / 2 - EL_MIN)
            coords.append([0.5 + az / (2 * math.pi), 1 - min(1.0, max(0.0, v))])
        us = [c[0] for c in coords]
        if max(us) - min(us) > 0.5:
            # A face across the back seam: keep it on one side, wrapped.
            for c in coords:
                if c[0] < 0.5:
                    c[0] += 1
        for li, c in zip(poly.loop_indices, coords):
            uv.data[li].uv = c


def direction(az_deg, el_deg):
    a, e = math.radians(az_deg), math.radians(el_deg)
    return Vector((math.cos(e) * math.sin(a), math.cos(e) * math.cos(a), math.sin(e)))


def eye_shield(centre, material):
    """A curved sheet between the cage's top bar (-4 deg) and second bar (-31 deg)."""
    azs = [-62 + i * 2.0 for i in range(63)]
    el0, el1 = -1.0, -29.0
    els = [el0 + (el1 - el0) * j / 17 for j in range(18)]
    verts = []
    for el in els:
        t = (el - el0) / (el1 - el0)
        for az in azs:
            side = (abs(az) / 62) ** 2
            r = (0.955 + 0.15 * t) - (0.08 + 0.1 * t) * side
            verts.append(tuple(centre + direction(az, el) * r))
    n = len(azs)
    faces = [(j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i)
             for j in range(len(els) - 1) for i in range(n - 1)]
    me = bpy.data.meshes.new("eye-shield")
    me.from_pydata(verts, [], faces)
    me.update()
    for poly in me.polygons:
        poly.use_smooth = True
    me.materials.append(material)
    obj = bpy.data.objects.new("eye-shield", me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def merge(objects, name, material):
    """Bake transforms, give every face one material, and join into one named mesh."""
    for obj in objects:
        obj.data = obj.data.copy()
        obj.data.transform(obj.matrix_world)
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for poly in obj.data.polygons:
            poly.material_index = 0
    first = objects[0]
    if len(objects) > 1:
        with bpy.context.temp_override(active_object=first, selected_editable_objects=objects):
            bpy.ops.object.join()
    first.name = name
    first.data.name = name
    return first


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
scene = bpy.context.scene
meshes = [o for o in scene.objects if o.type == "MESH"]
groups = {"shell": [], "facemask": [], "padding": [], "hardware": [], "trim": []}
for obj in meshes:
    name = material_of(obj)
    if name in DECALS:
        bpy.data.objects.remove(obj)
    elif name in SHELL:
        groups["shell"].append(obj)
    elif name in FACEMASK:
        groups["facemask"].append(obj)
    elif name in PADDING:
        groups["padding"].append(obj)
    elif name in HARDWARE:
        groups["hardware"].append(obj)
    elif name in TRIM:
        groups["trim"].append(obj)
    else:
        raise SystemExit(f"unclassified source material {name!r} on {obj.name}")

lo, hi = bounds(groups["shell"])
centre = (lo + hi) / 2
centre.z = lo.z + 0.53 * (hi.z - lo.z)

for obj in groups["padding"]:
    mod = obj.modifiers.new("Decimate", "DECIMATE")
    mod.ratio = PADDING_RATIO
    with bpy.context.temp_override(object=obj, active_object=obj):
        bpy.ops.object.modifier_apply(modifier=mod.name)

parts = [
    merge(groups["shell"], "shell", livery_material()),
    merge(groups["facemask"], "facemask", plain_material("facemask", (0.012, 0.012, 0.014), 0.28)),
    merge(groups["padding"], "padding", plain_material("padding", (0.02, 0.02, 0.022), 0.85)),
    merge(groups["trim"], "trim", plain_material("trim", (0.015, 0.015, 0.017), 0.4)),
    merge(groups["hardware"], "hardware", plain_material("hardware", (0.56, 0.56, 0.56), 0.3, 1.0)),
]
project_livery(parts[0], centre)
parts.append(eye_shield(centre, plain_material("eye-shield", (0.008, 0.008, 0.009), 0.03, alpha=0.85)))

# Centre, turn the facemask from +y to +x, and scale to the real height.
lo, hi = bounds(parts)
scale = HEIGHT / (hi.z - lo.z)
place = (Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Scale(scale, 4)
         @ Matrix.Translation(-centre))
for obj in parts:
    obj.data.transform(place)

for obj in scene.objects:
    obj.select_set(obj in parts)
bpy.ops.export_scene.gltf(filepath=OUTPUT, export_format="GLB", use_selection=True,
                          export_apply=True, export_yup=True)
triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in parts)
print("PREPARED", OUTPUT, "triangles", triangles, "parts", [o.name for o in parts])
