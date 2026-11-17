"""Render authored category scenes with Blender. Run through blender --background --python."""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


PALETTE = {
    'cream': '#F5E9D9', 'white': '#FFF9F5', 'rose': '#BB7E99',
    'pink': '#EAC0CD', 'lilac': '#BEB0D2', 'plum': '#745568',
    'silver': '#B9B9C4', 'ink': '#3B3543', 'gold': '#DBBC87',
    'blue': '#A5B8CE', 'wood': '#BC967E', 'brown': '#826550',
}


def material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    color = PALETTE[name].lstrip('#')
    srgb = [int(color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    rgb = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in srgb]
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    node = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    output = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(node.outputs['BSDF'], output.inputs['Surface'])
    node.inputs['Base Color'].default_value = (*rgb, 1)
    node.inputs['Roughness'].default_value = 0.38 if name == 'silver' else 0.62
    node.inputs['Metallic'].default_value = 0.35 if name in ('silver', 'gold') else 0
    return mat


def finish(obj, color):
    obj.data.materials.append(material(color))
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


def box(x, y, z, w, d, h, color='cream', bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z))
    obj = bpy.context.object
    obj.dimensions = (w, d, h)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new('soft edges', 'BEVEL')
        modifier.width = min(bevel, w / 3, d / 3, h / 3)
        modifier.segments = 3
        obj.modifiers.new('weighted face normals', 'WEIGHTED_NORMAL')
    return finish(obj, color)


def ball(x, y, z, sx, sy=None, sz=None, color='cream'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=1, location=(x,y,z))
    obj = bpy.context.object
    obj.scale = (sx, sy or sx, sz or sx)
    return finish(obj, color)


def cylinder(x, y, z, radius, depth, color='cream', rotation=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=radius, depth=depth, location=(x,y,z), rotation=rotation)
    obj = bpy.context.object
    modifier = obj.modifiers.new('rounded rim', 'BEVEL')
    modifier.width = min(0.035, depth / 4)
    modifier.segments = 3
    obj.modifiers.new('weighted face normals', 'WEIGHTED_NORMAL')
    return finish(obj, color)


def curve(points, radius=0.035, color='rose'):
    data = bpy.data.curves.new('continuous tube', 'CURVE')
    data.dimensions = '3D'
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for point, co in zip(spline.bezier_points, points):
        point.co = co
        point.handle_left_type = point.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new('continuous tube', data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material(color))
    return obj


def ring(x,y,z,radius,color='rose',rotation=(math.pi/2,0,0), tube=0.045):
    bpy.ops.mesh.primitive_torus_add(major_segments=40, minor_segments=12, location=(x,y,z), major_radius=radius, minor_radius=tube, rotation=rotation)
    return finish(bpy.context.object, color)


def cross(x=0,y=-0.32,z=0.85,color='rose'):
    box(x,y,z,.15,.06,.52,color)
    box(x,y,z,.52,.06,.15,color)


def heart(x=0,y=0,z=1,color='rose'):
    count=64
    outline=[]
    for i in range(count):
        t=i*math.tau/count
        outline.append((.024*16*math.sin(t)**3,.024*(13*math.cos(t)-5*math.cos(2*t)-2*math.cos(3*t)-math.cos(4*t))))
    vertices=[(x+px,y+depth,z+pz) for depth in [-.09,.09] for px,pz in outline]
    faces=[tuple(range(count-1,-1,-1)),tuple(range(count,count*2))]
    faces.extend((i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count))
    mesh=bpy.data.meshes.new('continuous heart')
    mesh.from_pydata(vertices,[],faces)
    obj=bpy.data.objects.new('continuous heart',mesh)
    bpy.context.collection.objects.link(obj)
    bevel=obj.modifiers.new('rounded perimeter','BEVEL')
    bevel.width=.06
    bevel.segments=4
    obj.modifiers.new('weighted normals','WEIGHTED_NORMAL')
    finish(obj,color)


def paw(x=0,y=-.4,z=.8):
    ball(x,y,z,.17,.045,.14,'rose')
    for dx,dz in [(-.2,.16),(-.075,.25),(.075,.25),(.2,.16)]:
        ball(x+dx,y,z+dz,.07,.04,.09,'rose')


def dog(cat=False):
    ball(0,.06,.65,.38,.52,.42,'cream')
    for x in [-.23,.23]:
        for y in [-.27,.35]: ball(x,y,.27,.115,.15,.25,'cream')
    ball(0,-.32,1.14,.42,.34,.4,'cream')
    ball(0,-.61,1.02,.25,.12,.16,'white')
    ball(0,-.73,1.08,.07,.05,.05,'brown')
    for x in [-.16,.16]: ball(x,-.63,1.25,.045,.025,.053,'ink')
    if cat:
        for x in [-.28,.28]:
            bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=.2, radius2=0, depth=.38, location=(x,-.25,1.56), rotation=(0,0,math.pi/6))
            finish(bpy.context.object,'cream')
            ball(x,-.36,1.53,.07,.025,.11,'pink')
        curve([(.3,.38,.7),(.55,.6,.8),(.6,.6,1.25)],.065,'cream')
    else:
        for x in [-.37,.37]: ball(x,-.26,1.13,.14,.17,.33,'brown')
        curve([(.1,.46,.75),(.1,.7,.83),(.27,.76,1.04)],.07,'cream')
    box(0,-.3,.84,.57,.1,.09,'rose')
    ball(0,-.37,.78,.06,.02,.07,'gold')


def person(child=False, seated=False):
    size=.78 if child else 1
    before=set(bpy.data.objects)
    ball(0,0,1.5,.24,.22,.27,'cream')
    ball(0,.03,1.65,.25,.21,.17,'brown')
    for x in [-.08,.08]: ball(x,-.205,1.51,.025,.02,.028,'ink')
    box(0,0,.95,.54,.38,.72,'lilac')
    for x in [-.34,.34]:
        obj=box(x,0,.97,.16,.2,.62,'lilac')
        obj.rotation_euler[1]=math.copysign(.12,x)
        ball(x,-.01,.64,.09,.1,.1,'cream')
    for x in [-.16,.16]:
        if seated:
            box(x,-.15,.55,.2,.55,.2,'plum')
            box(x,-.36,.29,.2,.2,.48,'plum')
        else:
            box(x,0,.38,.2,.23,.65,'plum')
        box(x,-.12 if not seated else -.44,.09,.23,.35,.16,'white')
    for obj in set(bpy.data.objects)-before:
        obj.location*=size
        obj.scale*=size


def house(tower=False, warehouse=False):
    w=1.25 if warehouse else 1.05
    h=1.45 if tower else .85
    box(0,0,h/2+.1,w,.8,h,'cream')
    if tower or warehouse:
        box(0,0,h+.14,w+.1,.88,.12,'lilac')
    else:
        for x,angle in [(-.31,-.6),(.31,.6)]:
            obj=box(x,0,1.13,.78,1,.12,'rose')
            obj.rotation_euler[1]=angle
    box(0,-.415,.38,.26,.045,.55,'wood')
    if warehouse:
        box(.05,-.43,.45,.75,.04,.62,'silver')
        for z in [.22,.36,.5,.64]: box(.05,-.46,z,.72,.02,.02,'white')
    else:
        for x in [-.31,.31]:
            for z in ([.4,.9,1.3] if tower else [.65]):
                box(x,-.42,z,.23,.03,.24,'blue',.025)
                box(x,-.445,z,.02,.02,.24,'white',0)


def book(opened=False):
    if opened:
        for x,angle in [(-.35,-.12),(.35,.12)]:
            obj=box(x,0,.27,.7,.8,.12,'white')
            obj.rotation_euler[1]=angle
            for y in [-.2,0,.2]: box(x,y,.35,.4,.025,.015,'silver',0)
    else:
        box(0,0,.65,.85,.18,1.15,'rose')
        box(.04,-.105,.65,.68,.03,1.04,'white')
        box(-.39,-.12,.65,.08,.05,1.16,'plum')


def bag(kind='case'):
    box(0,0,.62,1,.48,.8,'rose')
    curve([(-.22,0,1.04),(-.22,0,1.28),(.22,0,1.28),(.22,0,1.04)],.055,'plum')
    if kind=='medical': cross(0,-.27,.62,'white')
    elif kind=='backpack':
        box(0,-.29,.46,.7,.16,.38,'pink')
        box(0,-.39,.59,.6,.04,.03,'gold')
    else:
        box(0,-.27,.67,1.02,.04,.07,'gold')
        box(0,-.31,.66,.13,.05,.18,'gold')


def camera(video=False):
    box(0,0,.65,1.1,.5,.68,'lilac')
    cylinder(.09,-.38,.65,.28,.3,'plum',(math.pi/2,0,0))
    cylinder(.09,-.55,.65,.2,.07,'blue',(math.pi/2,0,0))
    box(-.28,0,1.02,.3,.4,.15,'silver')
    if video:
        for x in [-.3,.3]: cylinder(x,0,1.22,.25,.2,'plum',(math.pi/2,0,0))
    else: box(.37,-.27,.84,.18,.04,.1,'white')


def screen(laptop=False, atm=False):
    box(0,0,.9,1.12,.16,.85,'lilac')
    box(0,-.095,.91,.96,.035,.65,'blue')
    if laptop: box(0,-.37,.42,1.2,.85,.08,'silver')
    elif atm:
        box(0,.05,.55,1,.6,1.1,'cream')
        box(0,-.29,.9,.6,.03,.36,'blue')
        box(0,-.33,.49,.5,.04,.07,'plum')
        box(.12,-.38,.48,.33,.22,.015,'white')
    else:
        box(0,0,.4,.12,.12,.45,'silver')
        box(0,-.02,.16,.65,.4,.07,'silver')


def car(truck=False,bus=False):
    w,d=1.35, .72
    box(0,0,.45,w,d,.4,'rose')
    if truck:
        box(-.4,0,.79,.5,.68,.52,'pink')
        box(.4,0,.9,.95,.78,.85,'cream')
        box(-.67,-.03,.87,.035,.46,.25,'blue')
    elif bus:
        box(0,0,.87,1.45,.75,.8,'lilac')
        for x in [-.48,-.15,.18,.5]: box(x,-.39,1.02,.26,.035,.3,'blue')
    else:
        box(0,0,.81,.8,.66,.42,'pink')
        for x in [-.23,.23]: box(x,-.34,.84,.34,.035,.25,'blue')
    for x in [-.45,.45]:
        for y in [-.38,.38]:
            cylinder(x,y,.29,.21,.13,'ink',(math.pi/2,0,0))
            cylinder(x,y*1.18,.29,.11,.035,'silver',(math.pi/2,0,0))


def chair(wheel=False):
    box(0,0,.65,.7,.65,.16,'lilac')
    box(0,.27,1,.7,.12,.65,'lilac')
    for x in [-.34,.34]:
        box(x,0,.85,.08,.7,.09,'silver')
        if wheel:
            ring(x,.09,.43,.42,'silver',(0,math.pi/2,0),.045)
            cylinder(x,.09,.43,.06,.07,'silver',(0,math.pi/2,0))
            cylinder(x,-.4,.17,.14,.08,'ink',(0,math.pi/2,0))
        else:
            for y in [-.25,.25]: box(x,y,.32,.09,.09,.6,'wood')


def flower(lily=False):
    cylinder(0,0,.23,.33,.4,'cream')
    for x,y,z in [(-.22,0,1),(0,.1,1.25),(.25,0,1.08)]:
        curve([(0,0,.35),(x/2,y/2,.65),(x,y,z)],.022,'silver' if lily else 'wood')
        for i in range(5):
            a=i*math.tau/5
            ball(x+.14*math.cos(a),y+.14*math.sin(a),z,.14,.12,.08,'white' if lily else 'pink')
        ball(x,y,z+.04,.08,.08,.06,'gold')


def magnifier():
    ring(0,0,1,.38,'gold',tube=.065)
    obj=box(.34,0,.47,.14,.16,.6,'rose')
    obj.rotation_euler[1]=-.65


def paper(sealed=False):
    box(0,0,.78,.86,.09,1.2,'white')
    for z,w in [(1.15,.5),(.95,.6),(.76,.6),(.57,.35)]: box(-.04,-.06,z,w,.025,.035,'lilac',.005)
    if sealed:
        cylinder(.23,-.09,.4,.17,.045,'gold',(math.pi/2,0,0))
        for x in [.16,.29]: box(x,-.07,.2,.1,.03,.25,'rose')


def model(name):
    if name in ('dog','cat'): dog(name=='cat')
    elif name in ('adult','child','seated'): person(name=='child',name=='seated')
    elif name in ('house','tower','warehouse'): house(name=='tower',name=='warehouse')
    elif name in ('book','open-book'): book(name=='open-book')
    elif name in ('case','medical','backpack'): bag(name)
    elif name=='bag':
        box(0,0,.6,.85,.4,.95,'pink')
        for y in [-.18,.18]: curve([(-.22,y,1),(-.22,y,1.4),(.22,y,1.4),(.22,y,1)],.04,'rose')
    elif name=='carrier':
        box(0,0,.55,1.15,.75,.85,'cream')
        box(0,-.4,.55,.85,.055,.65,'lilac')
        for x in [-.3,-.15,0,.15,.3]: box(x,-.44,.55,.025,.025,.55,'silver')
        curve([(-.2,0,1),(-.2,0,1.22),(.2,0,1.22),(.2,0,1)],.045,'rose')
    elif name in ('camera','video'): camera(name=='video')
    elif name in ('screen','laptop','atm'): screen(name=='laptop',name=='atm')
    elif name in ('car','truck','bus'): car(name=='truck',name=='bus')
    elif name in ('chair','wheelchair'): chair(name=='wheelchair')
    elif name in ('flower','lily'): flower(name=='lily')
    elif name=='magnifier': magnifier()
    elif name in ('paper','certificate'): paper(name=='certificate')
    elif name=='heart': heart(0,0,.8)
    elif name=='paw': paw(0,0,.65)
    elif name=='cross': cross(0,0,.8)
    elif name=='parcel':
        box(0,0,.55,1,.85,1,'wood')
        box(0,-.44,.56,.16,.025,1,'cream')
        box(0,0,1.06,.16,.88,.025,'cream')
        box(.25,-.46,.7,.28,.025,.21,'white')
    elif name=='key':
        ring(-.25,0,1,.26,'gold',tube=.075)
        box(.16,0,.66,.14,.15,.8,'gold')
        box(.3,0,.35,.28,.15,.13,'gold')
        box(.3,0,.55,.28,.15,.13,'gold')
    elif name=='clock':
        cylinder(0,0,.8,.55,.2,'rose',(math.pi/2,0,0))
        cylinder(0,-.12,.8,.46,.04,'white',(math.pi/2,0,0))
        box(0,-.16,.96,.035,.03,.34,'plum')
        box(.13,-.17,.8,.28,.03,.035,'plum')
    elif name=='bed':
        box(0,0,.37,1.15,1.3,.22,'wood')
        box(0,0,.55,1.1,1.22,.2,'white')
        box(0,-.2,.69,1.1,.8,.16,'lilac')
        box(0,.7,.7,1.2,.15,.92,'rose')
        for x in [-.28,.28]: box(x,.43,.72,.46,.35,.14,'white')
    elif name in ('crib','bath'):
        box(0,0,.46,1.2,.78,.48,'cream')
        box(0,0,.74,1.02,.61,.08,'blue' if name=='bath' else 'pink')
        if name=='crib':
            for x in [-.52,-.26,0,.26,.52]: box(x,-.4,.85,.06,.06,.65,'wood')
            box(0,-.4,1.15,1.2,.08,.07,'wood')
            for x in [-.5,.5]: box(x,.3,.2,.09,.09,.4,'wood')
        else:
            for x,y,z,r in [(-.25,.05,1,.11),(.15,.1,1.17,.08),(.35,-.1,.93,.09)]: ball(x,y,z,r,color='white')
    elif name=='bottle':
        cylinder(0,0,.57,.27,.85,'cream')
        cylinder(0,0,1.04,.28,.14,'rose')
        ball(0,0,1.17,.13,.13,.16,'gold')
        for z in [.4,.6,.8]: box(.12,-.25,z,.1,.025,.025,'rose')
    elif name in ('cosmetic','water'):
        cylinder(0,0,.6,.27,.95,'pink' if name=='cosmetic' else 'blue')
        cylinder(0,0,1.12,.16,.15,'rose' if name=='cosmetic' else 'lilac')
        if name=='cosmetic':
            box(.1,0,1.27,.45,.13,.09,'gold')
            box(.3,0,1.2,.1,.13,.18,'gold')
        else: ring(0,0,1.25,.13,'plum',(math.pi/2,0,0),.025)
        box(0,-.28,.64,.25,.025,.28,'white')
    elif name=='epilator':
        box(0,0,.65,.37,.27,1.1,'pink',.12)
        box(0,0,1.22,.6,.3,.22,'silver')
        box(0,-.16,1.23,.48,.025,.1,'plum')
        ball(0,-.15,.7,.07,.025,.09,'white')
    elif name=='faucet':
        curve([(-.28,0,.15),(-.28,0,.8),(-.25,0,1.2),(.3,0,1.2),(.36,0,1)],.095,'silver')
        cylinder(-.28,0,.1,.23,.1,'silver')
        box(-.28,0,.85,.6,.12,.08,'rose')
        ball(.36,0,.71,.075,.075,.13,'blue')
    elif name=='cake':
        cylinder(0,0,.45,.55,.5,'pink')
        cylinder(0,0,.73,.56,.09,'white')
        for x in [-.25,0,.25]:
            cylinder(x,0,.94,.035,.34,'lilac')
            ball(x,0,1.17,.045,.045,.1,'gold')
    elif name=='slide':
        for x in [-.38,.38]: box(x,.2,.68,.12,.12,1.3,'wood')
        box(0,.2,1.28,.9,.6,.12,'lilac')
        obj=box(0,-.45,.8,.72,1.5,.11,'rose')
        obj.rotation_euler[0]=.65
        for x in [-.4,.4]:
            obj=box(x,-.45,.91,.08,1.5,.2,'pink')
            obj.rotation_euler[0]=.65
    elif name=='blocks':
        for x,y,z,s,c in [(-.35,0,.3,.5,'pink'),(.26,-.2,.3,.5,'lilac'),(0,.15,.8,.55,'cream')]: box(x,y,z,s,s,s,c)
        ball(.25,.05,1.23,.23,color='rose')
    elif name=='pool':
        ring(0,0,.36,.62,'lilac',(0,0,0),.15)
        cylinder(0,0,.3,.59,.13,'blue')
        ring(.15,.02,.58,.24,'pink',(0,0,0),.075)
    elif name=='tent':
        for x,angle in [(-.32,-.57),(.32,.57)]:
            obj=box(x,0,.78,.95,1.05,.12,'lilac')
            obj.rotation_euler[1]=angle
        box(0,0,.16,1.3,1.2,.1,'cream')
    elif name=='bowls':
        for x,c in [(-.36,'rose'),(.36,'lilac')]:
            cylinder(x,0,.25,.35,.32,c)
            cylinder(x,0,.42,.29,.035,'cream')
            for dx,dy in [(-.1,0),(.08,.12),(.12,-.13)]: ball(x+dx,dy,.46,.07,.07,.035,'brown')
    elif name=='comb':
        box(0,0,.9,.85,.2,.48,'rose')
        box(0,0,.37,.17,.17,.7,'plum')
        for x in [-.32,-.16,0,.16,.32]: box(x,-.2,.9,.045,.3,.05,'silver')
    elif name=='scissors':
        for x,angle in [(-.16,-.3),(.16,.3)]:
            ring(x,0,.35,.19,'rose',tube=.055)
            obj=box(-x,0,.95,.12,.09,.9,'silver')
            obj.rotation_euler[1]=angle
        cylinder(0,-.07,.65,.07,.04,'gold',(math.pi/2,0,0))
    elif name=='syringe':
        cylinder(0,0,.72,.12,.7,'white')
        cylinder(0,0,1.17,.05,.25,'silver')
        box(0,0,1.31,.35,.13,.07,'rose')
        cylinder(0,0,.2,.02,.36,'silver')
        box(0,0,.36,.35,.13,.06,'lilac')
    elif name=='lens':
        for x in [-.3,.3]: ring(x,0,.7,.25,'plum',tube=.04)
        curve([(-.05,0,.72),(0,0,.76),(.05,0,.72)],.03,'plum')
        for x in [-.55,.55]: curve([(x,0,.75),(x,.45,.8),(x*.85,.6,.75)],.03,'plum')
    elif name=='tooth':
        ball(0,0,1,.4,.3,.4,'white')
        for x in [-.22,.22]: ball(x,0,.58,.16,.2,.49,'white')
    elif name=='shield':
        obj=ball(0,0,.8,.55,.12,.67,'lilac')
        heart(0,-.15,.9,'white')
    elif name=='tools':
        box(-.2,0,.66,.13,.15,1.1,'rose')
        ring(-.2,0,1.25,.2,'silver',tube=.08)
        box(.23,0,.66,.15,.15,.95,'wood')
        box(.23,0,1.17,.58,.23,.25,'silver')
    elif name=='brush':
        box(0,0,.45,.18,.16,.7,'wood')
        box(0,0,.85,.5,.22,.24,'silver')
        box(0,0,1.12,.5,.2,.32,'cream')
    elif name=='palette':
        ball(0,0,.75,.55,.12,.45,'cream')
        for x,z,c in [(-.28,.8,'rose'),(-.1,1,'lilac'),(.17,1,'blue'),(.32,.75,'gold')]: ball(x,-.14,z,.085,.025,.085,c)
    elif name=='lipstick':
        cylinder(0,0,.4,.22,.65,'plum')
        cylinder(0,0,.85,.19,.25,'gold')
        cylinder(0,0,1.1,.14,.38,'rose')
    elif name=='balloon':
        for x,z,c in [(-.26,1,'pink'),(.25,1.2,'lilac')]:
            ball(x,0,z,.25,.2,.33,c)
            curve([(x,0,z-.3),(x*.7,0,.4),(0,0,.05)],.012,'silver')
    elif name=='game':
        box(0,0,.67,1.2,.45,.56,'plum')
        cross(-.33,-.25,.7,'lilac')
        for x,z in [(.3,.8),(.43,.66),(.16,.66),(.3,.52)]: ball(x,-.25,z,.055,.03,.055,'pink')
    elif name=='passport':
        box(0,0,.75,.88,.15,1.25,'plum')
        ring(0,-.09,.83,.25,'gold',tube=.02)
        curve([(-.25,-.1,.83),(0,-.1,.88),(.25,-.1,.83)],.014,'gold')
        box(0,-.1,.35,.45,.025,.035,'gold')
    elif name=='plane':
        ball(0,0,.7,.15,.85,.16,'white')
        obj=box(0,-.08,.7,1.6,.28,.06,'lilac')
        obj.rotation_euler[2]=.2
        box(0,.58,.76,.63,.2,.06,'rose')
        obj=box(0,.57,.95,.05,.3,.4,'rose')
        obj.rotation_euler[0]=-.3
    elif name=='globe':
        ball(0,0,.92,.48,color='blue')
        for angle in [0,math.pi/3,math.pi*2/3]: ring(0,0,.92,.485,'white',(math.pi/2,0,angle),.012)
        for dz,radius in [(-.24,.42),(0,.485),(.24,.42)]: ring(0,0,.92+dz,radius,'white',(0,0,0),.012)
        ring(0,0,.92,.54,'gold',rotation=(1.5,.3,.4),tube=.027)
        box(0,0,.3,.1,.1,.5,'silver')
        cylinder(0,0,.1,.35,.1,'cream')
    elif name=='curtain':
        box(0,0,1.5,1.4,.12,.1,'gold')
        for x in [-.5,-.3,.3,.5]:
            obj=cylinder(x,0,.85,.16,1.3,'lilac')
            obj.scale.y=.5
    elif name=='sofa':
        box(0,.18,.77,1.3,.25,.85,'lilac')
        box(0,-.1,.5,1.3,.7,.25,'pink')
        for x in [-.66,.66]: box(x,0,.65,.23,.85,.5,'lilac')
        for x in [-.5,.5]: box(x,0,.2,.12,.12,.35,'wood')
    elif name=='locker':
        box(0,0,.85,1.2,.5,1.5,'lilac')
        for x in [-.37,0,.37]:
            for z in [.35,.8,1.25]:
                box(x,-.27,z,.31,.035,.38,'cream')
                box(x+.08,-.3,z,.03,.02,.1,'plum')
    elif name=='plant':
        cylinder(0,0,.25,.3,.45,'wood')
        curve([(0,0,.4),(0,0,.9),(.1,0,1.5)],.035,'plum')
        for x,z,a in [(-.2,.8,-.8),(.22,1.05,.8),(-.14,1.3,-.6)]:
            obj=ball(x,0,z,.15,.06,.3,'lilac')
            obj.rotation_euler[1]=a
    elif name=='grain':
        for x in [-.22,0,.22]:
            curve([(x,0,.05),(x,0,.8),(x+.1,0,1.4)],.025,'wood')
            for z in [.8,1,1.2]:
                for side in [-1,1]:
                    obj=ball(x+side*.1,0,z,.065,.06,.15,'gold')
                    obj.rotation_euler[1]=side*.6
    elif name=='tractor':
        box(0,0,.55,1.2,.6,.5,'lilac')
        box(.3,0,.96,.5,.6,.7,'cream')
        box(.3,-.32,1.06,.35,.035,.3,'blue')
        for x,r in [(-.45,.23),(.4,.36)]:
            for y in [-.36,.36]: cylinder(x,y,r,r,.15,'ink',(math.pi/2,0,0))
        cylinder(-.3,.1,1,.04,.55,'silver')
    elif name=='ring':
        ring(0,0,.55,.4,'gold',tube=.07)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.22, location=(0,0,1.08))
        finish(bpy.context.object,'white')
    elif name=='envelope':
        box(0,0,.7,1.2,.12,.85,'pink')
        curve([(-.55,-.08,1.08),(0,-.09,.7),(.55,-.08,1.08)],.022,'white')
    elif name=='mic':
        ball(0,0,1.25,.25,.22,.3,'silver')
        cylinder(0,0,.72,.11,.85,'plum')
        cylinder(0,0,.19,.33,.1,'rose')
    elif name=='headset':
        curve([(-.5,0,.6),(-.5,0,1.1),(0,0,1.5),(.5,0,1.1),(.5,0,.6)],.075,'lilac')
        for x in [-.5,.5]: box(x,0,.65,.22,.3,.48,'rose')
        curve([(.5,-.1,.65),(.4,-.45,.4),(0,-.45,.4)],.03,'silver')
    elif name=='dumbbell':
        cylinder(0,0,.65,.08,1.1,'silver',(0,math.pi/2,0))
        for x in [-.45,.45]: cylinder(x,0,.65,.35,.22,'plum',(0,math.pi/2,0))
    elif name=='racket':
        ring(0,0,1.05,.38,'rose',tube=.04)
        box(0,0,.36,.09,.12,.65,'plum')
        for v in [-.2,0,.2]:
            length=math.sqrt(.35**2-v**2)
            box(v,0,1.05,.012,.015,length*2,'cream',0)
            box(0,0,1.05+v,length*2,.015,.012,'cream',0)
    elif name=='ball': ball(0,0,.55,.48,color='lilac')
    elif name=='mat':
        box(0,0,.15,1.4,.8,.12,'lilac')
        cylinder(.6,0,.28,.22,.8,'rose',(math.pi/2,0,0))
    elif name=='torch':
        cylinder(0,0,.4,.16,.7,'silver')
        cylinder(0,0,.85,.29,.26,'rose')
        cylinder(0,0,1,.24,.035,'gold')
    elif name=='bike':
        for x in [-.48,.48]: ring(x,0,.4,.32,'plum',tube=.04)
        curve([(-.48,0,.4),(-.1,0,.95),(.13,0,.4),(-.48,0,.4)],.04,'rose')
        curve([(-.1,0,.95),(.35,0,.93),(.48,0,.4),(.13,0,.4),(.35,0,.93)],.04,'rose')
        box(-.1,0,1,.33,.18,.07,'plum')
    else:
        raise ValueError('Missing authored model '+name)


def place(name,position,scale=1,rotation=0):
    before=set(bpy.data.objects)
    model(name)
    for obj in set(bpy.data.objects)-before:
        root=bpy.data.objects.new('placement',None)
        bpy.context.collection.objects.link(root)
        obj.parent=root
        root.location=position
        root.scale=(scale,scale,scale)
        root.rotation_euler[2]=rotation


def setup():
    scene=bpy.context.scene
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.resolution_x=scene.render.resolution_y=256
    scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.color_mode='RGBA'
    scene.world.color=(.7,.7,.7)
    scene.view_settings.view_transform='AgX'
    scene.view_settings.look='AgX - Medium High Contrast'
    scene.view_settings.exposure=.65
    bpy.ops.object.camera_add(location=(3.2,-5.5,3.4))
    camera=bpy.context.object
    camera.name='studio camera'
    camera.rotation_euler=(Vector((0,0,.72))-camera.location).to_track_quat('-Z','Y').to_euler()
    camera.data.type='ORTHO'
    camera.data.ortho_scale=2.8
    scene.camera=camera
    for name,position,power,size in [('key',(-3,-4,6),420,4),('fill',(4,-1,3),180,3),('rim',(1,4,4),250,3)]:
        bpy.ops.object.light_add(type='AREA',location=position)
        light=bpy.context.object
        light.name=name
        light.data.energy=power
        light.data.shape='DISK'
        light.data.size=size
        light.rotation_euler=(Vector((0,0,.6))-light.location).to_track_quat('-Z','Y').to_euler()


def frame_subject():
    bpy.context.view_layer.update()
    camera=bpy.context.scene.camera
    inverse=camera.matrix_world.inverted()
    corners=[inverse@(obj.matrix_world@Vector(corner))
             for obj in bpy.data.objects if obj.type in ('MESH','CURVE')
             for corner in obj.bound_box]
    left,right=min(p.x for p in corners),max(p.x for p in corners)
    bottom,top=min(p.y for p in corners),max(p.y for p in corners)
    camera.location+=camera.rotation_euler.to_matrix()@Vector(((left+right)/2,(bottom+top)/2,0))
    camera.data.ortho_scale=max(right-left,top-bottom)*1.18


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--specs',required=True)
    parser.add_argument('--out',required=True)
    parser.add_argument('--ids',nargs='*')
    args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    setup()
    permanent=set(bpy.data.objects)
    output=Path(args.out)
    output.mkdir(parents=True,exist_ok=True)
    specs=json.loads(Path(args.specs).read_text(encoding='utf-8'))
    for spec in specs:
        if args.ids and spec['id'] not in args.ids: continue
        for obj in list(bpy.data.objects):
            if obj not in permanent: bpy.data.objects.remove(obj,do_unlink=True)
        for part in spec['parts']:
            place(part['model'],part.get('position',[0,0,0]),part.get('scale',1),part.get('rotation',0))
        if spec['id'].startswith('C23') or spec['id']=='C21G03S03':
            for mat in bpy.data.materials:
                if not mat.node_tree or not mat.node_tree.nodes.get('Principled BSDF'): continue
                rgb=mat.diffuse_color[:3]
                lum=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]
                mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(lum,lum,lum,1)
        else:
            for mat in bpy.data.materials:
                if not mat.node_tree or not mat.node_tree.nodes.get('Principled BSDF'): continue
                mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=mat.diffuse_color
        frame_subject()
        bpy.context.scene.render.filepath=str(output/(spec['id']+'.png'))
        bpy.ops.render.render(write_still=True)
        print('RENDERED '+spec['id'],flush=True)


if __name__=='__main__': main()
