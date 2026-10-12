let revision=0;
export const securityCacheRevision=()=>revision;
export const invalidateSecurityCaches=()=>{revision++;};
