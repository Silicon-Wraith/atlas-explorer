from pathlib import Path
from generation_paths import asset
import json,numpy as np
C=json.loads(asset('cpu-screen-r0.json').read_text());D=C['diameter'];O=np.array(C['origin']);T=np.array(C['tangent']);B=np.array(C['binormal'])
def encode(i,j):
 if not isinstance(i,int) or not isinstance(j,int) or not -1<=i<=2 or not -1<=j<=1:raise ValueError('Outside view domain')
 return 1000+(i+1)*3+j+1

def decode(index):
 if not isinstance(index,int) or not 1000<=index<1012:raise ValueError('Invalid view address')
 i,j=divmod(index-1000,3);return i-1,j-1

def center(index):
 i,j=decode(index);return O+3*D*(i*T+j*B)
