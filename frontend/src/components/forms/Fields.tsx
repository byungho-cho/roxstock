import { CalendarMonthRounded, CloseRounded, KeyboardArrowDownRounded, SearchRounded } from '@mui/icons-material';
import { Box, FormControl, FormHelperText, IconButton, InputBase, MenuItem, Select, Stack, Typography, type SelectChangeEvent } from '@mui/material';
import { useCallback, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { colors, radius, spacing } from '../../styles/tokens';

export function FormField({ label, required, error, description, children }: { label?: string; required?: boolean; error?: string; description?: string; children: ReactNode }) {
  return <FormControl fullWidth error={Boolean(error)}><Stack spacing={spacing.xs / 8}>{label && <Typography component="label" sx={{ fontSize: 12, color: colors.textSecondary }}>{label}{required && <Box component="span" sx={{ ml: 0.5, color: colors.error }}>*</Box>}</Typography>}{children}{(error || description) && <FormHelperText sx={{ mx: 0.5, mt: '4px', fontSize: 11, color: error ? colors.error : colors.textMuted }}>{error ?? description}</FormHelperText>}</Stack></FormControl>;
}

type BaseFieldProps = { label: string; value: string; onChange: (value: string, cursor?: number, inputType?: string) => void; error?: string; description?: string; required?: boolean; disabled?: boolean; placeholder?: string; endAdornment?: ReactNode; autoFocus?: boolean; inputRef?: Ref<HTMLInputElement>; enterKeyHint?: 'done' | 'next' | 'search'; onEnter?: () => void };

function handleEnter(event: KeyboardEvent, action?: () => void) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing || !action) return;
  event.preventDefault();
  action();
}

function FieldShell({ label, value, onChange, type = 'text', error, description, required, disabled, placeholder, endAdornment, autoFocus, inputRef, inputMode, min, max, enterKeyHint, onEnter }: BaseFieldProps & { type?: string; inputMode?: 'text' | 'numeric' | 'decimal'; min?: number; max?: number }) {
  return <FormField error={error} description={description}><Box sx={{ height: 48, display: 'flex', alignItems: 'center', px: '14px', gap: '6px', bgcolor: disabled ? `${colors.raised}80` : colors.raised, border: '1px solid', borderColor: error ? colors.error : colors.borderStrong, borderRadius: `${radius.md}px`, opacity: disabled ? 0.55 : 1, '&:focus-within': { borderColor: error ? colors.error : colors.focus } }}><Typography sx={{ flex: '0 0 76px', fontSize: 12, color: colors.textSecondary }}>{label}{required && <Box component="span" sx={{ ml: 0.25, color: colors.error }}>*</Box>}</Typography><InputBase autoFocus={autoFocus} inputRef={inputRef} value={value} type={type} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value, event.target.selectionStart ?? undefined, (event.nativeEvent as InputEvent).inputType)} onKeyDown={(event) => handleEnter(event, onEnter)} inputProps={{ min, max, inputMode, enterKeyHint, 'data-initial-focus': autoFocus ? 'true' : undefined }} sx={{ flex: 1, minWidth: 0, '& input': { p: 0, textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#E5EDF7', ...(type === 'date' && { colorScheme: 'dark' }), '&::placeholder': { color: colors.disabled, opacity: 1 }, '&::-webkit-calendar-picker-indicator': { opacity: 0, position: 'absolute', right: 0 } } }} />{endAdornment ?? (value && !disabled ? <IconButton aria-label={`${label} 지우기`} onClick={() => onChange('')} size="small" sx={{ width: 20, height: 20, p: 0, color: error ? colors.error : colors.textMuted }}><CloseRounded sx={{ fontSize: 16 }} /></IconButton> : <Box sx={{ width: 20 }} />)}</Box></FormField>;
}

export function FormTextField(props: BaseFieldProps) {
  return <FieldShell {...props} />;
}

export function NumberField(props: BaseFieldProps & { min?: number; max?: number; suffix?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const bindInput = useCallback((node: HTMLInputElement | null) => {
    input.current = node;
    if (typeof props.inputRef === 'function') props.inputRef(node);
    else if (props.inputRef) props.inputRef.current = node;
  }, [props.inputRef]);
  const grouped = props.value.replace(/^(-?)(\d+)/, (_, sign: string, integer: string) => `${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
  const restoreCaret = () => {
    if (pendingCaret.current === null || !input.current) return;
    const count = pendingCaret.current;
    let index = 0; let seen = 0;
    while (index < input.current.value.length && seen < count) {
      if (input.current.value[index] !== ',') seen += 1;
      index += 1;
    }
    if (input.current.value[index] === ',') index += 1;
    input.current.setSelectionRange(index, index);
    pendingCaret.current = null;
  };
  useLayoutEffect(restoreCaret);
  const changeValue = (display: string, cursor?: number, inputType?: string) => {
    let raw = display.replaceAll(',', '');
    if (!/^-?\d*(?:\.\d*)?$/.test(raw)) return;
    let caret = display.slice(0, cursor ?? display.length).replaceAll(',', '').length;
    // Backspace/Delete on a grouping comma should also remove the neighboring digit.
    if (raw === props.value && display.length === grouped.length - 1) {
      if (inputType === 'deleteContentBackward' && caret > 0) {
        raw = raw.slice(0, caret - 1) + raw.slice(caret);
        caret -= 1;
      } else if (inputType === 'deleteContentForward') {
        raw = raw.slice(0, caret) + raw.slice(caret + 1);
      }
    }
    pendingCaret.current = caret;
    props.onChange(raw);
    if (raw === props.value && input.current) {
      input.current.value = grouped;
      restoreCaret();
    }
  };
  const adornment = props.suffix && props.value ? <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Typography sx={{ fontSize: 13, fontWeight: 600, color: '#E5EDF7' }}>{props.suffix}</Typography><IconButton aria-label={`${props.label} 지우기`} onClick={() => props.onChange('')} size="small" sx={{ width: 20, height: 20, p: 0, color: props.error ? colors.error : colors.textMuted }}><CloseRounded sx={{ fontSize: 16 }} /></IconButton></Stack> : undefined;
  return <FieldShell {...props} value={grouped} onChange={changeValue} type="text" inputMode="numeric" inputRef={bindInput} endAdornment={adornment} />;
}

export function DateField(props: BaseFieldProps) {
  return <FieldShell {...props} type="date" endAdornment={<CalendarMonthRounded sx={{ fontSize: 16, color: colors.textMuted }} />} />;
}

export function FormTextarea({ label, value, onChange, error, description, required, disabled, placeholder, rows = 3, onEnter }: BaseFieldProps & { rows?: number }) {
  return <FormField label={label} required={required} error={error} description={description}><InputBase multiline minRows={rows} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(event) => { if (event.ctrlKey || event.metaKey) handleEnter(event, onEnter); }} disabled={disabled} placeholder={placeholder} sx={{ p: '12px 14px', bgcolor: colors.raised, border: '1px solid', borderColor: error ? colors.error : colors.borderStrong, borderRadius: `${radius.md}px`, '&.Mui-focused': { borderColor: error ? colors.error : colors.focus } }} /></FormField>;
}

export function FormSelect({ label, value, onChange, options, error, description, required, disabled }: Omit<BaseFieldProps, 'onChange'> & { onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <FormField error={error} description={description}><Box sx={{ height: 48, display: 'flex', alignItems: 'center', px: '14px', bgcolor: colors.raised, border: '1px solid', borderColor: error ? colors.error : colors.borderStrong, borderRadius: `${radius.md}px`, opacity: disabled ? 0.55 : 1 }}><Typography sx={{ flex: '0 0 76px', fontSize: 12, color: colors.textSecondary }}>{label}{required && <Box component="span" sx={{ ml: 0.25, color: colors.error }}>*</Box>}</Typography><Select value={value} disabled={disabled} onChange={(e: SelectChangeEvent) => onChange(e.target.value)} variant="standard" disableUnderline IconComponent={KeyboardArrowDownRounded} sx={{ flex: 1, textAlign: 'right', '& .MuiSelect-select': { py: 0, pr: '24px !important', fontSize: 14, fontWeight: 600 } }}>{options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></Box></FormField>;
}

export function SearchField({ value, onChange, placeholder = '검색', error, description, disabled }: Omit<BaseFieldProps, 'label'>) {
  return <FormField error={error} description={description}><Box sx={{ height: 48, display: 'flex', alignItems: 'center', px: '14px', gap: 1, bgcolor: colors.raised, border: '1px solid', borderColor: error ? colors.error : colors.borderStrong, borderRadius: `${radius.md}px`, '&:focus-within': { borderColor: error ? colors.error : colors.focus } }}><SearchRounded sx={{ fontSize: 18, color: colors.textMuted }} /><InputBase value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} sx={{ flex: 1 }} />{value && <IconButton onClick={() => onChange('')} size="small"><CloseRounded sx={{ fontSize: 16 }} /></IconButton>}</Box></FormField>;
}
