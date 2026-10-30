import path from 'node:path';
const initiatives={application:['pc3','pc4','bi1b','bi1c'],session:['pc4','bi1b','bi1c'],files:['bi1b','bi1c'],http:['pc4','bi1b','bi1c'],recovery:['bi1c']};
export function preparedRunRoot(value,role){
 const root=path.resolve(value);
 if(!initiatives[role]?.some(name=>root.startsWith('/mnt/ml_storage/scratch/atlas-'+name+'/')))throw Error('Prepared '+role+' evidence root required');
 return root;
}
