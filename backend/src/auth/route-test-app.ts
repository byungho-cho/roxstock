import {buildApplication} from '../app.js';
/** Unit tests of existing financial/ledger handlers inject DB fixtures, not real sessions.
 * Production always calls buildApp(), which unconditionally installs installAuth.
 * Full authentication and ownership tests use that production entry point and a real DB.
 */
export const buildApp=()=>buildApplication(()=>{});
