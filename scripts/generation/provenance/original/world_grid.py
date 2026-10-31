from pathlib import Path
import json,numpy as np
P=Path(__file__).resolve().parent
CONFIG=json.loads((P/'cpu-screen-r0.json').read_text());D=CONFIG['diameter'];ORIGIN=np.array(CONFIG['origin']);TANGENT=np.array(CONFIG['tangent']);BINORMAL=np.array(CONFIG['binormal']);NORMAL=np.array(CONFIG['normal']);STEP=.75;WORLD_ID=CONFIG['world_identity']
def encode(i,j):
 if not isinstance(i,int) or not isinstance(j,int) or not -2<=i<=6 or not -2<=j<=2:raise ValueError('Outside BW1 bounded domain')
 return 0 if (i,j)==(0,0) else 100+(i+2)*5+j+2

def decode(index):
 if index==0:return 0,0
 if not isinstance(index,int) or index==112 or not 100<=index<145:raise ValueError('Invalid BW1 coarse address')
 i,j=divmod(index-100,5);return i-2,j-2

def center(index):
 i,j=decode(index);return ORIGIN+D*STEP*(i*TANGENT+j*BINORMAL)
