import {prisma} from '../auth/scoped-db.js';
import {buildApp} from '../auth/route-test-app.js';
/** These route unit tests intentionally exercise the no-snapshot path, independent of an integration DB. */
export function buildAnalysisTestApp(){
 const revision=prisma.analysisRevision.findUnique,cache=prisma.analysisReadCache.findUnique;
 prisma.analysisRevision.findUnique=(async()=>null) as any;prisma.analysisReadCache.findUnique=(async()=>null) as any;
 const app=buildApp();app.addHook('onClose',async()=>{prisma.analysisRevision.findUnique=revision;prisma.analysisReadCache.findUnique=cache;});return app;
}
