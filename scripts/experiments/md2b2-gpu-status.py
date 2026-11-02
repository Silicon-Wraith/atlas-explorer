"""One bounded genuine CuPy direct-evaluator probe; caller owns GPU lock."""
from pathlib import Path
import hashlib,json,math,os,sys
sys.dont_write_bytecode=True
if not os.environ.get('ATLAS_GPU_HANDOFF') or os.environ.get('ATLAS_GPU_DEFERRED'):
    raise ValueError('Exclusive GPU handoff required')
root=Path(sys.argv[1]);cases=json.loads(Path(sys.argv[2]).read_text())['direct']
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'generation/native'))
import numpy as np
import cupy as cp
import fkern
try:
    d,st,it=fkern.fdser(complex(*cases['source']),cases['unitsPerMetre'],np.array(cases['real']),np.array(cases['imag']),nmax=cases['maxIterations'])
    distance=d.get();status=st.get();iterations=it.get()
    device=cp.cuda.runtime.getDeviceProperties(0)['name']
    if isinstance(device,bytes):device=device.decode()
    result=dict(device=device,numpy=np.__version__,cupy=cp.__version__,status=status.tolist(),iterations=iterations.tolist(),
                distance=[float(v) if math.isfinite(v) else None for v in distance],gpuInteriorMask=True,
                kernelSha256=hashlib.sha256(Path(fkern.__file__).read_bytes()).hexdigest())
    (root/'direct.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
finally:
    cp.cuda.get_current_stream().synchronize();cp.get_default_memory_pool().free_all_blocks()
