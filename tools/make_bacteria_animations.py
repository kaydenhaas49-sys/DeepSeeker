import bpy, math, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "assets", "backrooms_bacteria_rigged_3d_model_unofficial.glb")
OUT = os.path.join(ROOT, "assets", "bacteria", "generated")
os.makedirs(OUT, exist_ok=True)

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.import_scene.gltf(filepath=SOURCE)
arm = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
if arm is None:
    raise RuntimeError("No armature found in Bacteria GLB")

bones = list(arm.data.bones)

def norm(name):
    return name.lower().replace("-", "_").replace(" ", "_")

def kind(b):
    n = norm(b.name)
    if any(x in n for x in ("head", "skull", "neck")):
        return "head"
    if any(x in n for x in ("shoulder", "upperarm", "forearm", "arm", "hand", "wrist")):
        return "arm"
    if any(x in n for x in ("thigh", "calf", "shin", "leg", "foot", "ankle", "toe")):
        return "leg"
    if any(x in n for x in ("pelvis", "hip", "root")):
        return "root"
    if any(x in n for x in ("spine", "chest", "torso", "abdomen")):
        return "spine"
    return "other"

def depth(b):
    d = 0
    while b.parent:
        d += 1
        b = b.parent
    return d

def side(b):
    x = b.head_local.x
    if abs(x) > 0.03:
        return 1 if x > 0 else -1
    n = norm(b.name)
    if any(x in n for x in ("left", "_l", ".l")):
        return -1
    if any(x in n for x in ("right", "_r", ".r")):
        return 1
    return 1

def phase(idx):
    return (idx * 1.731) % (math.pi * 2.0)

def reset_pose():
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0.0, 0.0, 0.0)

def pose_for(anim, t, b, idx):
    k = kind(b)
    d = depth(b)
    s = side(b)
    p = phase(idx)
    w = 2.0 * math.pi
    rx = ry = rz = 0.0

    if anim == "idle":
        sway = math.sin(w * 0.28 * t + p)
        bob = math.sin(w * 0.56 * t + p * 0.6)
        if k in ("root", "spine"):
            rx += 0.045 * sway
            rz += 0.055 * math.sin(w * 0.28 * t + p + 0.5)
        elif k == "head":
            rx += 0.035 * math.sin(w * 0.31 * t + p)
            rz += 0.045 * math.sin(w * 0.22 * t + p)
        elif k == "arm":
            rz += s * 0.07 * math.sin(w * 0.30 * t + p)
            rx += 0.035 * math.sin(w * 0.30 * t + p + 1.0)
        elif k == "leg":
            rx += 0.03 * math.sin(w * 0.30 * t + p)
        else:
            rx += 0.018 * bob
            rz += 0.014 * sway

    elif anim == "stalk":
        sway = math.sin(w * 0.52 * t + p)
        if k in ("root", "spine"):
            rx += -0.16 + 0.06 * sway
            rz += 0.10 * math.sin(w * 0.52 * t + p + 0.5)
        elif k == "head":
            rx += 0.08 * math.sin(w * 0.43 * t + p)
            rz += 0.09 * math.sin(w * 0.37 * t + p + 0.8)
        elif k == "arm":
            rz += s * (0.16 + 0.12 * math.sin(w * 0.52 * t + p))
            rx += -0.08 + 0.10 * math.sin(w * 0.52 * t + p + 1.2)
            ry += 0.06 * math.sin(w * 0.34 * t + p)
        elif k == "leg":
            rx += 0.09 * math.sin(w * 0.52 * t + p + math.pi)
            rz += s * 0.04
        else:
            rx += -0.04 + 0.03 * sway

    elif anim == "chase":
        sway = math.sin(w * 0.92 * t + p)
        stride = math.sin(w * 1.45 * t + p)
        if k in ("root", "spine"):
            rx += -0.28 + 0.08 * sway
            rz += 0.14 * math.sin(w * 0.92 * t + p + 0.4)
        elif k == "head":
            rx += 0.10 * math.sin(w * 1.05 * t + p)
            rz += 0.13 * math.sin(w * 0.82 * t + p + 1.1)
        elif k == "arm":
            rz += s * 0.24 * stride
            rx += -0.05 + 0.12 * math.sin(w * 1.45 * t + p + 0.9)
            ry += 0.10 * math.sin(w * 0.9 * t + p)
        elif k == "leg":
            rx += 0.24 * math.sin(w * 1.45 * t + p + math.pi)
            rz += s * 0.06
        else:
            rx += 0.06 * sway
            ry += 0.04 * math.sin(w * 1.2 * t + p)

    elif anim == "attack":
        q = min(1.0, t / 0.45)
        snap = math.sin(math.pi * q)
        if k in ("root", "spine"):
            rx += -0.10 - 0.22 * snap
            rz += s * 0.12 * snap
        elif k == "head":
            rx += 0.10 * snap
        elif k == "arm":
            rx += -0.18 * snap
            rz += s * 0.34 * snap
        elif k == "leg":
            rx += -0.10 * snap
        else:
            ry += 0.08 * snap

    damp = max(0.35, 1.0 - max(0, d - 2) * 0.07)
    return rx * damp, ry * damp, rz * damp

ANIMS = {
    "bacteria_idle": (97, 24),
    "bacteria_stalk": (73, 24),
    "bacteria_chase": (37, 30),
    "bacteria_attack": (25, 30),
}

for action_name, (frames, fps) in ANIMS.items():
    reset_pose()
    act = bpy.data.actions.new(action_name)
    arm.animation_data_create()
    arm.animation_data.action = act
    for frame in range(frames):
        t = frame / max(1, frames - 1)
        for idx, b in enumerate(bones):
            pb = arm.pose.bones[b.name]
            pb.rotation_euler = pose_for(action_name.replace("bacteria_", ""), t, b, idx)
            pb.keyframe_insert(data_path="rotation_euler", frame=frame)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
    bpy.context.scene.frame_start = 0
    bpy.context.scene.frame_end = frames - 1
    bpy.context.scene.render.fps = fps
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    out = os.path.join(OUT, action_name + ".glb")
    bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_animations=True)
    bpy.data.actions.remove(act)

print("Bacteria animation generation complete")
for fn in sorted(os.listdir(OUT)):
    if fn.endswith(".glb"):
        print("OUTPUT", os.path.join(OUT, fn))
