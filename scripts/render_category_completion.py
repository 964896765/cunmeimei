"""Authored silhouettes for the remaining 176 categories, using the established studio rig."""
import importlib.util
import math
from pathlib import Path

spec = importlib.util.spec_from_file_location('category_studio', Path(__file__).with_name('render_category_scenes.py'))
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)
box, ball, cylinder, ring, curve = studio.box, studio.ball, studio.cylinder, studio.ring, studio.curve
original_model = studio.model


def signboard(kind='notice'):
    box(0, 0, .85, 1.2, .14, 1.1, 'wood')
    box(0, -.09, .85, 1.05, .035, .94, 'cream')
    for x in [-.45, .45]: box(x, 0, .25, .07, .1, .5, 'wood')
    for z, w in [(1.12, .65), (.91, .8), (.7, .65), (.5, .45)]: box(-.08, -.12, z, w, .025, .045, 'rose' if kind == 'news' else 'lilac')


def building(kind):
    wide = kind in ('mall', 'hospital', 'bank', 'memorial-hall')
    height = 1.65 if kind in ('hotel-tall', 'hotel-luxury') else 1.1
    width = 1.5 if wide else 1.1
    box(0, .08, height/2+.12, width, .75, height, 'cream')
    box(0, -.32, .35, .3, .045, .5, 'rose')
    for x in [-width*.32, width*.32]:
        for z in ([.8, 1.22, 1.65] if height > 1.6 else [.8]): box(x, -.32, z, .22, .04, .25, 'blue')
    box(0, .08, height+.16, width+.12, .85, .12, 'lilac')
    if kind in ('shop', 'supermarket', 'mall'):
        for i in range(6): box(-width/2+(i+.5)*width/6, -.46, height*.8, width/6, .45, .16, 'rose' if i%2 else 'pink')
    elif kind in ('hospital', 'clinic'): studio.cross(0, -.37, height+.02)
    elif kind == 'bank':
        for x in [-.55, -.2, .2, .55]: cylinder(x, -.48, .65, .075, .95, 'white')
        roof = box(0, -.44, 1.35, 1.35, .3, .15, 'gold'); roof.rotation_euler[1] = 0
    elif kind == 'hotel-luxury':
        for x in [-.4, 0, .4]: ball(x, -.36, height+.32, .07, color='gold')
    elif kind == 'memorial-hall': studio.flower(True)


def sports_court(kind):
    box(0, 0, .08, 1.7, 1.25, .13, 'blue' if kind == 'swim-lanes' else 'lilac')
    for x in [-.75, .75]: box(x, 0, .16, .025, 1.12, .02, 'white')
    for y in [-.52, .52, 0]: box(0, y, .16, 1.5, .025, .02, 'white')
    if kind in ('tennis-court', 'pingpong'):
        box(0, 0, .43, .025, 1.2, .5, 'cream')
        for y in [-.6, .6]: cylinder(0, y, .43, .035, .6, 'silver')
    elif kind == 'basketball-court':
        cylinder(.55, .35, .8, .04, 1.35, 'silver'); box(.55, .3, 1.35, .6, .05, .45, 'white'); ring(.55, .05, 1.2, .16, 'rose', (0, 0, 0), .03)
    elif kind == 'football-court':
        for x in [-.75, .75]: curve([(x,-.35,.2),(x,-.35,.7),(x,.35,.7),(x,.35,.2)], .035, 'white')
    elif kind == 'swim-lanes':
        for y in [-.32, 0, .32]:
            for x in [-.6,-.3,0,.3,.6]: ball(x,y,.19,.06,color='cream')


def models(name):
    if name == 'dancer':
        ball(0,0,1.3,.17,.15,.2,'cream');box(0,0,.88,.3,.22,.5,'lilac')
        curve([(-.13,0,1.08),(-.48,0,1.35),(-.32,0,1.65)],.065,'cream');curve([(.13,0,1.08),(.5,0,1.25),(.65,0,1.5)],.065,'cream')
        curve([(-.08,0,.65),(-.2,0,.3),(-.35,0,.08)],.07,'rose');curve([(.08,0,.65),(.4,0,.75),(.55,0,.45)],.07,'rose')
        ball(-.4,0,.07,.18,.08,.07,'pink');ball(.59,0,.4,.12,.08,.08,'pink')
    elif name == 'motorcycle':
        for x in [-.6,.6]: ring(x,0,.35,.29,'plum',tube=.075);cylinder(x,0,.35,.15,.14,'silver',(math.pi/2,0,0))
        box(0,0,.6,.58,.36,.43,'silver');ball(.12,0,.95,.37,.24,.23,'rose');box(-.28,0,.94,.5,.32,.1,'plum')
        curve([(.6,0,.35),(.5,0,1.1),(.38,0,1.2)],.05,'silver');curve([(.3,-.2,1.2),(.38,0,1.2),(.3,.2,1.2)],.04,'plum');ball(.55,-.02,1.02,.12,.15,.13,'gold')
    elif name == 'wine':
        cylinder(0,0,.12,.32,.06,'silver');cylinder(0,0,.45,.04,.6,'silver');ball(0,0,.9,.32,.32,.34,'rose');ring(0,0,1.15,.27,'cream',(0,0,0),.025)
    elif name in ('fridge','kettle'):
        if name == 'fridge':
            box(0,0,.8,.8,.65,1.6,'cream');box(0,-.34,1.05,.76,.025,.025,'silver')
            for z in [.65,1.3]: box(.23,-.38,z,.045,.06,.3,'rose')
        else:
            ball(0,0,.6,.4,.32,.45,'cream');cylinder(0,0,1,.26,.08,'silver');ring(.4,0,.7,.25,'rose');curve([(-.3,0,.7),(-.6,0,.9)],.11,'silver')
    elif name == 'bulb':
        ball(0,0,.95,.35,.3,.4,'gold');cylinder(0,0,.5,.19,.27,'silver')
        for z in [.4,.48,.56]: ring(0,0,z,.2,'plum',(0,0,0),.018)
    elif name == 'memorial-stone':
        box(0,0,.16,1.15,.7,.22,'silver');box(0,.13,.8,.75,.25,1.15,'cream');ball(0,.13,1.33,.37,.125,.2,'cream')
        for z in [1.05,.85,.65]: box(0,-.01,z,.35,.02,.025,'silver')
    elif name == 'gallery':
        for x,z in [(-.42,.65),(.4,.95)]:
            box(x,0,z,.7,.13,1,'wood');box(x,-.08,z,.58,.03,.88,'cream');ball(x,-.11,z+.12,.18,.02,.18,'pink');box(x,-.11,z-.2,.4,.02,.1,'lilac')
    elif name == 'megaphone':
        studio.bpy.ops.mesh.primitive_cone_add(vertices=40,radius1=.38,radius2=.13,depth=.8,location=(0,0,.9),rotation=(0,math.pi/2,0));studio.finish(studio.bpy.context.object,'rose');box(.1,0,.4,.16,.2,.5,'plum');ring(-.4,0,.9,.36,'cream',(0,math.pi/2,0),.035)
    elif name in ('shop','mall','supermarket','bank','hospital','clinic','hotel-tall','hotel-small','hotel-luxury','memorial-hall'): building(name)
    elif name in ('notice','news','addressbook'): signboard(name)
    elif name in ('film','clapper'):
        box(0,0,.6,1.25,.15,.9,'plum')
        top=box(0,0,1.2,1.3,.18,.2,'silver');top.rotation_euler[1]=-.15
        for x in [-.45,-.15,.15,.45]: box(x,-.1,1.2,.13,.04,.2,'white')
        for x in [-.4,0,.4]: box(x,-.1,.57,.1,.035,.55,'cream')
    elif name in ('guitar','piano'):
        if name == 'guitar':
            ball(0,0,.47,.43,.13,.4,'wood');ball(0,0,.8,.3,.12,.28,'wood');box(0,0,1.2,.13,.15,.8,'brown');ring(0,-.15,.67,.12,'plum',tube=.025)
            for x in [-.04,0,.04]: box(x,-.17,1,.008,.008,1.05,'silver',0)
        else:
            box(0,0,.8,1.3,.55,.8,'plum');box(0,-.35,.65,1.35,.45,.12,'cream')
            for x in [-.5,-.3,-.1,.1,.3,.5]: box(x,-.34,.74,.08,.24,.05,'ink')
            for x in [-.5,.5]: box(x,0,.2,.09,.1,.45,'wood')
    elif name == 'billiards':
        box(0,0,.65,1.5,1,.18,'wood');box(0,0,.76,1.3,.8,.05,'lilac')
        for x in [-.55,.55]:
            for y in [-.35,.35]: box(x,y,.3,.08,.08,.6,'wood')
        for x,y,c in [(-.3,0,'rose'),(.1,.2,'white'),(.3,-.15,'gold')]: ball(x,y,.83,.075,color=c)
        stick=box(0,-.55,.85,1.7,.035,.035,'cream');stick.rotation_euler[2]=.3
    elif name in ('arcade','vr'):
        if name == 'arcade':
            box(0,0,.65,.8,.65,1.3,'rose');box(0,-.35,.95,.6,.04,.4,'ink');box(0,-.5,.62,.9,.4,.12,'lilac');cylinder(-.2,-.5,.79,.045,.25,'gold');ball(-.2,-.5,.94,.07,color='pink')
        else:
            box(0,0,.8,1.2,.6,.6,'cream');box(0,-.34,.8,1.05,.15,.42,'plum');curve([(-.55,0,.9),(-.5,.5,1),(0,.65,1),(.55,0,.9)],.08,'rose')
    elif name == 'mahjong':
        for x,z in [(-.42,.45),(0,.45),(.42,.45)]:
            box(x,0,z,.35,.2,.55,'cream');cylinder(x,-.12,z,.09,.025,'rose',(math.pi/2,0,0))
    elif name == 'teapot':
        ball(0,0,.6,.48,.35,.4,'cream');cylinder(0,0,.96,.3,.07,'rose');ball(0,0,1.04,.075,color='gold');ring(.48,0,.65,.25,'rose');curve([(-.3,0,.6),(-.65,0,.7),(-.72,0,.95)],.12,'cream')
    elif name in ('train','subway'):
        box(0,0,.65,1.6,.65,.75,'cream');box(0,-.34,.72,1.25,.035,.28,'blue')
        for x in [-.6,.6]:
            for y in [-.32,.32]: cylinder(x,y,.22,.15,.12,'plum',(math.pi/2,0,0))
        for x in [-.5,0,.5]: box(x,0,1.08,.3,.55,.05,'rose')
        for y in [-.23,.23]: box(0,y,.045,1.9,.04,.05,'silver')
    elif name in ('parking','signpost'):
        cylinder(0,0,.6,.05,1.2,'silver');box(0,0,1.17,1,.12,.65,'lilac')
        if name == 'parking':
            box(-.2,-.08,1.15,.08,.03,.45,'white');ring(-.04,-.08,1.3,.16,'white',tube=.045)
        else: curve([(-.3,-.09,1.2),(.3,-.09,1.2),(.16,-.09,1.35)],.035,'white')
    elif name in ('tire','gear'):
        ring(0,0,.65,.45,'plum' if name=='tire' else 'silver',tube=.15 if name=='tire' else .09)
        if name=='gear':
            for i in range(10):
                a=i*math.tau/10;o=box(.5*math.cos(a),0,.65+.5*math.sin(a),.18,.22,.18,'silver');o.rotation_euler[1]=-a
        else:
            for i in range(8):
                a=i*math.tau/8;box(.44*math.cos(a),-.12,.65+.44*math.sin(a),.09,.05,.09,'silver')
    elif name in ('charge','fuel','battery'):
        box(0,0,.6,.65,.5,1.1,'lilac');box(0,-.27,.86,.43,.035,.3,'blue')
        if name=='battery':
            for x in [-.2,.2]: box(x,0,1.2,.13,.18,.1,'silver')
        else:
            curve([(.3,0,.95),(.65,0,.85),(.7,0,.3),(.45,-.1,.4)],.045,'plum');box(.47,-.1,.51,.12,.16,.3,'rose')
        if name=='charge': curve([(.1,-.31,.95),(-.12,-.31,.65),(.1,-.31,.65),(-.1,-.31,.37)],.04,'gold')
    elif name in ('engine','printer'):
        box(0,0,.65,1.05,.65,.65,'silver' if name=='engine' else 'cream')
        if name=='engine':
            for x in [-.35,0,.35]: cylinder(x,0,1.03,.13,.27,'rose')
            cylinder(0,-.38,.65,.23,.1,'plum',(math.pi/2,0,0))
        else:
            box(0,0,1.08,.7,.1,.5,'white');box(0,-.43,.46,.8,.45,.05,'white');box(0,-.35,.74,.75,.03,.08,'plum')
    elif name in ('nail','eyelash','brow','razor','hairdryer'):
        if name=='nail':
            cylinder(-.2,0,.45,.2,.65,'rose');box(-.2,0,.98,.22,.22,.45,'plum');box(.3,0,.55,.18,.16,.95,'pink')
        elif name=='hairdryer':
            cylinder(0,0,.95,.32,.8,'rose',(0,math.pi/2,0));box(.1,0,.48,.18,.25,.6,'lilac');ring(-.42,0,.95,.25,'plum',(0,math.pi/2,0))
        elif name=='razor':
            box(0,0,.55,.22,.2,.8,'lilac');box(0,0,1,.6,.18,.18,'silver')
        else:
            curve([(-.55,0,.7),(-.25,0,.55),(.2,0,.55),(.55,0,.8)],.055,'plum')
            for x in [-.4,-.2,0,.2,.4]: curve([(x,0,.6),(x+.1,0,.9 if name=='eyelash' else .72)],.02,'plum')
    elif name in ('stones','meal','candy','urn','candle'):
        if name=='stones':
            for z,s in [(.2,.5),(.45,.4),(.68,.3)]: ball(0,0,z,s,s*.7,.13,'silver')
        elif name=='meal':
            box(0,0,.22,1.35,.9,.18,'cream');cylinder(-.33,0,.4,.28,.18,'white');cylinder(.35,0,.4,.26,.18,'rose');ball(-.33,0,.54,.23,.23,.09,'white');ball(.35,0,.54,.2,.2,.09,'gold')
        elif name=='candy':
            for x,y in [(-.3,0),(.3,.2),(0,-.3)]:
                ball(x,y,.6,.2,.15,.15,'pink');box(x-.25,y,.6,.15,.2,.2,'rose');box(x+.25,y,.6,.15,.2,.2,'rose')
        elif name=='urn': cylinder(0,0,.6,.42,.8,'cream');cylinder(0,0,1.05,.5,.12,'silver');ball(0,0,1.18,.12,color='silver')
        else: cylinder(0,0,.5,.24,.8,'cream');ball(0,0,1,.08,.06,.2,'gold')
    elif name in ('window','tiles','brick','niche'):
        for x in [-.4,0,.4]:
            for z in [.3,.7,1.1]: box(x,0,z,.36,.22,.36,'wood' if name=='brick' else 'cream')
        if name=='window':
            box(0,-.15,.7,1.35,.05,1.35,'blue');box(0,-.2,.7,.06,.04,1.35,'white');box(0,-.2,.7,1.35,.04,.06,'white')
        elif name=='niche':
            for x in [-.4,0,.4]:
                for z in [.3,.7,1.1]: cylinder(x,-.14,z,.035,.03,'silver',(math.pi/2,0,0))
    elif name in ('lamp','umbrella','sprinkler'):
        cylinder(0,0,.65,.04,1.2,'silver');cylinder(0,0,.09,.4,.09,'rose')
        if name=='lamp':
            studio.bpy.ops.mesh.primitive_cone_add(vertices=40,radius1=.5,radius2=.25,depth=.45,location=(0,0,1.2));studio.finish(studio.bpy.context.object,'cream')
        elif name=='umbrella':
            vertices=[(0,0,1.5)]+[(.7*math.cos(i*math.tau/12),.7*math.sin(i*math.tau/12),1.08 if i%2==0 else 1.16) for i in range(12)]
            mesh=studio.bpy.data.meshes.new('umbrella canopy');mesh.from_pydata(vertices,[],[(0,1+i,1+(i+1)%12) for i in range(12)]);canopy=studio.bpy.data.objects.new('canopy with scalloped edge',mesh);studio.bpy.context.collection.objects.link(canopy);studio.finish(canopy,'lilac')
            for i in range(0,12,2):
                a=i*math.tau/12;curve([(0,0,1.5),(.4*math.cos(a),.4*math.sin(a),1.32),(.7*math.cos(a),.7*math.sin(a),1.08)],.012,'cream')
            curve([(0,0,.2),(0,0,.05),(.2,0,.05),(.2,0,.25)],.05,'rose')
        else:
            for side in [-1,1]: curve([(0,0,1.1),(.35*side,0,1.4),(.7*side,0,.7)],.025,'blue')
    elif name in ('snowflake','scales','hoop','walker','arch'):
        if name=='snowflake':
            for i in range(6):
                a=i*math.tau/6;curve([(0,0,.75),(.6*math.cos(a),0,.75+.6*math.sin(a))],.035,'blue')
        elif name=='scales':
            cylinder(0,0,.65,.04,1.2,'gold');box(0,0,.08,.75,.4,.1,'wood');box(0,0,1.2,1.1,.04,.05,'gold')
            for x in [-.45,.45]: curve([(x,0,1.2),(x,0,.7)],.02,'gold');cylinder(x,0,.68,.25,.06,'rose')
        elif name in ('walker','arch'):
            curve([(-.55,0,.1),(-.55,0,1.25),(0,0,1.5),(.55,0,1.25),(.55,0,.1)],.07,'cream' if name=='arch' else 'silver')
            if name=='walker':
                for x in [-.55,.55]:
                    for y in [-.3,.3]:
                        cylinder(x,y,.5,.035,.8,'silver');ring(x,y,.12,.1,'plum',tube=.035)
                    box(x,0,.93,.09,.8,.08,'rose')
                box(0,.3,.65,1.1,.05,.05,'silver')
            else:
                for x,z in [(-.5,1.2),(-.35,1.43),(.5,1.2),(.35,1.43)]: ball(x,-.05,z,.13,color='pink')
        else: ring(0,0,.8,.6,'lilac',tube=.05)
    elif name in ('idcard','calculator','phone','ticket','blueprint','code'):
        box(0,0,.8,.9,.16,1.25,'cream' if name in ('idcard','blueprint','ticket') else 'plum')
        if name=='idcard':
            ball(-.22,-.11,1.04,.12,color='rose');box(-.22,-.11,.8,.25,.04,.2,'lilac')
            for z in [.85,.65,.45]: box(.16,-.11,z,.3,.03,.035,'silver')
        elif name=='calculator':
            box(0,-.1,1.15,.65,.03,.25,'blue')
            for x in [-.22,0,.22]:
                for z in [.35,.55,.75]: box(x,-.11,z,.14,.03,.12,'pink')
        elif name=='phone': box(0,-.1,.83,.73,.035,1,'blue');cylinder(0,-.12,.25,.045,.02,'gold',(math.pi/2,0,0))
        else:
            for z,w in [(1.2,.6),(.95,.4),(.7,.65),(.45,.45)]: box(0,-.1,z,w,.025,.045,'lilac')
    elif name in ('boxing','climbing','dress','shoe','mountain','boat','fish','cow'):
        if name=='boxing':
            for x in [-.3,.3]: ball(x,0,.8,.25,.3,.33,'rose');box(x,0,.4,.28,.3,.27,'lilac')
        elif name=='climbing':
            box(0,.05,.8,1.15,.18,1.6,'cream')
            for x,z,c in [(-.3,.3,'rose'),(.25,.6,'lilac'),(-.2,.95,'gold'),(.3,1.3,'pink')]: ball(x,-.1,z,.12,.06,.08,c)
        elif name=='dress':
            studio.bpy.ops.mesh.primitive_cone_add(vertices=40,radius1=.65,radius2=.18,depth=.85,location=(0,0,.5));studio.finish(studio.bpy.context.object,'pink');box(0,0,1.05,.4,.25,.5,'cream')
        elif name=='shoe': ball(0,0,.35,.6,.3,.25,'cream');box(-.3,0,.6,.4,.45,.35,'rose');box(0,0,.12,1.2,.63,.1,'lilac')
        elif name=='mountain':
            for x,z,s in [(-.35,.65,.6),(.3,.9,.65)]:
                studio.bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=s,depth=z*2,location=(x,0,z));studio.finish(studio.bpy.context.object,'lilac' if x<0 else 'blue')
        elif name=='boat':
            vertices=[(-.65,-.3,.5),(.6,-.3,.5),(.95,0,.5),(.6,.3,.5),(-.65,.3,.5),(-.5,-.17,.15),(.6,0,.15),(-.5,.17,.15)]
            mesh=studio.bpy.data.meshes.new('tapered boat hull');mesh.from_pydata(vertices,[],[(0,1,2,3,4),(0,5,6,1),(1,6,2),(2,6,3),(3,6,7,4),(4,7,5,0),(5,7,6)]);hull=studio.bpy.data.objects.new('hull',mesh);studio.bpy.context.collection.objects.link(hull);studio.finish(hull,'cream');box(-.1,0,.71,.65,.5,.42,'lilac');cylinder(-.1,0,1.1,.025,.5,'silver');curve([(-.8,-.3,.05),(0,-.4,.1),(.8,-.3,.05)],.035,'blue')
        elif name=='fish': ball(0,0,.7,.55,.18,.3,'blue');ball(-.65,0,.7,.2,.08,.3,'lilac');ball(.33,-.16,.78,.04,color='ink')
        else:
            ball(0,0,.65,.55,.28,.3,'cream');ball(.45,-.1,.85,.25,.2,.3,'cream')
            for x in [-.35,.35]:
                for y in [-.2,.2]: box(x,y,.25,.1,.1,.5,'brown')
            ball(.56,-.22,.7,.23,.13,.14,'pink')
            for x in [.3,.6]:
                ball(x,-.28,.95,.035,color='ink');ball(x,-.04,1.1,.12,.1,.05,'brown')
                curve([(x,-.04,1.13),(x,-.04,1.27),(x-.08,-.04,1.3)],.035,'gold')
            ball(-.15,-.26,.72,.16,.035,.13,'brown');curve([(-.5,.05,.85),(-.72,.05,.7),(-.72,.05,.45)],.035,'brown')
    elif name in ('swim-lanes','basketball-court','football-court','tennis-court','pingpong'): sports_court(name)
    else: original_model(name)


studio.model = models
if __name__ == '__main__': studio.main()
