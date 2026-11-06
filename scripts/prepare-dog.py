"""Blender half of scripts/prepare-dog.mjs (dog-rig T1, T3).

Run headless by that wrapper, in one of two modes:
    blender -b --factory-startup --python scripts/prepare-dog.py -- \
        build <source.glb> <out.glb> <out.blend>
    blender -b --factory-startup --python scripts/prepare-dog.py -- \
        render <in.glb> <out-prefix> <clip>:<frame>,<frame>,... ...

Turns the downloaded "Miniature Pinscher" (3D Creator, CC BY 4.0, see the
wrapper) into a rigged, animated dog for /world:

- build: import the single textured mesh, weld the vertices the glTF split at UV
  seams (the welded mesh is one closed surface), turn it to face +x, centre it,
  stand it on z=0 and scale it to 0.28 m at the withers; decimate it to ~12k
  triangles and halve the textures to 2048 px; build a 32-bone quadruped skeleton
  from joint positions measured on the scaled mesh (the low leg joints are centred
  in the leg's cross-section), bind it with automatic weights, and key the looping
  clips: "run" (in-place gallop, 0.5 s) and "idle" (standing, breathing, tail wag);
  with DOG_SLEEP=1 also "sleep" (sternal sphinx, chin on the front paws, 4 s breath,
  preview only: the owner dropped it, dog-rig S8), reporting how deep any body
  region passes into another in the sleep pose (INTERSECT/WORST lines) and how each
  leg joint bends against its natural range (JOINTS line). Exports the
  GLB (deform bones only, one glTF animation per clip) and saves a .blend with the
  rig and the actions.
- render: import a GLB and render the listed frames of each clip from the listed
  views (<clip>:<frames>@<view>,...; default three-quarter and side), in a neutral
  studio light.

Blender frame: +x the dog's nose, +y its left, +z up (glTF: +x nose, +y up,
+z the dog's right).
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

ARGS = sys.argv[sys.argv.index("--") + 1:]
MODE = ARGS[0]

FPS = 30
# The source faces the -x,-y diagonal; this turn puts the nose on +x with the four
# feet centred on y=0 (measured from the feet's centroids).
TURN_DEGREES = 139.85
# Top of the shoulders (withers) in source units, measured from the side profile.
WITHERS_SOURCE = 0.59
WITHERS = 0.28
DECIMATE_RATIO = 0.185
TEXTURE_SIZE = 2048
SOURCE_TRIANGLES = 65480

# ---- Skeleton -------------------------------------------------------------------

# Joints in the final frame (metres), measured on orthographic views of the scaled
# mesh. Leg joints marked by CENTRED are moved to the centre of the leg's horizontal
# cross-section at their height, so each leg bone runs down the middle of its leg.
J = {
    "hips": (-0.150, 0.0, 0.235),
    "spine1": (-0.070, 0.0, 0.245),
    "spine2": (0.010, 0.0, 0.245),
    "neck1": (0.085, 0.0, 0.255),
    "neck2": (0.108, 0.002, 0.300),
    "head": (0.122, 0.006, 0.338),
    "nose": (0.190, 0.028, 0.312),
    "breath": (0.015, 0.0, 0.205),
    "breath_end": (0.015, 0.0, 0.165),
    "tail1": (-0.178, 0.0, 0.238),
    "tail2": (-0.192, 0.0, 0.250),
    "tail3": (-0.205, 0.0, 0.259),
    "tail_end": (-0.221, 0.0, 0.271),
    "ear1.L": (0.128, 0.034, 0.358),
    "ear2.L": (0.124, 0.046, 0.384),
    "ear_end.L": (0.119, 0.056, 0.410),
    "ear1.R": (0.140, -0.026, 0.358),
    "ear2.R": (0.143, -0.037, 0.384),
    "ear_end.R": (0.146, -0.045, 0.410),
}
LEG_Y = {"front.L": 0.028, "front.R": -0.042, "hind.L": 0.040, "hind.R": -0.042}
FRONT = [("scapula", 0.065, 0.265), ("shoulder", 0.108, 0.195), ("elbow", 0.068, 0.145),
         ("wrist", 0.078, 0.050), ("fetlock", 0.090, 0.018), ("toe", 0.114, 0.008)]
HIND = [("hip", -0.148, 0.215), ("knee", -0.125, 0.145), ("hock", -0.200, 0.090),
        ("fetlock", -0.195, 0.020), ("toe", -0.172, 0.008)]
CENTRED = {"wrist", "hock", "fetlock"}

# Bone: (head joint, tail joint, parent). Leg bones are added by add_legs().
BONES = [
    ("hips", "hips", "spine1", None),
    ("spine1", "spine1", "spine2", "hips"),
    ("spine2", "spine2", "neck1", "spine1"),
    ("breath", "breath", "breath_end", "spine2"),
    ("neck1", "neck1", "neck2", "spine2"),
    ("neck2", "neck2", "head", "neck1"),
    ("head", "head", "nose", "neck2"),
    ("ear1.L", "ear1.L", "ear2.L", "head"),
    ("ear2.L", "ear2.L", "ear_end.L", "ear1.L"),
    ("ear1.R", "ear1.R", "ear2.R", "head"),
    ("ear2.R", "ear2.R", "ear_end.R", "ear1.R"),
    ("tail1", "tail1", "tail2", "hips"),
    ("tail2", "tail2", "tail3", "tail1"),
    ("tail3", "tail3", "tail_end", "tail2"),
]


def leg_centre(points, x, y, z, radius=0.03, band=0.006):
    """Centre of the leg's cross-section at height z near (x, y)."""
    near = [p for p in points if abs(p.z - z) < band and math.hypot(p.x - x, p.y - y) < radius]
    if len(near) < 12:
        raise SystemExit(f"no leg section near {(x, y, z)}")
    return (sum(p.x for p in near) / len(near), sum(p.y for p in near) / len(near), z)


def add_legs(points):
    for side in ("L", "R"):
        for kind, chain, names, parent in (
            ("front", FRONT, ["scapula", "upperarm", "forearm", "paw", "toe"], "spine2"),
            ("hind", HIND, ["thigh", "shin", "hock", "toe"], "hips"),
        ):
            y = LEG_Y[f"{kind}.{side}"]
            for name, x, z in chain:
                key = f"{kind}_{name}.{side}"
                J[key] = leg_centre(points, x, y, z) if name in CENTRED else (x, y, z)
            for i, bone in enumerate(names):
                head = f"{kind}_{chain[i][0]}.{side}"
                tail = f"{kind}_{chain[i + 1][0]}.{side}"
                prev = f"{kind}_{names[i - 1]}.{side}" if i else parent
                BONES.append((f"{kind}_{bone}.{side}", head, tail, prev))


# ---- Mesh -------------------------------------------------------------------------

def import_source(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if len(meshes) != 1 or len(meshes[0].data.materials) != 1:
        raise SystemExit("expected one mesh with one material")
    obj = meshes[0]
    me = obj.data
    if sum(len(p.vertices) - 2 for p in me.polygons) != SOURCE_TRIANGLES:
        raise SystemExit("unexpected source triangle count")
    for other in list(bpy.context.scene.objects):
        if other is not obj:
            bpy.data.objects.remove(other)
    me.transform(obj.matrix_world)
    obj.parent = None
    obj.matrix_world = Matrix.Identity(4)
    obj.name = me.name = "dog"
    me.materials[0].name = "dog"
    return obj


def clean(obj):
    """Weld, orient, scale and decimate; returns the final triangle count."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    if any(not e.is_manifold for e in bm.edges):
        raise SystemExit("welded mesh is not closed")
    bm.to_mesh(me)
    bm.free()
    # Smooth normals from the welded surface; the glTF's split normals no longer apply.
    if me.has_custom_normals:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    me.shade_smooth()

    me.transform(Matrix.Rotation(math.radians(TURN_DEGREES), 4, "Z"))
    lo = Vector([min(v.co[i] for v in me.vertices) for i in range(3)])
    hi = Vector([max(v.co[i] for v in me.vertices) for i in range(3)])
    shift = Vector(((lo.x + hi.x) / -2, (lo.y + hi.y) / -2, -lo.z))
    me.transform(Matrix.Scale(WITHERS / WITHERS_SOURCE, 4) @ Matrix.Translation(shift))

    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = DECIMATE_RATIO
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for image in bpy.data.images:
        if image.size[0] > TEXTURE_SIZE:
            image.scale(TEXTURE_SIZE, TEXTURE_SIZE)
    return sum(len(p.vertices) - 2 for p in me.polygons)


# ---- Rig ---------------------------------------------------------------------------

def build_armature(obj):
    add_legs([v.co.copy() for v in obj.data.vertices])
    data = bpy.data.armatures.new("dog-rig")
    rig = bpy.data.objects.new("dog-rig", data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, head, tail, parent in BONES:
        eb = data.edit_bones.new(name)
        eb.head, eb.tail = J[head], J[tail]
        # Local z points to the dog's left, so a rotation about z bends a bone in the
        # side (sagittal) plane: positive turns a downward bone's tip backward, a
        # forward bone's tip down and a backward bone's (tail) tip up.
        eb.align_roll(Vector((0, 1, 0)))
        eb.use_deform = True
        if parent:
            eb.parent = data.edit_bones[parent]
            eb.use_connect = (eb.parent.tail - eb.head).length < 1e-6
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    return rig


def bind(obj, rig):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    # Four influences per vertex, normalised, as glTF skinning expects.
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="WEIGHT_PAINT")
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_clean(group_select_mode="ALL", limit=0.01)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    unweighted = [v.index for v in obj.data.vertices if not v.groups]
    if unweighted:
        raise SystemExit(f"{len(unweighted)} vertices without weights")


# ---- Clips -----------------------------------------------------------------------

def wave(phase, offset=0.0):
    return math.sin(2 * math.pi * (phase + offset))


def bump(phase, start, end):
    """0 outside [start, end] (cyclic), a sine hump inside it."""
    t = (phase - start) % 1.0
    span = (end - start) % 1.0
    return math.sin(math.pi * t / span) if t < span else 0.0


def front_leg(p):
    """Rotary-gallop front leg at phase p: reaching forward at 0, back at 0.5."""
    sweep = -math.cos(2 * math.pi * p)
    fold = bump(p, 0.45, 1.0)
    return {
        "scapula": 14 * sweep,
        "upperarm": 22 * sweep - 10 * fold,
        "forearm": -30 * fold + 8 * max(0.0, -sweep),
        "paw": 85 * fold,
        "toe": 25 * fold,
    }


def hind_leg(p):
    sweep = -math.cos(2 * math.pi * p)
    fold = bump(p, 0.45, 1.0)
    return {
        "thigh": 26 * sweep - 18 * fold,
        "shin": 40 * fold + 6 * sweep,
        "hock": -45 * fold - 8 * sweep,
        "toe": -25 * fold,
    }


def run_pose(p):
    """In-place gallop: the spine extends at 0 (fronts reach, hinds push) and
    gathers at 0.5; hinds trail the fronts by half a cycle, the right legs lag."""
    gather = -math.cos(2 * math.pi * p)
    pose = {
        "hips": {"rot": (0, 0, -7 * gather)},
        "spine1": {"rot": (0, 0, 4 * gather)},
        "spine2": {"rot": (0, 0, 7 * gather)},
        "neck1": {"rot": (0, 0, -6 * gather + 4)},
        "head": {"rot": (0, 0, 4 * wave(p, 0.1) + 4)},
        "tail1": {"rot": (0, 0, 12 * wave(p, -0.15))},
        "tail2": {"rot": (0, 0, 10 * wave(p, -0.25))},
        "ear1.L": {"rot": (0, 0, 22 + 6 * wave(2 * p))},
        "ear1.R": {"rot": (0, 0, 22 + 6 * wave(2 * p))},
        "ear2.L": {"rot": (0, 0, 10 + 6 * wave(2 * p, -0.1))},
        "ear2.R": {"rot": (0, 0, 10 + 6 * wave(2 * p, -0.1))},
    }
    for side, lag in (("L", 0.0), ("R", 0.08)):
        for bone, angle in front_leg((p + lag) % 1).items():
            pose[f"front_{bone}.{side}"] = {"rot": (0, 0, angle)}
        for bone, angle in hind_leg((p + 0.5 + lag) % 1).items():
            pose[f"hind_{bone}.{side}"] = {"rot": (0, 0, angle)}
    return pose


def breathing(p, depth):
    s = 1 + depth * (0.5 - 0.5 * math.cos(2 * math.pi * p))
    return {"scale": (s, 1 + (s - 1) * 0.4, s)}


def bend(roll, pitch):
    """Root turn: pitch in the side plane first, then roll about the body's long
    axis (positive puts the dog on its right side), as XYZ Euler degrees."""
    m = Matrix.Rotation(math.radians(roll), 3, "Y") @ Matrix.Rotation(math.radians(pitch), 3, "Z")
    return tuple(math.degrees(a) for a in m.to_euler("XYZ"))


def sleep_pose(p):
    """Sternal "curled sphinx" sleep: chest and belly on the floor, front legs
    stretched forward with the paws together and the chin on them, hind legs
    folded under the body, ears laid back; one slow, deep breath per loop.

    Flexion only, within JOINT_LIMITS (checked by check_joints)."""
    breath = 0.5 - 0.5 * math.cos(2 * math.pi * p)
    twitch = bump(p, 0.62, 0.68)
    pose = {
        "hips": {"rot": bend(SLEEP["roll"], SLEEP["pelvis"])},
        # The breath bone swells the ribcage; the spine stays still so the paws
        # stay planted.
        # The pelvis rolls a little onto its right side; spine1 turns the chest
        # back upright.
        "spine1": {"rot": (SLEEP["side"][0], -SLEEP["counter"][0], SLEEP["spine1"])},
        "spine2": {"rot": (SLEEP["side"][1], -SLEEP["counter"][1], SLEEP["spine2"])},
        "breath": breathing(p, 0.05),
        "neck1": {"rot": (SLEEP["side"][2], 0, SLEEP["neck1"] + 1.0 * breath)},
        "neck2": {"rot": (SLEEP["side"][3], 0, SLEEP["neck2"] + 1.0 * breath)},
        "head": {"rot": (SLEEP["side"][4], 0, SLEEP["head"])},
        "ear1.L": {"rot": (0, 0, SLEEP["ear"] + 6 * twitch)},
        "ear1.R": {"rot": (0, 0, SLEEP["ear"])},
        "ear2.L": {"rot": (0, 0, 20)},
        "ear2.R": {"rot": (0, 0, 20)},
        "tail1": {"rot": (0, 0, SLEEP["tail"][0])},
        "tail2": {"rot": (0, 0, SLEEP["tail"][1])},
        "tail3": {"rot": (0, 0, SLEEP["tail"][2])},
    }
    for side in ("L", "R"):
        # Sagittal flexion about local z, plus a small turn about local x (an
        # abduction for the hind thigh, whose x points forward).
        for kind, names in (("front", FRONT_BONES), ("hind", HIND_BONES)):
            angles = SLEEP[f"{kind}.{side}"]
            out = SLEEP.get(f"{kind}_out.{side}", ())
            for i, (bone, angle) in enumerate(zip(names, angles)):
                turn = out[i] if i < len(out) else 0
                pose[f"{kind}_{bone}.{side}"] = {"rot": (turn, 0, angle)}
    return pose


FRONT_BONES = ("scapula", "upperarm", "forearm", "paw", "toe")
HIND_BONES = ("thigh", "shin", "hock", "toe")


# Sleep pose angles in degrees. Local z: positive bends downward bones' tips
# backward and forward bones' tips down. "side" bends the spine, neck and head
# about local x (up for these forward bones), toward the dog's left.
# Front legs (scapula, shoulder, elbow, carpus, toes): elbow under the chest,
# forearm and paw flat on the floor pointing forward. Hind legs (hip, stifle,
# hock, toes): thigh forward along the belly, shin back, metatarsus flat forward.
SLEEP = {
    # The pelvis rolls onto its right side; spine1 and spine2 ("counter") turn
    # the chest back upright.
    "roll": 45, "counter": (23, 22), "pelvis": 0,
    # Turns about each leg bone's local x (positive: tip toward the dog's left).
    "hind_out.L": (28, 0, 0), "hind_out.R": (10, 0, -15),
    "front_out.L": (6,), "front_out.R": (-6,),
    "spine1": 0, "spine2": 0, "neck1": 70, "neck2": 25, "head": -85,
    "side": (0, 0, 0, 0, 0),
    "ear": 55, "tail": (-40, -20, -10),
    "front.L": (0, 0, -84, 15, 46), "front.R": (0, 0, -84, 15, 46),
    "hind.L": (-30, 61, -117, 10), "hind.R": (-30, 61, -117, 10),
}


def idle_pose(p):
    """Standing: one breath per loop, a quick tail wag (four beats), a small head turn."""
    wag = wave(4 * p)
    return {
        "breath": breathing(p, 0.035),
        "spine2": {"rot": (0, 0, 0.8 * wave(p))},
        "neck1": {"rot": (0, 0, -1.5 * wave(p, 0.1))},
        "head": {"rot": (0, 3 * wave(p, 0.2), 2 * wave(p, 0.3))},
        "ear1.L": {"rot": (0, 0, 5 * bump(p, 0.55, 0.7))},
        "tail1": {"rot": (28 * wag, 0, 4)},
        "tail2": {"rot": (16 * wave(4 * p, -0.08), 0, 0)},
        "tail3": {"rot": (10 * wave(4 * p, -0.16), 0, 0)},
    }


# Clip: (pose of phase, seconds, height of the lowest point by phase or None). With a
# height function the root is moved each frame so the deformed dog's lowest point
# sits at that height: the feet meet the floor whatever the legs are doing.
CLIPS = {
    "sleep": (sleep_pose, 4.0, lambda p: 0.0),
    # A short suspension when the legs are stretched out (p = 0).
    "run": (run_pose, 0.5, lambda p: 0.012 * max(0.0, math.cos(2 * math.pi * p)) ** 3),
    "idle": (idle_pose, 2.0, None),
}
# The owner dropped the sleep pose (dog-rig S8): the site ships idle and run
# only. DOG_SLEEP=1 keys it again (with its morphs and checks) for a Blender
# preview; that build is not for public/.
if not os.environ.get("DOG_SLEEP"):
    del CLIPS["sleep"]


def lowest_z(mesh):
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(graph)
    me = evaluated.to_mesh()
    z = min((evaluated.matrix_world @ v.co).z for v in me.vertices)
    evaluated.to_mesh_clear()
    return z


def key_clips(rig, mesh):
    rig.animation_data_create()
    ad = rig.animation_data
    scene = bpy.context.scene
    for name, (pose_of, seconds, floor) in CLIPS.items():
        frames = round(seconds * FPS)
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        ad.action = action
        for f in range(frames + 1):
            # The last frame repeats the first, so the loop closes exactly.
            pose = pose_of((f % frames) / frames)
            scene.frame_set(f)
            for pb in rig.pose.bones:
                spec = pose.get(pb.name, {})
                pb.rotation_euler = Euler([math.radians(a) for a in spec.get("rot", (0, 0, 0))])
                # "loc" is a world-space offset; pose locations are in bone space.
                pb.location = pb.bone.matrix_local.to_3x3().inverted() @ Vector(spec.get("loc", (0, 0, 0)))
                pb.scale = spec.get("scale", (1, 1, 1))
                for path in ("rotation_euler", "location", "scale"):
                    pb.keyframe_insert(path, frame=f)
            if floor:
                hips = rig.pose.bones["hips"]
                scene.frame_set(f)
                rise = floor((f % frames) / frames) - lowest_z(mesh)
                hips.location += hips.bone.matrix_local.to_3x3().inverted() @ Vector((0, 0, rise))
                hips.keyframe_insert("location", frame=f)
        for curve in fcurves(action):
            for point in curve.keyframe_points:
                point.interpolation = "LINEAR"
        track = ad.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, action)
        if hasattr(strip, "action_slot") and action.slots:
            strip.action_slot = action.slots[0]
        ad.action = None
        print("CLIP", name, f"{seconds:.2f}s", frames + 1, "frames")
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
        pb.scale = (1, 1, 1)


def fcurves(action):
    if hasattr(action, "fcurves") and len(action.fcurves):
        return list(action.fcurves)
    # Layered (slotted) actions keep their curves in channelbags.
    curves = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                curves.extend(bag.fcurves)
    return curves


SETTLE_SINK = 0.010
SETTLE_BAND = 0.04


def reground(rig, mesh, clip):
    """Solve the clip's root height again with its morphs on, so the lowest
    point stays on z=0 in every frame."""
    ad = rig.animation_data
    ad.action = bpy.data.actions[clip]
    if hasattr(ad, "action_slot") and ad.action.slots:
        ad.action_slot = ad.action.slots[0]
    use_morph_clip(mesh, clip)
    hips = rig.pose.bones["hips"]
    to_bone = hips.bone.matrix_local.to_3x3().inverted()
    for f in range(round(CLIPS[clip][1] * FPS) + 1):
        bpy.context.scene.frame_set(f)
        hips.location += to_bone @ Vector((0, 0, -lowest_z(mesh)))
        hips.keyframe_insert("location", frame=f)
    for curve in fcurves(ad.action):
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"
    ad.action = None
    use_morph_clip(mesh, None)


def skin_matrix(rig, mesh, v):
    """Blended pose-from-rest matrix of a skinned vertex (linear blend skinning)."""
    groups = {g.index: g.name for g in mesh.vertex_groups}
    m = Matrix(((0,) * 4,) * 4)
    for g in v.groups:
        pb = rig.pose.bones[groups[g.group]]
        m += (pb.matrix @ pb.bone.matrix_local.inverted()) * g.weight
    return m


def add_settle_key(rig, mesh, clip):
    """Shape key "sleepSettle": in the clip's first pose, sink the dog by
    SETTLE_SINK and squash what lies within SETTLE_BAND of the floor flat onto
    it, so the down side rests on a broad patch instead of a point. The world
    offsets are taken back through each vertex's skin matrix, so the key (a glTF
    morph target, applied before skinning) lands them there in the pose."""
    ad = rig.animation_data
    ad.action = bpy.data.actions[clip]
    if hasattr(ad, "action_slot") and ad.action.slots:
        ad.action_slot = ad.action.slots[0]
    bpy.context.scene.frame_set(0)
    points = deformed(mesh)
    if not mesh.data.shape_keys:
        mesh.shape_key_add(name="Basis", from_mix=False)
    key = mesh.shape_key_add(name="sleepSettle", from_mix=False)
    moved = 0
    for v, p in zip(mesh.data.vertices, points):
        z = p.z - SETTLE_SINK
        target = 0.0 if z <= 0 else (SETTLE_BAND * (z / SETTLE_BAND) ** 2 if z < SETTLE_BAND else z)
        if abs(target - p.z) < 1e-6:
            continue
        offset = skin_matrix(rig, mesh, v).to_3x3().inverted() @ Vector((0, 0, target - p.z))
        key.data[v.index].co = v.co + offset
        moved += 1
    ad.action = None
    print("SETTLE", clip, "vertices moved", moved)
    return key


# Eye centres on the scaled rest mesh (found as the head's glossiest texels).
EYES = {"L": Vector((0.177, 0.039, 0.329)), "R": Vector((0.189, -0.008, 0.329))}
GLOSSY = 0.35


def add_eyes_key(mesh):
    """Shape key "eyesClosed": the model has no lids, so each eyeball is squeezed
    into a thin dark slit (the lash line) set flush with the eye rim, and the
    fur round it is drawn down over the eye with a falloff."""
    import numpy as np
    me = mesh.data
    img = next(i for i in bpy.data.images if "rough" in i.name)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    rough = px.reshape(h, w, 4)[:, :, 1]
    uv = me.uv_layers.active.data
    gloss = {}
    for loop in me.loops:
        u, v = uv[loop.index].uv
        g = rough[min(h - 1, int(v * h)), min(w - 1, int(u * w))]
        gloss[loop.vertex_index] = min(gloss.get(loop.vertex_index, 1.0), float(g))
    key = mesh.shape_key_add(name="eyesClosed", from_mix=False)
    for side, guess in EYES.items():
        ball = [v for v in me.vertices if (v.co - guess).length < 0.016 and gloss[v.index] < GLOSSY]
        if len(ball) < 8:
            raise SystemExit(f"eye {side} not found")
        centre = sum((v.co for v in ball), Vector()) / len(ball)
        out = sum((v.normal for v in ball), Vector()).normalized()
        radius = max((v.co - centre).length for v in ball)
        rim = [v for v in me.vertices if radius < (v.co - centre).length < radius + 0.003]
        depth = sum((v.co - centre).dot(out) for v in rim) / len(rim)
        # The slit sits a little below the centre: the upper lid does the closing.
        line = centre.z - 0.3 * radius
        reach = radius + 0.005
        for v in me.vertices:
            d = (v.co - centre).length
            if d > reach:
                continue
            co = v.co.copy()
            if v in ball or d <= radius:
                co.z = line + (co.z - line) * 0.08
                co += out * (depth - 0.0005 - (co - centre).dot(out))
            else:
                t = (reach - d) / (reach - radius)
                co.z = line + (co.z - line) * (1 - 0.7 * t)
            key.data[v.index].co = co
        print("EYE", side, "centre", tuple(round(c, 4) for c in centre),
              f"radius {radius * 1000:.1f} mm", "eyeball vertices", len(ball))
    return key


# Morph weights per clip: on for the whole sleep clip, off in the others.
MORPHS = {"sleep": 1.0, "run": 0.0, "idle": 0.0}


def key_morphs(mesh):
    """One shape-key action per clip, in an NLA track named like the clip, so the
    glTF exporter (NLA_TRACKS mode) merges it with the armature's track into one
    animation that also drives the morph weights."""
    keys = mesh.data.shape_keys
    keys.animation_data_create()
    ad = keys.animation_data
    for clip, value in MORPHS.items():
        frames = round(CLIPS[clip][1] * FPS)
        action = bpy.data.actions.new(f"{clip}-morphs")
        action.use_fake_user = True
        ad.action = action
        for block in keys.key_blocks[1:]:
            block.value = value
            for f in (0, frames):
                block.keyframe_insert("value", frame=f)
        track = ad.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, 0, action)
        if hasattr(strip, "action_slot") and action.slots:
            strip.action_slot = action.slots[0]
        ad.action = None
    for block in keys.key_blocks[1:]:
        block.value = 0.0
    print("MORPH targets", ",".join(b.name for b in keys.key_blocks[1:]),
          "weights", " ".join(f"{c}={v:g}" for c, v in MORPHS.items()))


def use_morph_clip(mesh, clip):
    """Play one clip's morph action directly (tracks muted), for checks and renders."""
    ad = mesh.data.shape_keys.animation_data
    for track in ad.nla_tracks:
        track.mute = clip is not None
    ad.action = bpy.data.actions[f"{clip}-morphs"] if clip else None
    if clip and hasattr(ad, "action_slot") and ad.action.slots:
        ad.action_slot = ad.action.slots[0]


def part_of(bone):
    """Body region of a bone, for the intersection check."""
    if bone.startswith(("head", "ear")):
        return "head"
    if bone.startswith("tail"):
        return "tail"
    for limb in ("front_forearm", "front_paw", "front_toe"):
        if bone.startswith(limb):
            return "front." + bone[-1]
    for limb in ("hind_shin", "hind_hock", "hind_toe"):
        if bone.startswith(limb):
            return "hind." + bone[-1]
    return "body"


def deformed(mesh):
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(graph)
    me = evaluated.to_mesh()
    points = [evaluated.matrix_world @ v.co for v in me.vertices]
    evaluated.to_mesh_clear()
    return points


def penetration(points, parts, tris, edges):
    """Worst depth by which one region of the deformed mesh passes into another.

    Intersecting triangle pairs between regions (pairs sharing a vertex do not
    count) seed a flood through each side's vertices that lie inside the other
    region (ray parity, majority of five rays; regions are open only at their
    seams); the farthest of those from the other region's surface is the pair's
    penetration. Returns {(a, b): (metres, vertex)}."""
    from mathutils.bvhtree import BVHTree
    names = sorted(set(parts))
    own = {n: [t for t in tris if sum(parts[i] == n for i in t) >= 2] for n in names}
    trees = {n: BVHTree.FromPolygons(points, own[n]) for n in names}
    worst = {}
    for x, a in enumerate(names):
        for b in names[x + 1:]:
            hits = [(own[a][i], own[b][j]) for i, j in trees[a].overlap(trees[b])
                    if not set(own[a][i]) & set(own[b][j])]
            for side, other, k in ((a, b, 0), (b, a, 1)):
                seen = set()
                stack = [v for pair in hits for v in pair[k] if parts[v] == side]
                best = (0.0, -1)
                while stack:
                    v = stack.pop()
                    if v in seen:
                        continue
                    seen.add(v)
                    if not inside(trees[other], points[v]):
                        continue
                    dist = trees[other].find_nearest(points[v])[3]
                    best = max(best, (dist, v))
                    stack.extend(w for w in edges[v] if parts[w] == side)
                if hits and best[1] >= 0:
                    worst[(side, other)] = best
    return worst


def paw_gaps(points, parts, tris, distal):
    """Per leg: how far its paw (paw/toe, hock/toe vertices) is from its nearest
    support, the floor or another body region; ~0 means it rests on something."""
    from mathutils.bvhtree import BVHTree
    out = []
    for leg in ("front.L", "front.R", "hind.L", "hind.R"):
        others = [t for t in tris if sum(parts[i] != leg for i in t) >= 2]
        tree = BVHTree.FromPolygons(points, others)
        gaps = sorted(min(points[i].z, tree.find_nearest(points[i])[3])
                      for i in range(len(points)) if parts[i] == leg and distal[i])
        out.append(f"{leg} min {gaps[0] * 1000:.1f} median {gaps[len(gaps) // 2] * 1000:.1f} mm")
    return ", ".join(out)


def contact(points, cell=0.01, near=0.005):
    """Share of the dog's footprint (1 cm cells seen from above) whose lowest
    point is within `near` of the floor."""
    low = {}
    for q in points:
        key = (math.floor(q.x / cell), math.floor(q.y / cell))
        low[key] = min(low.get(key, 1.0), q.z)
    return sum(z <= near for z in low.values()) / len(low)


RAYS = [Vector(d).normalized() for d in
        ((0.3, 0.5, 0.81), (-0.7, 0.2, 0.68), (0.1, -0.9, 0.42), (0.6, -0.3, -0.74), (-0.4, -0.6, -0.69))]


def inside(tree, point):
    votes = 0
    for d in RAYS:
        o, hits = point + d * 1e-5, 0
        while True:
            loc = tree.ray_cast(o, d)[0]
            if loc is None:
                break
            hits += 1
            o = loc + d * 1e-5
        votes += hits % 2
    return votes >= 3


def check_intersections(rig, mesh, clip, frames):
    me = mesh.data
    groups = {g.index: g.name for g in mesh.vertex_groups}
    parts = [part_of(groups[max(v.groups, key=lambda g: g.weight).group]) for v in me.vertices]
    me.calc_loop_triangles()
    tris = [tuple(t.vertices) for t in me.loop_triangles]
    edges = [[] for _ in me.vertices]
    for e in me.edges:
        edges[e.vertices[0]].append(e.vertices[1])
        edges[e.vertices[1]].append(e.vertices[0])
    distal = [groups[max(v.groups, key=lambda g: g.weight).group].startswith(
        ("front_paw", "front_toe", "hind_hock", "hind_toe")) for v in me.vertices]
    ad = rig.animation_data
    for track in ad.nla_tracks:
        track.mute = True
    ad.action = bpy.data.actions[clip]
    if hasattr(ad, "action_slot") and ad.action.slots:
        ad.action_slot = ad.action.slots[0]
    overall = (0.0, None)
    for f in frames:
        bpy.context.scene.frame_set(f)
        points = deformed(mesh)
        # Top of the back over the hips (x < -0.08) against over the shoulders.
        rump = max(q.z for q in points if q.x < -0.08)
        withers = max(q.z for q in points if 0.0 < q.x < 0.09)
        print("RUMP", clip, f, f"{(rump - withers) * 1000:+.1f} mm above the withers")
        print("CONTACT", clip, f, f"{contact(points) * 100:.0f}% of the footprint within 5 mm",
              f"lowest {min(q.z for q in points) * 1000:+.1f} mm")
        print("PAW", clip, f, paw_gaps(points, parts, tris, distal))
        worst = penetration(points, parts, tris, edges)
        for (a, b), (d, i) in sorted(worst.items(), key=lambda kv: -kv[1][0])[:5]:
            print("INTERSECT", clip, f, f"{a} into {b}", f"{d * 1000:.1f} mm", "vertex", i,
                  "at", tuple(round(c, 3) for c in points[i]),
                  groups[max(me.vertices[i].groups, key=lambda g: g.weight).group])
        for key, (d, _) in worst.items():
            if d > overall[0]:
                overall = (d, (f, *key))
    print("WORST", clip, f"{overall[0] * 1000:.1f} mm", overall[1])
    ad.action = None
    for track in ad.nla_tracks:
        track.mute = False


# Allowed flexion about local z per leg joint (degrees; the sign of natural
# flexion: elbow and hock tips forward are negative, carpus and stifle tips back
# are positive), and the most twist about the bone's own axis or abduction.
JOINT_LIMITS = {
    "front_scapula": (-30, 30), "front_upperarm": (-40, 70), "front_forearm": (-150, 5),
    "front_paw": (-20, 120), "front_toe": (-40, 70),
    "hind_thigh": (-110, 30), "hind_shin": (-5, 140), "hind_hock": (-140, 5),
    "hind_toe": (-60, 70),
}
MAX_TWIST = 30


def check_joints(rig, clip, frames):
    """JOINTS line: every leg bone's swing (flexion, abduction) and twist in the
    clip's frames, against JOINT_LIMITS."""
    ad = rig.animation_data
    ad.action = bpy.data.actions[clip]
    if hasattr(ad, "action_slot") and ad.action.slots:
        ad.action_slot = ad.action.slots[0]
    bad, worst = [], {}
    for f in frames:
        bpy.context.scene.frame_set(f)
        for pb in rig.pose.bones:
            limit = JOINT_LIMITS.get(pb.name.split(".")[0])
            if not limit:
                continue
            q = pb.matrix_basis.to_quaternion()
            twist = math.degrees(2 * math.atan2(q.y, q.w))
            twist = (twist + 180) % 360 - 180
            v = q @ Vector((0, 1, 0))
            flex = math.degrees(math.atan2(-v.x, v.y))
            side = math.degrees(math.asin(max(-1.0, min(1.0, v.z))))
            worst[pb.name] = (round(flex), round(side), round(twist))
            if not limit[0] <= flex <= limit[1] or abs(twist) > MAX_TWIST or abs(side) > MAX_TWIST:
                bad.append(f"{pb.name}@{f} flex {flex:.0f} side {side:.0f} twist {twist:.0f}")
    ad.action = None
    print("JOINTS", clip, "ok" if not bad else "BAD " + "; ".join(bad[:8]),
          "|", " ".join(f"{n}={a}" for n, a in worst.items() if n.endswith(".L")))


def plain_specular(obj):
    """The source's doubled specular tint (2.0) exports as KHR_materials_specular,
    which /world does not ship (a physical material per model): white drops it."""
    for slot in obj.material_slots:
        for node in slot.material.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Specular Tint"].default_value = (1.0, 1.0, 1.0, 1.0)


def build(source, out, blend):
    obj = import_source(source)
    triangles = clean(obj)
    rig = build_armature(obj)
    bind(obj, rig)
    key_clips(rig, obj)
    plain_specular(obj)
    if "sleep" in CLIPS:
        add_settle_key(rig, obj, "sleep")
        add_eyes_key(obj)
        key_morphs(obj)
        reground(rig, obj, "sleep")
        use_morph_clip(obj, "sleep")
        check_intersections(rig, obj, "sleep", [0, 30, 60, 90])
        check_joints(rig, "sleep", [0, 30, 60, 90])
        use_morph_clip(obj, None)
    bpy.context.scene.frame_set(0)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=out, export_format="GLB", use_selection=True, export_yup=True,
        export_image_format="AUTO", export_jpeg_quality=88, export_skins=True,
        export_def_bones=True, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=True, export_frame_step=1, export_anim_single_armature=True,
        export_morph=True, export_morph_normal=True, export_morph_animation=True,
        export_apply=False,
    )
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    lo = [min((obj.matrix_world @ v.co)[i] for v in obj.data.vertices) for i in range(3)]
    hi = [max((obj.matrix_world @ v.co)[i] for v in obj.data.vertices) for i in range(3)]
    print("PREPARED", out, "triangles", triangles, "vertices", len(obj.data.vertices),
          "bones", len(rig.data.bones), "clips", ",".join(CLIPS),
          "size", " x ".join(f"{h - l:.3f}" for l, h in zip(lo, hi)), "m (x nose, y left, z up)")


# ---- Render ------------------------------------------------------------------------

def light(name, energy, location, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.size = size
    obj = bpy.data.objects.new(name, data)
    obj.location = location
    obj.rotation_euler = (Vector((0, 0, 0.15)) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(obj)


def set_clip(rig, name):
    ad = rig.animation_data
    for track in ad.nla_tracks:
        track.mute = True
    action = bpy.data.actions[name]
    ad.action = action
    # The importer keeps each clip in one action: an OBJECT slot for the
    # armature and a KEY slot for the morph weights.
    slots = {s.target_id_type: s for s in getattr(action, "slots", [])}
    if "OBJECT" in slots:
        ad.action_slot = slots["OBJECT"]
    mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH" and o.find_armature())
    keys = mesh.data.shape_keys
    if keys and keys.animation_data:
        for track in keys.animation_data.nla_tracks:
            track.mute = True
        keys.animation_data.action = action
        if "KEY" in slots:
            keys.animation_data.action_slot = slots["KEY"]


def lowest(scene):
    """Lowest point of the deformed dog, in metres above the floor."""
    return lowest_z(next(o for o in scene.objects if o.type == "MESH" and o.find_armature()))


def views_ground(which):
    """The view during which GROUND lines are printed (once per frame)."""
    return which.split(",")[0] if which else "side"


def render(glb, prefix, *clips):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=glb)
    rig = next(o for o in scene.objects if o.type == "ARMATURE")
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = int(os.environ.get("DOG_RENDER_SIZE", 480))
    scene.eevee.taa_render_samples = 32
    for name in dir(scene.render):
        if name.startswith("use_stamp"):
            setattr(scene.render, name, False)
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("studio")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.32, 0.33, 0.35, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    bpy.ops.mesh.primitive_plane_add(size=3)
    floor = bpy.context.active_object
    mat = bpy.data.materials.new("floor")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.18, 0.18, 0.19, 1)
    floor.data.materials.append(mat)
    light("key", 30, (0.9, 1.0, 1.3), 0.8)
    light("fill", 10, (0.6, -1.2, 0.5), 1.2)
    light("rim", 20, (-1.2, 0.2, 0.9), 0.8)
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.lens = 60
    target = Vector((0.0, 0.0, 0.14))
    # Camera direction from the target, distance, and target per view.
    views = {
        "three-quarter": (Vector((1.0, 1.05, 0.55)), 1.25, Vector((0.0, 0.0, 0.14))),
        "side": (Vector((0.0, 1.5, 0.28)), 1.25, Vector((0.0, 0.0, 0.14))),
        "top": (Vector((0.0, 0.001, 1.0)), 1.1, Vector((0.0, 0.0, 0.0))),
        "close": (Vector((0.45, 0.75, 0.9)), 0.55, None),
        # Face close-up: from the front left, a little above, aimed at the head bone.
        "face": (Vector((1.0, 0.6, 0.45)), 0.3, "head"),
    }
    for spec in clips:
        spec, _, which = spec.partition("@")
        name, frames = spec.split(":")
        set_clip(rig, name)
        for view in (which.split(",") if which else ["three-quarter", "side"]):
            direction, distance, target = views[view]
            scene.frame_set(int(frames.split(",")[0]))
            if target == "head":
                pb = rig.pose.bones["head"]
                target = rig.matrix_world @ ((pb.head + pb.tail) / 2)
            elif target is None:
                # The curl's centre: the middle of the deformed dog's bounds.
                pts = deformed(next(o for o in scene.objects if o.type == "MESH" and o.find_armature()))
                target = Vector([(min(q[k] for q in pts) + max(q[k] for q in pts)) / 2 for k in range(3)])
            camera.location = target + direction.normalized() * distance
            camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
            for frame in frames.split(","):
                scene.frame_set(int(frame))
                if view == views_ground(which):
                    print("GROUND", name, frame, f"{lowest(scene):+.4f}")
                scene.render.filepath = f"{prefix}{name}-{view}-{int(frame):03d}.png"
                bpy.ops.render.render(write_still=True)
                print("RENDERED", scene.render.filepath)


if MODE == "build":
    build(*ARGS[1:4])
elif MODE == "render":
    render(*ARGS[1:])
else:
    raise SystemExit(f"unknown mode {MODE!r}")
