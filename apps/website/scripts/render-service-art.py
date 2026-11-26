"""Render the six website illustrations with the project's shared Blender palette."""

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))
from render_category_completion import studio

WIDTH, HEIGHT = 640, 400
ART = {
    "job": [
        ("case", (-.43, -.15, .08), 1.01, -.10),
        ("paper", (.37, .25, .08), .77, .04),
        ("magnifier", (.67, -.40, -.04), .53, -.13),
    ],
    "housing": [
        ("house", (-.23, .12, .05), .94, 0),
        ("key", (.66, -.36, .02), .64, -.25),
        ("flower", (-.79, -.42, .06), .30, .12),
    ],
    "used": [
        ("parcel", (-.44, .15, .04), 1.02, -.12),
        ("camera", (.46, -.36, .00), .76, -.18),
        ("book", (.62, .35, .04), .54, .12),
    ],
    "merchant": [
        ("website-shop", (-.19, .12, .07), 1.05, 0),
        ("bag", (.64, -.38, .02), .59, -.16),
        ("flower", (-.76, -.38, .04), .32, .18),
    ],
    "service": [
        ("website-toolkit", (-.36, .04, .08), 1.04, -.09),
        ("bulb", (.60, -.12, .02), .82, .11),
    ],
    "community": [
        ("notice", (-.45, .20, .08), .89, -.02),
        ("adult", (.46, .02, .04), .74, -.16),
        ("flower", (.68, -.39, .04), .39, .14),
    ],
}

shared_model = studio.model


def model(name):
    if name == "website-toolkit":
        studio.box(0, 0, .26, 1.25, .67, .46, "rose", .07)
        studio.box(0, 0, .50, 1.28, .70, .11, "pink", .04)
        studio.curve([(-.28, 0, .56), (-.27, 0, .76), (-.18, 0, .80),
                      (.18, 0, .80), (.27, 0, .76), (.28, 0, .56)], .046, "plum")
        for x in (-.35, .35):
            studio.box(x, -.355, .43, .14, .062, .15, "gold", .025)
        return
    if name != "website-shop":
        shared_model(name)
        return
    shared_model("shop")
    for x in (-.38, .38):
        studio.box(x, -.346, .51, .26, .035, .31, "wood", .022)
        studio.box(x, -.369, .53, .219, .024, .247, "blue", .014)
        studio.box(x, -.385, .53, .018, .016, .237, "cream", .006)
        studio.box(x, -.385, .55, .211, .016, .016, "cream", .006)
    studio.box(.557, .10, .60, .028, .39, .42, "lilac", .018)
    studio.box(.576, .10, .60, .018, .34, .37, "blue", .012)
    studio.box(.589, .10, .60, .015, .014, .36, "cream", .005)


studio.model = model


def frame_scene():
    camera = bpy.context.scene.camera
    bpy.context.view_layer.update()
    local = camera.matrix_world.inverted()
    corners = [
        local @ (obj.matrix_world @ Vector(corner))
        for obj in bpy.context.scene.objects
        if obj.type in {"MESH", "CURVE"}
        for corner in obj.bound_box
    ]
    left, right = min(p.x for p in corners), max(p.x for p in corners)
    bottom, top = min(p.y for p in corners), max(p.y for p in corners)
    center = Vector(((left + right) / 2, (bottom + top) / 2, 0))
    camera.location += camera.rotation_euler.to_matrix() @ center
    camera.data.ortho_scale = max(right - left, (top - bottom) * WIDTH / HEIGHT) * 1.10


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--only", choices=ART)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    if not args.out.is_absolute():
        parser.error("--out requires an absolute path")
    args.out.mkdir(parents=True, exist_ok=True)

    for name, objects in ART.items():
        if args.only and name != args.only:
            continue
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        studio.setup()
        scene = bpy.context.scene
        scene.render.resolution_x = WIDTH
        scene.render.resolution_y = HEIGHT
        scene.cycles.samples = 32
        studio.box(0, 0, .01, 2.50, 1.62, .14, "white", .06)
        for model, location, scale, rotation in objects:
            studio.place(model, location, scale, rotation)
        frame_scene()
        scene.render.filepath = str(args.out / (name + ".png"))
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
