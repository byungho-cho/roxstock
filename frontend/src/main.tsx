import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CssBaseline, ThemeProvider } from '@mui/material';
import {createBrowserRouter,RouterProvider} from 'react-router-dom';
import { App } from './App';
import {AuthGate} from './auth/AuthGate';
import { liveApiEnabled } from './data/liveData';
import { theme } from './styles/theme';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: liveApiEnabled ? 'always' : false } } });

window.addEventListener('roxstock-data-mutated', () => {
  void queryClient.invalidateQueries({ queryKey: ['homePage'] });
  void queryClient.invalidateQueries({ queryKey: ['stocksPage'] });
});

const router=createBrowserRouter([{path:'*',element:liveApiEnabled?<AuthGate><App /></AuthGate>:<App/>}]);
createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={queryClient}><ThemeProvider theme={theme}><CssBaseline /><RouterProvider router={router} useTransitions={false}/></ThemeProvider></QueryClientProvider></StrictMode>,
);
