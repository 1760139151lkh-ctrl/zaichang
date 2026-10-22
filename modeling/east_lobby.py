"""One authored upper entrance lobby, specific to the cultural-gallery junction."""
from architecture_primitives import *

def build_upper_lobby(foot):
 # Keep the central arrival route and transverse access to the neighbouring stair.
 envelope=box(-53,424.72,-41,433.3)
 walls=box(-53,424.72,-52.82,433.3).union(box(-41.18,424.72,-41,433.3)).union(box(-53,433.12,-41,433.3))
 openings=box(-54,425,-40,427.5).union(box(-49,432,-45,434))
 slab('East upper lobby partitions','East white',walls.difference(openings).intersection(foot),3.35,3.0)
 # Warm timber panels stop at a genuinely open four-metre inner portal.
 for x0,x1 in [(-52.82,-49),(-45,-41.18)]:
  slab('East upper lobby timber panels','wood',box(x0,433.065,x1,433.12),3.48,2.72)
 for x in [-49.02,-44.98]:
  cube('East upper lobby inner jamb','East bronze',(x,433.015,4.79),(.20,.10,2.88))
 cube('East upper lobby inner header','East bronze',(-47,433.015,6.29),(4.24,.10,.12))
 mat('East lobby fabric',(.19,.20,.19),0,.94)
 for x,side in [(-52.35,-1),(-41.65,1)]:
  cube('East upper lobby bench base','wood',(x,430.0,3.70),(.70,2.8,.12))
  cube('East upper lobby bench cushion','East lobby fabric',(x-side*.035,430.0,3.81),(.58,2.72,.10))
  cube('East upper lobby bench back','wood',(x+side*.30,430.0,4.09),(.07,2.8,.64))
  for y in [428.85,431.15]:
   for xx in [x-.24,x+.24]:
    beam('East upper lobby bench legs','East bronze',(xx,y,3.35),(xx,y,3.64),.025,sides=6)
 return envelope
