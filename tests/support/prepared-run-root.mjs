import path from 'node:path';
const initiatives={application:['pc3','pc4','bi1b','bi1c','md2a','md2a22'],session:['pc4','bi1b','bi1c','md2a','md2a22'],files:['bi1b','bi1c','md2a','md2a22'],http:['pc4','bi1b','bi1c','md2a','md2a22'],recovery:['bi1c','md2a','md2a22'],generation:['md2a','md2a22'],source:['md2a22']};
export function preparedRunRoot(value,role){
 const root=path.resolve(value);
 if(!initiatives[role]?.some(name=>root.startsWith('/mnt/ml_storage/scratch/atlas-'+name+'/')))throw Error('Prepared '+role+' evidence root required');
 return root;
}
