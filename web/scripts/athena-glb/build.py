"""Builds web/public/athena/athena.glb (the crowned ghost) in Blender.

Run:  /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
        --python web/scripts/athena-glb/build.py -- [--out PATH] [--render DIR]

Blender is Z-up and the character faces -Y; the glTF exporter turns that into
Y-up facing +Z, which is what athenaGlbEngine's camera looks at.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


HERE = os.path.dirname(os.path.abspath(__file__))
OUT = arg('--out', os.path.normpath(os.path.join(HERE, '../../public/athena/athena.glb')))
RENDER_DIR = arg('--render')

# ---------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection


def link(obj):
    col.objects.link(obj)
    return obj


# ---------------------------------------------------------------- materials
def srgb(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name, rgb, metallic=0.0, rough=0.5, coat=0.0, coat_rough=0.05, sheen=0.0, sheen_tint=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*[srgb(c) for c in rgb], 1.0)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = coat_rough
    if sheen:
        b.inputs['Sheen Weight'].default_value = sheen
        b.inputs['Sheen Tint'].default_value = (*[srgb(c) for c in (sheen_tint or rgb)], 1.0)
        b.inputs['Sheen Roughness'].default_value = 0.4
    return m


M_PORCELAIN = material('Porcelain', (0.95, 0.95, 0.96), rough=0.22, coat=0.7, coat_rough=0.06)
M_INK = material('Ink', (0.025, 0.025, 0.03), rough=0.32, coat=0.45, coat_rough=0.12)
M_GOLD = material('ChampagneGold', (0.80, 0.70, 0.52), metallic=1.0, rough=0.34)
M_VELVET = material('PlumVelvet', (0.26, 0.055, 0.15), rough=0.95, sheen=0.12, sheen_tint=(0.5, 0.26, 0.4))
M_RUBY = material('Ruby', (0.38, 0.05, 0.17), rough=0.12, coat=1.0)
M_PEARL = material('Pearl', (0.96, 0.94, 0.90), rough=0.22, coat=1.0, coat_rough=0.04)


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


# ---------------------------------------------------------------- mesh helpers
def mesh_obj(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    me.update()
    return smooth(assign(link(bpy.data.objects.new(name, me)), mat))


def lathe(name, profile, mat, seg=64, depth=1.0, radial=None, zfn=None, close_top=True, close_bottom=True):
    """Revolves (r, z) points (top to bottom) around Z. radial(theta, i) scales r; zfn(theta, i) offsets z."""
    verts, faces = [], []
    rings = len(profile)
    for i, (r, z) in enumerate(profile):
        for s in range(seg):
            t = 2 * math.pi * s / seg
            rr = r * (radial(t, i) if radial else 1.0)
            zz = z + (zfn(t, i) if zfn else 0.0)
            verts.append((rr * math.sin(t), -rr * math.cos(t) * depth, zz))
    for i in range(rings - 1):
        for s in range(seg):
            a, b = i * seg + s, i * seg + (s + 1) % seg
            c, d = b + seg, a + seg
            faces.append((a, b, c, d))
    if close_top:
        verts.append((0, 0, profile[0][1] + (zfn(0, 0) if zfn else 0)))
        top = len(verts) - 1
        faces += [(top, (s + 1) % seg, s) for s in range(seg)]
    if close_bottom:
        verts.append((0, 0, profile[-1][1]))
        bot = len(verts) - 1
        base = (rings - 1) * seg
        faces += [(bot, base + s, base + (s + 1) % seg) for s in range(seg)]
    return weld(mesh_obj(name, verts, faces, mat))


def weld(obj, dist=1e-6):
    """Merges coincident vertices (lathe poles, closed profiles) so shading is continuous."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bm.to_mesh(obj.data)
    bm.free()
    return smooth(obj)


def bez(p0, p1, p2, p3, t):
    q = 1 - t
    return tuple(q * q * q * a + 3 * q * q * t * b + 3 * q * t * t * c + t * t * t * d
                 for a, b, c, d in zip(p0, p1, p2, p3))


def ribbon_along(name, pts, normals, width_fn, thick_fn, mat, seg=12, power=3.0):
    """Sweeps a rounded-rectangle section along pts; normals[i] is the section's thickness axis."""
    verts, faces = [], []
    n = len(pts)
    e = 2.0 / power
    for i, p in enumerate(pts):
        p = Vector(p)
        tan = (Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        nrm = Vector(normals[i])
        nrm = (nrm - tan * nrm.dot(tan)).normalized()
        bi = tan.cross(nrm).normalized()
        t = i / (n - 1)
        w, th = width_fn(t) * 0.5, thick_fn(t) * 0.5
        for k in range(seg):
            ang = 2 * math.pi * k / seg
            c, sn = math.cos(ang), math.sin(ang)
            x = math.copysign(abs(c) ** e, c)
            y = math.copysign(abs(sn) ** e, sn)
            verts.append(tuple(p + bi * (w * x) + nrm * (th * y)))
    for i in range(n - 1):
        for k in range(seg):
            a0, b0 = i * seg + k, i * seg + (k + 1) % seg
            faces.append((a0, b0, b0 + seg, a0 + seg))
    verts.append(tuple(pts[0]))
    verts.append(tuple(pts[-1]))
    c0, c1 = len(verts) - 2, len(verts) - 1
    faces += [(c0, (k + 1) % seg, k) for k in range(seg)]
    base = (n - 1) * seg
    faces += [(c1, base + k, base + (k + 1) % seg) for k in range(seg)]
    return mesh_obj(name, verts, faces, mat)


def sphere(name, loc, radius, mat, scale=(1, 1, 1), seg=16, rings=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=radius, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    return smooth(assign(o, mat))


def tube_along(name, pts, radius, mat, seg=10, radius_fn=None):
    """Sweeps a circle along points (polyline) — used for arches and the smile."""
    verts, faces = [], []
    n = len(pts)
    for i, p in enumerate(pts):
        p = Vector(p)
        tan = (Vector(pts[min(i + 1, n - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        ref = Vector((0, 1, 0)) if abs(tan.y) < 0.9 else Vector((1, 0, 0))
        u = tan.cross(ref).normalized()
        v = tan.cross(u).normalized()
        r = radius * (radius_fn(i / (n - 1)) if radius_fn else 1.0)
        for s in range(seg):
            a = 2 * math.pi * s / seg
            verts.append(tuple(p + (u * math.cos(a) + v * math.sin(a)) * r))
    for i in range(n - 1):
        for s in range(seg):
            a, b = i * seg + s, i * seg + (s + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    verts.append(tuple(pts[0]))
    verts.append(tuple(pts[-1]))
    s0, s1 = len(verts) - 2, len(verts) - 1
    faces += [(s0, (s + 1) % seg, s) for s in range(seg)]
    base = (n - 1) * seg
    faces += [(s1, base + s, base + (s + 1) % seg) for s in range(seg)]
    return mesh_obj(name, verts, faces, mat)


def box(name, loc, size, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bev = o.modifiers.new('bevel', 'BEVEL')
    bev.width = min(size) * 0.3
    bev.segments = 2
    return assign(o, mat)


def join(name, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        for m in list(o.modifiers):
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def set_origin(obj, point):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    scene.cursor.location = point
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')


# ---------------------------------------------------------------- body
DEPTH = 0.86
BODY_PROFILE = [
    (0.000, 1.000), (0.060, 0.995), (0.110, 0.982), (0.150, 0.962), (0.185, 0.935),
    (0.212, 0.900), (0.233, 0.860), (0.248, 0.815), (0.258, 0.760), (0.264, 0.700),
    (0.267, 0.630), (0.270, 0.550), (0.275, 0.470), (0.283, 0.390), (0.295, 0.310),
    (0.312, 0.235), (0.332, 0.165), (0.352, 0.105), (0.368, 0.055), (0.378, 0.020),
    (0.382, 0.000),
    # hem folds inward to a shallow hollow underneath
    (0.360, -0.006), (0.300, 0.020), (0.180, 0.050), (0.000, 0.062),
]
HEM_START = 0.26  # rings below this height ripple into soft lobes


def hem_weight(i):
    r, z = BODY_PROFILE[i]
    if i >= 20:
        return 1.0
    return max(0.0, min(1.0, (HEM_START - z) / HEM_START)) ** 1.6


def hem_z(t, i):
    return 0.038 * hem_weight(i) * math.cos(5 * t + 0.4)


def hem_r(t, i):
    return 1.0 + 0.045 * hem_weight(i) * math.cos(5 * t + 0.4)


body = lathe('Body', BODY_PROFILE, M_PORCELAIN, seg=96, depth=DEPTH, radial=hem_r, zfn=hem_z,
             close_top=False, close_bottom=False)
# the profile starts at r=0 and ends at r=0, so the poles are already closed by degenerate rings
bm = bmesh.new()
bm.from_mesh(body.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(body.data)
bm.free()
smooth(body)

bpy.context.view_layer.update()
_bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())


def surface(x, z, inset=0.0):
    """Point on the body's front surface at (x, z), pushed inward by `inset` along the normal."""
    hit, normal, _, _ = _bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
    return hit - normal * inset, normal


# face — eyes are glossy black ovals set into the porcelain, smile is a short ink stroke
face = []
for sx in (-1, 1):
    p, n = surface(0.112 * sx, 0.790, inset=0.004)
    e = sphere('Eye', p, 1.0, M_INK, scale=(0.036, 0.014, 0.058), seg=24, rings=14)
    e.rotation_euler = (0, 0, math.atan2(n.x, -n.y))  # turn to follow the cheek, keep the oval upright
    face.append(e)
smile_pts = []
for k in range(13):
    u = -1 + 2 * k / 12
    x = 0.040 * u
    z = 0.708 + 0.015 * (u * u)
    p, _ = surface(x, z, inset=0.003)
    smile_pts.append(p)
face.append(tube_along('Smile', smile_pts, 0.0115, M_INK, seg=10,
                       radius_fn=lambda t: 0.75 + 0.25 * math.sin(math.pi * t)))
face = join('Face', face)

# arms — scepter arm (viewer's left, -X) reaches forward; the other is a small flipper
SHOULDER_L = Vector((-0.225, -0.03, 0.580))
HAND_L = Vector((-0.372, -0.105, 0.560))
arm_l_parts = [
    tube_along('ArmL', [SHOULDER_L.lerp(HAND_L, t / 8) for t in range(9)], 0.070, M_PORCELAIN, seg=20,
               radius_fn=lambda t: 1.0 - 0.22 * t),
    sphere('HandL', HAND_L, 0.064, M_PORCELAIN, seg=24, rings=16, scale=(1.0, 0.95, 0.92)),
]
arm_l = join('ArmL', arm_l_parts)
set_origin(arm_l, SHOULDER_L)

SHOULDER_R = Vector((0.225, 0.01, 0.610))
TIP_R = Vector((0.375, 0.03, 0.395))
flip_pts = [SHOULDER_R.lerp(TIP_R, t / 10) + Vector((0.03 * math.sin(math.pi * t / 10), 0, 0)) for t in range(11)]
arm_r = tube_along('ArmR', flip_pts, 0.072, M_PORCELAIN, seg=24,
                   radius_fn=lambda t: 0.62 + 0.38 * math.sin(math.pi * min(1.0, 0.35 + t * 0.75)))
tip = sphere('TipR', TIP_R, 0.044, M_PORCELAIN, seg=20, rings=12)
arm_r = join('ArmR', [arm_r, tip])
# flatten front-to-back so it reads as a soft flipper, not a sausage
for v in arm_r.data.vertices:
    v.co.y = 0.02 + (v.co.y - 0.02) * 0.68
set_origin(arm_r, SHOULDER_R)


# ---------------------------------------------------------------- crowns
Z = Vector((0, 0, 1))


def ring_frame(th):
    """Outward and sideways unit vectors at angle th around the crown (th=0 faces the viewer)."""
    return Vector((math.sin(th), -math.cos(th), 0)), Vector((math.cos(th), math.sin(th), 0))


def gem(name, pos, th, size, mat):
    o = sphere(name, pos, 1.0, mat, scale=size, seg=14, rings=10)
    o.rotation_euler = (0, 0, th)
    return o


def leaf(base, direction, normal, length, width, thick):
    """A pointed, slightly domed gold leaf: the lobe of a fleuron."""
    pts = [base + direction * (length * j / 10) for j in range(11)]
    return ribbon_along('Leaf', pts, [normal] * 11,
                        lambda t: width * math.sin(math.pi * t ** 0.75) ** 0.8 + 1e-4,
                        lambda t: thick * math.sin(math.pi * t) ** 0.5 + 1e-4, M_GOLD, seg=10, power=2.2)


def crown(name, R, z0, arches=8, phase=0.0, pearls=7, minor=True):
    """A closed royal crown, proportioned on its band radius R.

    Rimmed gold band set with bezelled rubies; a three-lobed fleuron at the foot of each arch;
    broad strap arches that swell outward and dip to the centre, pearled along the spine;
    a plum velvet cap that puffs out between the arches; an orb and a cross pattée on top.
    """
    h, H = 0.40 * R, 1.15 * R
    zt = z0 + h
    parts = []

    # band: raised rims above and below a recessed face, closed into a solid ring
    prof = [(1.00, 1.00), (1.05, 0.98), (1.075, 0.90), (1.05, 0.82), (1.02, 0.79), (1.02, 0.21),
            (1.055, 0.18), (1.085, 0.09), (1.055, 0.01), (1.00, 0.00), (0.93, 0.00), (0.93, 1.00), (1.00, 1.00)]
    parts.append(lathe(name + 'Band', [(R * r, z0 + h * z) for r, z in prof], M_GOLD, seg=96,
                       close_top=False, close_bottom=False))
    for k in range(arches):
        th = phase + 2 * math.pi * (k + 0.5) / arches  # between arches: an oval ruby in a gold bezel
        out, _ = ring_frame(th)
        mid = Z * (z0 + h * 0.5)
        parts.append(gem('Bezel', out * (R * 1.022) + mid, th, (R * 0.135, R * 0.035, R * 0.095), M_GOLD))
        parts.append(gem('Ruby', out * (R * 1.04) + mid, th, (R * 0.105, R * 0.05, R * 0.068), M_RUBY))
        th = phase + 2 * math.pi * k / arches  # under each arch: a small pearl stud
        out, _ = ring_frame(th)
        parts.append(sphere('Stud', out * (R * 1.035) + mid, R * 0.04, M_PEARL, seg=10, rings=7))

    # velvet cap: fills the crown and bulges out between the arches, pinched where they cross it
    rings = 18
    cap_prof = []
    for j in range(rings + 1):
        r, z = bez((0.96 * R, -0.35 * h), (1.42 * R, 0.50 * H), (0.85 * R, 1.02 * H), (0.0, 0.80 * H), 1 - j / rings)
        cap_prof.append((r, zt + z))
    parts.append(lathe(name + 'Cap', cap_prof, M_VELVET, seg=96, close_top=False, close_bottom=False,
                       radial=lambda th, i: 1 - 0.06 * math.sin(math.pi * (1 - i / rings))
                       * math.cos(arches * (th - phase))))

    # arches: broad straps, pearls graduated along the spine
    steps = 28
    a0, a1, a2, a3 = (1.0 * R, -0.1 * h), (1.6 * R, 0.55 * H), (0.8 * R, 1.25 * H), (0.0, 0.85 * H)
    for k in range(arches):
        th = phase + 2 * math.pi * k / arches
        out, side = ring_frame(th)
        pts, nrms = [], []
        for j in range(steps + 1):
            t = 0.97 * j / steps
            r, z = bez(a0, a1, a2, a3, t)
            r2, z2 = bez(a0, a1, a2, a3, t + 1e-3)
            ln = math.hypot(r2 - r, z2 - z)
            pts.append(out * r + Z * (zt + z))
            nrms.append(out * ((z2 - z) / ln) + Z * (-(r2 - r) / ln))
        parts.append(ribbon_along('Arch', pts, nrms, lambda t: R * (0.21 - 0.08 * t), lambda t: R * 0.055,
                                  M_GOLD, seg=12, power=4.0))
        for i in range(pearls):
            t = 0.2 + 0.68 * i / max(1, pearls - 1)
            j = round(t * steps)
            pr = R * (0.064 - 0.022 * t)
            parts.append(sphere('P', pts[j] + nrms[j] * (R * 0.0275 + pr * 0.55), pr, M_PEARL, seg=10, rings=7))

        # fleuron at the arch foot: three leaves splayed outward, a ruby at the knot
        # (it leans out with the arch's swell, so it stands proud of the strap instead of behind it)
        up = (Z + out * 0.5).normalized()
        base = out * (R * 1.09) + Z * (zt - 0.08 * h)
        parts.append(leaf(base, up, out, R * 0.52, R * 0.23, R * 0.085))
        for sd in (-1, 1):
            d = up * math.cos(1.05) + side * (sd * math.sin(1.05))
            parts.append(leaf(base + up * (R * 0.07), d, out, R * 0.33, R * 0.17, R * 0.075))
        parts.append(gem('Knot', base + up * (R * 0.11), th, (R * 0.13, R * 0.05, R * 0.05), M_GOLD))
        parts.append(sphere('Ruby', base + up * (R * 0.2) + out * (R * 0.045), R * 0.042, M_RUBY, seg=10, rings=7))

        if minor:  # a smaller pearl-tipped point between arches
            th2 = th + math.pi / arches
            out2, _ = ring_frame(th2)
            up2 = (Z + out2 * 0.3).normalized()
            b2 = out2 * (R * 1.05) + Z * (zt - 0.05 * h)
            parts.append(leaf(b2, up2, out2, R * 0.26, R * 0.14, R * 0.065))
            parts.append(sphere('P', b2 + up2 * (R * 0.275), R * 0.045, M_PEARL, seg=10, rings=7))

    # boss where the arches meet, orb with its girdle, cross pattée
    cz = zt + 0.85 * H
    parts.append(lathe(name + 'Boss', [(0.0, cz + 0.03 * R), (0.16 * R, cz + 0.02 * R), (0.23 * R, cz - 0.03 * R),
                                       (0.16 * R, cz - 0.08 * R), (0.0, cz - 0.09 * R)], M_GOLD, seg=28,
                       close_top=False, close_bottom=False))
    orb = Vector((0, 0, cz + 0.14 * R))
    parts.append(sphere(name + 'Orb', orb, R * 0.135, M_GOLD, seg=20, rings=14))
    parts.append(sphere(name + 'Girdle', orb, 1.0, M_GOLD, scale=(R * 0.15, R * 0.15, R * 0.03), seg=20, rings=8))
    half = R * 0.21
    cc = orb + Z * (R * 0.135 + half * 0.92)
    front = Vector((0, -1, 0))
    for d in (Vector((1, 0, 0)), Vector((-1, 0, 0)), Z, -Z):
        pts = [cc + d * (half * j / 8) for j in range(9)]
        parts.append(ribbon_along('Cross', pts, [front] * 9, lambda t: R * (0.07 + 0.16 * t ** 1.5),
                                  lambda t: R * 0.075, M_GOLD, seg=12, power=5.0))
    return parts


# rests on the dome like a ring on a ball: the band's inner rim touches the head, so the whole band shows
CROWN_R, CROWN_Z0 = 0.168, 0.952
crown_obj = join('Crown', crown('Crown', CROWN_R, CROWN_Z0, arches=8, phase=math.radians(20)))
for v in crown_obj.data.vertices:
    v.co.y *= 0.9
# worn at a jaunty angle like the reference (leaning to the viewer's left); it turns about the
# centre of the head's dome, so it slides over the head and stays seated
_pivot = Vector((0, 0, 0.78))
crown_obj.data.transform(Matrix.Translation(_pivot) @ Matrix.Rotation(0.05, 4, 'X')
                         @ Matrix.Rotation(-0.17, 4, 'Y') @ Matrix.Translation(-_pivot))
set_origin(crown_obj, Vector((0, 0, CROWN_Z0)))


# ---------------------------------------------------------------- scepter
def scepter():
    parts = []
    # twisted shaft along +Z, from the foot (z=0) to the head collar
    L = 0.80
    seg, rings = 24, 120
    verts, faces = [], []
    for i in range(rings + 1):
        z = L * i / rings
        for s in range(seg):
            t = 2 * math.pi * s / seg
            r = 0.0165 * (1 + 0.16 * math.cos(6 * t + z * 55))
            verts.append((r * math.cos(t), r * math.sin(t), z))
    for i in range(rings):
        for s in range(seg):
            a, b = i * seg + s, i * seg + (s + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    parts.append(mesh_obj('Shaft', verts, faces, M_GOLD))
    # foot: collar + pointed finial
    parts.append(lathe('Foot', [(0.0, 0.010), (0.024, 0.006), (0.028, -0.010), (0.022, -0.022), (0.018, -0.030),
                                (0.022, -0.040), (0.016, -0.070), (0.0, -0.100)], M_GOLD, seg=24,
                       close_top=False, close_bottom=False))
    # head: knob, collar, then a little crown
    parts.append(lathe('Knob', [(0.0, L + 0.075), (0.020, L + 0.07), (0.030, L + 0.045), (0.032, L + 0.03),
                                (0.024, L + 0.012), (0.018, L), (0.0, L - 0.01)], M_GOLD, seg=28,
                       close_top=False, close_bottom=False))
    parts.append(lathe('Dish', [(0.0, L + 0.105), (0.056, L + 0.103), (0.064, L + 0.092), (0.040, L + 0.080),
                                (0.0, L + 0.075)], M_GOLD, seg=32, close_top=False, close_bottom=False))
    parts += crown('Mini', 0.058, L + 0.100, arches=6, pearls=4, minor=False)
    return join('Scepter', parts)


sc = scepter()
# stand it in the hand: the grip point (z=0.60 along the shaft) lands on the palm, tilted outward at the top
GRIP = 0.60
sc.rotation_euler = (0.06, -0.12, 0.0)
bpy.context.view_layer.update()
grip_world = sc.matrix_world @ Vector((0, 0, GRIP))
sc.location += HAND_L - grip_world
bpy.context.view_layer.update()

# every mesh gets outward-facing normals: three.js lights (and may cull) by winding
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()

# ---------------------------------------------------------------- rig
bpy.ops.object.select_all(action='DESELECT')
arm_data = bpy.data.armatures.new('AthenaRig')
rig = link(bpy.data.objects.new('Athena', arm_data))
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')


def bone(name, head, parent=None, length=0.08):
    b = arm_data.edit_bones.new(name)
    b.head = head
    b.tail = Vector(head) + Vector((0, 0, length))
    b.roll = 0
    if parent:
        b.parent = arm_data.edit_bones[parent]
    return b


bone('root', (0, 0, 0))
bone('body', (0, 0, 0.30), 'root')
bone('head', (0, 0, 0.78), 'body')
bone('arm_L', tuple(SHOULDER_L), 'body', 0.05)
bone('arm_R', tuple(SHOULDER_R), 'body', 0.05)
bpy.ops.object.mode_set(mode='OBJECT')


def parent_to_bone(obj, bone_name):
    mw = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = bone_name
    bpy.context.view_layer.update()
    obj.matrix_world = mw


parent_to_bone(body, 'body')
parent_to_bone(face, 'head')
parent_to_bone(crown_obj, 'head')
parent_to_bone(arm_l, 'arm_L')
parent_to_bone(sc, 'arm_L')
parent_to_bone(arm_r, 'arm_R')

# ---------------------------------------------------------------- animation clips
FPS = 30
scene.render.fps = FPS
pb = rig.pose.bones
for p in pb:
    p.rotation_mode = 'XYZ'

# bone local axes (bones point +Z, roll 0): local X = world X (nod), local Y = world Z (turn),
# local Z = world -Y (side roll; positive lifts the -X arm's hand… sign checked by render)
ROLL = 2  # euler index for sideways roll


def key(name, frame, loc=None, rot=None, scl=None):
    p = pb[name]
    if loc is not None:
        p.location = loc
        p.keyframe_insert('location', frame=frame)
    if rot is not None:
        p.rotation_euler = rot
        p.keyframe_insert('rotation_euler', frame=frame)
    if scl is not None:
        p.scale = scl
        p.keyframe_insert('scale', frame=frame)


def clip(name, length, frames):
    """frames: {frame: {bone: dict(loc=, rot=, scl=)}}; every bone gets a rest key at start/end."""
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    rig.animation_data_create()
    rig.animation_data.action = act
    for p in pb:
        p.location = (0, 0, 0)
        p.rotation_euler = (0, 0, 0)
        p.scale = (1, 1, 1)
    for f in sorted(frames):
        for bname, tr in frames[f].items():
            key(bname, f, **tr)
    return act


R0 = (0, 0, 0)
S1 = (1, 1, 1)

clip('idle', 60, {
    0: {'root': dict(loc=(0, 0, 0)), 'head': dict(rot=(0, 0, 0)), 'arm_L': dict(rot=R0), 'arm_R': dict(rot=R0),
        'body': dict(scl=S1)},
    30: {'root': dict(loc=(0, 0, 0.025)), 'head': dict(rot=(0, 0, 0.035)), 'arm_L': dict(rot=(0, 0, 0.05)),
         'arm_R': dict(rot=(0, 0, 0.12)), 'body': dict(scl=(1.01, 1.01, 0.99))},
    60: {'root': dict(loc=(0, 0, 0)), 'head': dict(rot=(0, 0, 0)), 'arm_L': dict(rot=R0), 'arm_R': dict(rot=R0),
         'body': dict(scl=S1)},
})

clip('wave', 48, {
    0: {'arm_R': dict(rot=R0), 'head': dict(rot=R0), 'root': dict(loc=(0, 0, 0))},
    8: {'arm_R': dict(rot=(0, 0, 1.9)), 'head': dict(rot=(0, 0, -0.08)), 'root': dict(loc=(0, 0, 0.02))},
    16: {'arm_R': dict(rot=(0, 0, 1.45))},
    24: {'arm_R': dict(rot=(0, 0, 1.95))},
    32: {'arm_R': dict(rot=(0, 0, 1.45))},
    40: {'arm_R': dict(rot=(0, 0, 1.6)), 'head': dict(rot=(0, 0, -0.08))},
    48: {'arm_R': dict(rot=R0), 'head': dict(rot=R0), 'root': dict(loc=(0, 0, 0))},
})

clip('cheer', 36, {
    0: {'root': dict(loc=(0, 0, 0)), 'body': dict(scl=S1), 'arm_L': dict(rot=R0), 'arm_R': dict(rot=R0)},
    6: {'root': dict(loc=(0, 0, -0.01)), 'body': dict(scl=(1.07, 1.07, 0.9))},
    14: {'root': dict(loc=(0, 0, 0.16)), 'body': dict(scl=(0.95, 0.95, 1.08)), 'arm_L': dict(rot=(0, 0, -0.45)),
         'arm_R': dict(rot=(0, 0, 2.1))},
    22: {'root': dict(loc=(0, 0, 0.10)), 'body': dict(scl=S1)},
    30: {'root': dict(loc=(0, 0, -0.005)), 'body': dict(scl=(1.05, 1.05, 0.93)), 'arm_L': dict(rot=R0),
         'arm_R': dict(rot=(0, 0, 0.4))},
    36: {'root': dict(loc=(0, 0, 0)), 'body': dict(scl=S1), 'arm_L': dict(rot=R0), 'arm_R': dict(rot=R0)},
})

clip('surprise', 30, {
    0: {'root': dict(loc=(0, 0, 0)), 'body': dict(rot=R0, scl=S1), 'arm_L': dict(rot=R0), 'arm_R': dict(rot=R0)},
    5: {'root': dict(loc=(0, 0.04, 0.07)), 'body': dict(rot=(-0.12, 0, 0), scl=(0.96, 0.96, 1.06)),
        'arm_L': dict(rot=(0, 0, -0.3)), 'arm_R': dict(rot=(0, 0, 1.2))},
    18: {'root': dict(loc=(0, 0.03, 0.04)), 'body': dict(rot=(-0.08, 0, 0), scl=S1)},
    30: {'root': dict(loc=(0, 0, 0)), 'body': dict(rot=R0, scl=S1), 'arm_L': dict(rot=R0), 'arm_R': dict(rot=R0)},
})

clip('think', 72, {
    0: {'head': dict(rot=R0), 'body': dict(rot=R0), 'arm_R': dict(rot=R0)},
    18: {'head': dict(rot=(0.06, 0.18, 0.12)), 'body': dict(rot=(0, 0, 0.04)), 'arm_R': dict(rot=(-0.5, 0, 1.35))},
    54: {'head': dict(rot=(0.06, 0.24, 0.14)), 'body': dict(rot=(0, 0, 0.05)), 'arm_R': dict(rot=(-0.5, 0, 1.4))},
    72: {'head': dict(rot=R0), 'body': dict(rot=R0), 'arm_R': dict(rot=R0)},
})

clip('dash', 24, {
    0: {'root': dict(loc=(0, 0, 0.02)), 'body': dict(rot=(0.22, 0, 0)), 'arm_L': dict(rot=(0.4, 0, 0)),
        'arm_R': dict(rot=(-0.4, 0, 0.5))},
    12: {'root': dict(loc=(0, 0, 0.05)), 'body': dict(rot=(0.26, 0, 0)), 'arm_L': dict(rot=(-0.2, 0, 0)),
         'arm_R': dict(rot=(0.3, 0, 0.5))},
    24: {'root': dict(loc=(0, 0, 0.02)), 'body': dict(rot=(0.22, 0, 0)), 'arm_L': dict(rot=(0.4, 0, 0)),
         'arm_R': dict(rot=(-0.4, 0, 0.5))},
})

for act in bpy.data.actions:
    for fc in getattr(act, 'fcurves', []):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
            kp.easing = 'AUTO'

rig.animation_data.action = bpy.data.actions['idle']
scene.frame_set(0)

# ---------------------------------------------------------------- export
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_apply=True,
    export_yup=True,
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_draco_mesh_compression_enable=False,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
)
print('EXPORTED', OUT, os.path.getsize(OUT))

# ---------------------------------------------------------------- preview renders
if RENDER_DIR:
    os.makedirs(RENDER_DIR, exist_ok=True)
    world = bpy.data.worlds.new('W')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.92, 0.92, 0.93, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.9
    for lname, loc, energy in (('Key', (-2.2, -3.4, 3.6), 900), ('Fill', (3.0, -2.2, 1.6), 350),
                               ('Rim', (2.0, 2.8, 2.6), 600)):
        ld = bpy.data.lights.new(lname, 'AREA')
        ld.energy = energy
        ld.size = 2.5
        lo = link(bpy.data.objects.new(lname, ld))
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cam = link(bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')))
    cam.data.lens = 85
    scene.camera = cam
    try:
        scene.render.engine = 'BLENDER_EEVEE'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    shots = [('crown', 0, 'idle', 0), ('front', 0, 'idle', 0), ('three_quarter', 35, 'idle', 0), ('side', 90, 'idle', 0),
             ('back', 180, 'idle', 0), ('wave', 0, 'wave', 10), ('cheer', 0, 'cheer', 14)]
    for label, yaw, action, frame in shots:
        rig.animation_data.action = bpy.data.actions[action]
        scene.frame_set(frame)
        a = math.radians(yaw)
        dist, cz, tz = (1.9, 1.05, 0.98) if label == 'crown' else (4.6, 0.72, 0.66)
        cam.location = (dist * math.sin(a), -dist * math.cos(a), cz)
        cam.rotation_euler = (Vector((0, 0, tz)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(RENDER_DIR, label + '.png')
        bpy.ops.render.render(write_still=True)
    print('RENDERED', RENDER_DIR)
