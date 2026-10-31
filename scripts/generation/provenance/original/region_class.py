import math
def classify(volume,solid_triangles,surface_triangles,cube_volume):
 if not math.isfinite(volume) or volume<0 or volume>cube_volume*(1+1e-7):raise ValueError('Invalid clipped volume')
 if solid_triangles==0:
  if volume!=0 or surface_triangles!=0:raise ValueError('Inconsistent empty region')
  return 'empty-air'
 if surface_triangles==0:
  if not math.isclose(volume,cube_volume,rel_tol=1e-7,abs_tol=1e-16):raise ValueError('Unclassified closure-only region')
  return 'full-solid'
 return 'surface'
