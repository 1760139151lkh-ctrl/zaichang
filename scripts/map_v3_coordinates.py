"""WGS84 <-> local EPSG:32651 metres, shared with the locator's official image frame.

The forward series matches the locator. Inversion solves that same continuous
map, so a round trip never mixes a GCJ/BD offset or the oblique raster frame.
"""
import math
ORIGIN=(217000.,3355200.)
def to_local(longitude,latitude):
 a=6378137.;f=1/298.257223563;e2=f*(2-f);ep2=e2/(1-e2);k=.9996
 phi=math.radians(latitude);delta=math.radians(longitude-123);s=math.sin(phi);c=math.cos(phi);t=math.tan(phi)**2;cc=ep2*c*c;aa=c*delta;n=a/math.sqrt(1-e2*s*s)
 m=a*((1-e2/4-3*e2**2/64-5*e2**3/256)*phi-(3*e2/8+3*e2**2/32+45*e2**3/1024)*math.sin(2*phi)+(15*e2**2/256+45*e2**3/1024)*math.sin(4*phi)-35*e2**3/3072*math.sin(6*phi))
 east=500000+k*n*(aa+(1-t+cc)*aa**3/6+(5-18*t+t*t+72*cc-58*ep2)*aa**5/120)
 north=k*(m+n*math.tan(phi)*(aa*aa/2+(5-t+9*cc+4*cc*cc)*aa**4/24+(61-58*t+t*t+600*cc-330*ep2)*aa**6/720))
 return [east-ORIGIN[0],north-ORIGIN[1]]
def to_wgs(e,n):
 lon,lat=120.08,30.30
 for _ in range(7):
  x,y=to_local(lon,lat);dx,dy=e-x,n-y
  if math.hypot(dx,dy)<1e-7:break
  xa,ya=to_local(lon+1e-5,lat);xb,yb=to_local(lon,lat+1e-5)
  a,b,c,d=(xa-x)/1e-5,(xb-x)/1e-5,(ya-y)/1e-5,(yb-y)/1e-5;det=a*d-b*c
  lon+=(d*dx-b*dy)/det;lat+=(-c*dx+a*dy)/det
 return [lon,lat]
def meters(a,b):
 r=math.pi/180;h=math.sin((b[1]-a[1])*r/2)**2+math.cos(a[1]*r)*math.cos(b[1]*r)*math.sin((b[0]-a[0])*r/2)**2
 return 2*6371008.8*math.asin(min(1,math.sqrt(h)))
