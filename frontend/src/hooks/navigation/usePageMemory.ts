import { useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useNavigate, type NavigateOptions, type To } from 'react-router-dom';
import { useActiveAccount } from '../useActiveAccount';
import { readPageMemory, writePageMemory } from './pageMemory';

export function usePageMemoryKey() {
  const location = useLocation();
  const { accountId } = useActiveAccount();
  return JSON.stringify([accountId ?? 'unselected', location.state?.listEntryKey ?? location.key, location.pathname]);
}
export function usePageMemory<T>(name: string, initial: T | (() => T), options: {adoptInitialAccount?:boolean} = {}): [T, Dispatch<SetStateAction<T>>] {
  const scope=usePageMemoryKey(),key=scope+':'+name;
  const read=()=>{
    let saved=readPageMemory<T>(key);
    if(options.adoptInitialAccount){
      const [account,entry,route]=JSON.parse(scope) as string[];
      if(account!=='unselected'){
        const pendingScope=JSON.stringify(['unselected',entry,route]);
        const ownerKey=pendingScope+':'+name+':initial-account-owner';
        const owner=readPageMemory<string>(ownerKey);
        // Consume pre-account UI input once for this history entry, never for a later account.
        if(owner===undefined){
          writePageMemory(ownerKey,account);
          const pending=readPageMemory<T>(pendingScope+':'+name);
          if(saved===undefined&&pending!==undefined){saved=pending;writePageMemory(key,pending);}
        }
      }
    }
    return saved??(typeof initial==='function'?(initial as ()=>T)():initial);
  };
  const [slot, setSlot] = useState(() => ({ key, value: read() }));
  const value = slot.key === key ? slot.value : read();
  if (slot.key !== key) setSlot({ key, value });
  const setValue: Dispatch<SetStateAction<T>> = update => setSlot(previous => {
    const current = previous.key === key ? previous.value : read();
    const next = typeof update === 'function' ? (update as (value: T) => T)(current) : update;
    writePageMemory(key, next);
    return { key, value: next };
  });
  return [value, setValue];
}
export function useListNavigation(inheritReturn = false) {
  const location = useLocation(), navigate = useNavigate();
  return (to: To, options: NavigateOptions = {}) => navigate(to, { ...options, state: {
    backgroundLocation: location, ...options.state, returnTo: (inheritReturn ? location.state?.returnTo : undefined) ?? { pathname: location.pathname, search: location.search, index: window.history.state?.idx },
  } });
}
export function useReturnNavigation(fallback = '/stocks') {
  const location = useLocation(), navigate = useNavigate();
  return () => {
    const target = location.state?.returnTo;
    const distance = Number(window.history.state?.idx) - Number(target?.index);
    if (target && Number.isFinite(distance) && distance > 0) navigate(-distance);
    else if (target) navigate(target.pathname + target.search, { replace: true });
    else if (Number(window.history.state?.idx) > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  };
}
