"""Same geometry builder; bounded memoization of immutable field and RTIN results."""
from pathlib import Path
from collections import OrderedDict
import json, hashlib, time
import numpy as np
import builder_view as B

class Cache:
    def __init__(self, limit):
        self.limit=limit; self.items=OrderedDict(); self.bytes=0; self.peak=0; self.hits=0; self.misses=0; self.evictions=0
    def get(self,key):
        if key not in self.items:self.misses+=1;return None
        self.hits+=1;self.items.move_to_end(key);return self.items[key][0]
    def put(self,key,value):
        size=sum(v.nbytes for v in value if isinstance(v,np.ndarray))
        if size>self.limit:return
        while self.bytes+size>self.limit:
            _,(_,old)=self.items.popitem(last=False);self.bytes-=old;self.evictions+=1
        self.items[key]=(value,size);self.bytes+=size;self.peak=max(self.peak,self.bytes)
    def report(self):return {k:getattr(self,k) for k in ('limit','bytes','peak','hits','misses','evictions')}

HERE=Path(__file__).resolve().parent
B.HERE=HERE/'cached-r0'
# Bind component names to exact construction/generator identities for this process.
version=hashlib.sha256(b''.join(p.read_bytes() for p in [Path(B.__file__),Path(B.W.__file__),B.ROOT/'construction.json',Path(B.S.__file__),Path(B.G.__file__),Path(B.S.H.__file__),Path(B.S.pert.__file__),Path(B.S.fkern.__file__)])).hexdigest()
field=Cache(96*1024*1024);validation=Cache(32*1024*1024);topology=Cache(64*1024*1024)
values=B.S.values;tile_mesh=B.original_tile_mesh
actual_field_calls=0;actual_field_points=0
field_events=[];source_keys=set();cache_events=[]

def cached_values(c,a,b,gpu):
    global actual_field_calls,actual_field_points
    key=(version,B.CONTENT_ID,B.source_spec,c['name'],bool(gpu),a.shape,b.shape,B.digest(a),B.digest(b))
    cache=field if np.asarray(a).ndim==2 else validation
    hit=cache.get(key)
    if hit is not None:
        cache_events.append({'time':time.time()*1000,'kind':'source' if np.asarray(a).ndim==2 else 'validation','points':int(np.asarray(a).size)})
        lo,hi,stats=hit
        return lo,hi,{**stats,'queries':0,'cache_hit':True}
    actual_field_calls+=1;actual_field_points+=np.asarray(a).size
    start=time.time()*1000
    result=values(c,a,b,gpu)
    source_key=None;novel=False
    if np.asarray(a).ndim==2:
        source_key=(B.CONTENT_ID,B.source_spec,c['name'], *B.current_tile)
        novel=source_key not in source_keys
        source_keys.add(source_key)
    field_events.append({'start':start,'end':time.time()*1000,'gpu':bool(gpu),'points':int(np.asarray(a).size),'source_key':source_key,'novel_source':novel,'kind':'source' if source_key is not None else 'validation'})
    if result[2]['unknown']==0:cache.put(key,result)
    return result

def cached_tile(martini,height,tolerance):
    key=(version,B.CONTENT_ID,B.source_spec,height.shape,tolerance,B.digest(height))
    hit=topology.get(key)
    if hit is not None:return hit
    result=tile_mesh(martini,height,tolerance);topology.put(key,result);return result

B.S.values=cached_values;B.original_tile_mesh=cached_tile


def reset():
    global actual_field_calls,actual_field_points
    field.items.clear();field.bytes=0;validation.items.clear();validation.bytes=0;topology.items.clear();topology.bytes=0
    field_events.clear();cache_events.clear();source_keys.clear();B.source_tiles.clear();B.topology_tiles.clear()
    actual_field_calls=actual_field_points=0
