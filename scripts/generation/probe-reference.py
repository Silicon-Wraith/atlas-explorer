"""Dependency-only CPU probe; evaluates no source mathematics and imports no CUDA."""
import importlib.util, json, sys
sys.dont_write_bytecode = True
import numpy
import mpmath
import source_recipe

if 'cupy' in sys.modules:
    raise RuntimeError('Reference dependency probe must not import CUDA')
print(json.dumps(dict(executable=sys.executable, python=sys.version.split()[0],
                     numpy=numpy.__version__, numpyFile=numpy.__file__,
                     mpmath=mpmath.__version__, mpmathFile=mpmath.__file__,
                     sourceRecipeFile=source_recipe.__file__,
                     gmpyPresent=bool(importlib.util.find_spec('gmpy2') or importlib.util.find_spec('gmpy')),
                     mpmathBackend=mpmath.libmp.BACKEND, cudaImported=False)))
