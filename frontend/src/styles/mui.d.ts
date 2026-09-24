import '@mui/material/styles';

declare module '@mui/material/styles' {
  interface Palette {
    market: { up: string; down: string; flat: string };
    collection: { success: string; partial: string; failed: string };
  }

  interface PaletteOptions {
    market?: { up: string; down: string; flat: string };
    collection?: { success: string; partial: string; failed: string };
  }
}
