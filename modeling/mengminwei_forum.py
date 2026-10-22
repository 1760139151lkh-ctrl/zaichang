"""Authored interior craft for the circular Meng Minwei forum, not an as-built survey."""
import math
from architecture_primitives import *
CX,CY=44.7,633

def sector(r0,r1,a0,a1):
    n=max(2,math.ceil(abs(a1-a0)*48))
    angles=[a0+(a1-a0)*j/n for j in range(n+1)]
    return Polygon([(CX+r1*math.cos(a),CY+r1*math.sin(a)) for a in angles]+[(CX+r0*math.cos(a),CY+r0*math.sin(a)) for a in reversed(angles)])

# Broad curved flights have real risers and a continuous supporting waist.
# An intermediate landing interrupts each flight rather than presenting a 40-step run.
STAIRS=[]
for base,top,count in [(.15,4.5,29),(4.5,10.7,40)]:
    start=math.radians(-120);step=.32/22.5;landing_angle=1.5/22.5
    rise=(top-base)/count;half=count//2
    angles=[start+j*step+(landing_angle if j>=half else 0) for j in range(count+1)]
    STAIRS.append((base,top,count,start,step,landing_angle,rise,half,angles))

def gallery_geometry(z,circle):
    floor=circle.difference(Point(CX,CY).buffer(19,quad_segs=64))
    for base,top,count,start,step,landing_angle,rise,half,angles in STAIRS:
        if abs(z-top)>.01:continue
        # Only the upper part needs a floor opening. Keep a real landing at the lower start.
        first=max(0,math.floor((top-2.35-base)/rise))
        floor=floor.difference(sector(20.75,24.25,angles[first]-.01,angles[-1]))
    return floor

def build_forum():
    # Shallow radial roof trusses meet the existing perimeter columns and a closed hub.
    for j in range(24):
        a=j*math.tau/24
        radial=lambda r,z:(CX+r*math.cos(a),CY+r*math.sin(a),z)
        beam('Forum roof upper chords','Meng white',radial(3,16.48),radial(26.8,16.48),.11,sides=8)
        beam('Forum roof lower chords','Meng white',radial(3,15.20),radial(26.8,15.20),.10,sides=8)
        for k in range(7):
            r0=3+k*3.4;r1=min(26.8,r0+3.4)
            beam('Forum roof triangulated webs','Meng frame',radial(r0,15.20 if k%2 else 16.48),radial(r1,16.48 if k%2 else 15.20),.055,sides=6)
    slab('Forum structural roof hub','Meng white',Point(CX,CY).buffer(3.12,quad_segs=48).difference(Point(CX,CY).buffer(2.85,quad_segs=48)),15.1,1.55)
    for j in range(96):
        a=j*math.tau/96;b=(j+1)*math.tau/96
        beam('Forum lower perimeter chord','Meng white',(CX+26.8*math.cos(a),CY+26.8*math.sin(a),15.2),(CX+26.8*math.cos(b),CY+26.8*math.sin(b),15.2),.11,sides=8)
    for base,top,count,start,step,landing_angle,rise,half,angles in STAIRS:
        for j in range(count):
            a0=angles[j];a1=angles[j+1]
            if j==half-1:a1-=landing_angle
            slab('Forum curved stair treads','Meng white',sector(21,24,a0,a1),base+j*rise-.18,rise+.18)
            # Thin warm wood nosing is not an extra step.
            slab('Forum stair tread inserts','wood',sector(21.08,23.92,a0+.001,min(a1,a0+.055/22.5)),base+(j+1)*rise+.002)
            for r in [21.05,23.95]:
                beam('Forum stair handrails','Meng frame',(CX+r*math.cos(a0),CY+r*math.sin(a0),base+j*rise+1.1),(CX+r*math.cos(a1),CY+r*math.sin(a1),base+(j+1)*rise+1.1),.035,sides=6)
                beam('Forum stair balusters','Meng frame',(CX+r*math.cos(a0),CY+r*math.sin(a0),base+j*rise),(CX+r*math.cos(a0),CY+r*math.sin(a0),base+j*rise+1.1),.022,sides=6)
            for r in [21.05,23.95]:
                for k in [1,2]:
                    a=a0+(a1-a0)*k/3;z=base+j*rise+rise*k/3
                    beam('Forum stair fine infill','Meng frame',(CX+r*math.cos(a),CY+r*math.sin(a),z),(CX+r*math.cos(a),CY+r*math.sin(a),z+1.1),.018,sides=6)
        mid_a=start+half*step
        slab('Forum stair intermediate landing','Meng white',sector(21,24,mid_a,mid_a+landing_angle),base+half*rise-.22,.22)
        for r in [21.05,23.95]:
            for k in range(8):
                a=mid_a+landing_angle*k/8;b=mid_a+landing_angle*(k+1)/8
                beam('Forum landing handrails','Meng frame',(CX+r*math.cos(a),CY+r*math.sin(a),base+half*rise+1.1),(CX+r*math.cos(b),CY+r*math.sin(b),base+half*rise+1.1),.035,sides=6)
        # Sloped underside follows the stair pitch; no massive vertical stair block.
        for a,b,z0,z1 in [(start,mid_a,base,base+half*rise),(mid_a+landing_angle,angles[-1],base+half*rise,top)]:
            geom=sector(21,24,a,b)
            def height(x,y,a=a,b=b,z0=z0,z1=z1):
                angle=math.atan2(y-CY,x-CX)
                return z0+(z1-z0)*(angle-a)/(b-a)-.12
            profile_slab('Forum stair continuous waist','Meng white',geom,height,.22,max_segment=.40)
        # Actual vertical supports below the intermediate landing, not floating stairs.
        a=mid_a+landing_angle/2
        for r in [21.3,23.7]:
            beam('Forum stair landing supports','Meng white',(CX+r*math.cos(a),CY+r*math.sin(a),base),(CX+r*math.cos(a),CY+r*math.sin(a),base+half*rise-.22),.10,sides=8)
    # Floor-opening guards follow the cut edges and leave the top arrival edge open.
    for base,top,count,start,step,landing_angle,rise,half,angles in STAIRS:
        first=max(0,math.floor((top-2.35-base)/rise));a0=angles[first]-.01;a1=angles[-1]
        for r in [20.75,24.25]:
            n=math.ceil((a1-a0)*r/.22)
            for j in range(n):
                a=a0+(a1-a0)*j/n;b=a0+(a1-a0)*(j+1)/n
                beam('Forum opening guard rails','Meng frame',(CX+r*math.cos(a),CY+r*math.sin(a),top+1.1),(CX+r*math.cos(b),CY+r*math.sin(b),top+1.1),.03,sides=6)
                beam('Forum opening guard infill','Meng frame',(CX+r*math.cos(a),CY+r*math.sin(a),top),(CX+r*math.cos(a),CY+r*math.sin(a),top+1.1),.018,sides=6)
        beam('Forum opening end guard','Meng frame',(CX+20.75*math.cos(a0),CY+20.75*math.sin(a0),top+1.1),(CX+24.25*math.cos(a0),CY+24.25*math.sin(a0),top+1.1),.03,sides=6)
    # Furnished reading pockets leave the west entrance and main cross-hall route open.
    for a in [math.radians(d) for d in [-35,10,55,100,145]]:
        x,y=CX+12*math.cos(a),CY+12*math.sin(a)
        slab('Forum reading tabletops','wood',Point(x,y).buffer(1.1,quad_segs=32),.86,.07)
        beam('Forum table pedestals','Meng frame',(x,y,.15),(x,y,.86),.08,sides=8)
        slab('Forum table feet','Meng frame',Point(x,y).buffer(.35,quad_segs=24),.15,.04)
        for q in range(4):
            t=q*math.tau/4;px,py=x+1.55*math.cos(t),y+1.55*math.sin(t)
            cube('Forum reading chair seats','wood',(px,py,.60),(.48,.48,.065),t)
            cube('Forum reading chair backs','wood',(px+.22*math.cos(t),py+.22*math.sin(t),.88),(.05,.48,.48),t)
            for dx in [-.18,.18]:
                for dy in [-.18,.18]:
                    xx=px+dx*math.cos(t)-dy*math.sin(t);yy=py+dx*math.sin(t)+dy*math.cos(t)
                    beam('Forum reading chair legs','Meng frame',(xx,yy,.15),(xx,yy,.57),.022,sides=6)
    # A modest information desk is placed north of the entrance, not in its sightline.
    desk=sector(12,13.2,math.radians(175),math.radians(202))
    slab('Forum information desk base','Meng warm plaster',desk,.15,.92)
    slab('Forum information desk top','wood',desk.buffer(.06),1.07,.06)
