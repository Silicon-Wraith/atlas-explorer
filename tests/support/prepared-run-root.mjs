import path from 'node:path';
const initiatives={application:['pc3','pc4','bi1b','bi1c','md2a'],session:['pc4','bi1b','bi1c','md2a'],files:['bi1b','bi1c','md2a'],http:['pc4','bi1b','bi1c','md2a'],recovery:['bi1c','md2a'],generation:['md2a']};
export function preparedRunRoot(value,role){
 const root=path.resolve(value);
 if(!initiatives[role]?.some(name=>root.startsWith('/mnt/ml_storage/scratch/atlas-'+name+'/')))throw Error('Prepared '+role+' evidence root required');
 return root;
}
