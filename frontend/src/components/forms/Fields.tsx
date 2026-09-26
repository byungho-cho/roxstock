import { CalendarMonthRounded, CloseRounded, KeyboardArrowDownRounded, SearchRounded } from '@mui/icons-material';
import { Box, FormControl, FormHelperText, IconButton, InputBase, MenuItem, Select, Stack, Typography, type SelectChangeEvent } from '@mui/material';
import type { ReactNode } from 'react';
import { colors, radius, spacing } from '../../styles/tokens';

export function FormField({ label, required, error, description, children }: { label?: string; required?: boolean; error?: string; description?: string; children: ReactNode }) {
  return <FormControl fullWidth error={Boolean(error)}><Stack spacing={spacing.xs / 8}>{label && <Typography component="label" sx={{ fontSize: 12, color: colors.textSecondary }}>{label}{required && <Box component="span" sx={{ ml: 0.5, color: colors.error }}>*</Box>}</Typography>}{children}{(error || description) && <FormHelperText sx={{ mx: 0.5, mt: '4px', fontSize: 11, color: error ? colors.error : colors.textMuted }}>{error ?? description}</FormHelperText>}</Stack></FormControl>;
}

type BaseFieldProps = { label: string; value: string; onChange: (value: string) => void; error?: string; description?: string; required?: boolean; disabled?: boolean; placeholder?: string; endAdornment?: ReactNode; autoFocus?: boolean };

function FieldShell({ label, value, onChange, type = 'text', error, description, required, disabled, placeholder, endAdornment, autoFocus, inputMode, min, max }: BaseFieldProps & { type?: string; inputMode?: 'text' | 'numeric' | 'decimal'; min?: number; max?: number }) {
  return <FormField error={error} description={description}><Box sx={{ height: 48, display: 'flex', alignItems: 'center', px: '14px', gap: '6px', bgcolor: disabled ? `${colors.raised}80` : colors.raised, border: '1px solid', borderColor: error ? colors.error : colors.borderStrong, borderRadius: `${radius.md}px`, opacity: disabled ? 0.55 : 1, '&:focus-within': { borderColor: error ? colors.error : colors.focus } }}><Typography sx={{ flex: '0 0 76px', fontSize: 12, color: colors.textSecondary }}>{label}{required && <Box component="span" sx={{ ml: 0.25, color: colors.error }}>*</Box>}</Typography><InputBase autoFocus={autoFocus} value={value} type={type} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} inputProps={{ min, max, inputMode }} sx={{ flex: 1, minWidth: 0, '& input': { p: 0, textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#E5EDF7', ...(type === 'date' && { colorScheme: 'dark' }), '&::placeholder': { color: colors.disabled, opacity: 1 }, '&::-webkit-calendar-picker-indicator': { opacity: 0, position: 'absolute', right: 0 } } }} />{endAdornment ?? (value && !disabled ? <IconButton aria-label={`${label} 지우기`} onClick={() => onChange('')} size="small" sx={{ width: 20, height: 20, p: 0, color: error ? colors.error : colors.textMuted }}><CloseRounded sx={{ fontSize: 16 }} /></IconButton> : <Box sx={{ width: 20 }} />)}</Box></FormField>;
}

export function FormTextField(props: BaseFieldProps) {
  return <FieldShell {...props} />;
}

export function NumberField(props: BaseFieldProps & { min?: number; max?: number; suffix?: string }) {
  const adornment = props.suffix && props.value ? <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}><Typography sx={{ fontSize: 13, fontWeight: 600, color: '#E5EDF7' }}>{props.suffix}</Typography><IconButton aria-label={`${props.label} 지우기`} onClick={() => props.onChange('')} size="small" sx={{ width: 20, height: 20, p: 0, color: props.error ? colors.error : colors.textMuted }}><CloseRounded sx={{ fontSize: 16 }} /></IconButton></Stack> : undefined;
  return <FieldShell {...props} type="number" inputMode="numeric" endAdornment={adornment} />;
}

export function DateField(props: BaseFieldProps) {
  return <FieldShell {...props} type="date" endAdornment={<CalendarMonthRounded sx={{ fontSize: 16, color: colors.textMuted }} />} />;
}

export function FormTextarea({ label, value, onChange, error, description, required, disabled, placeholder, rows = 3 }: BaseFieldProps & { rows?: number }) {
  return <FormField label={label} required={required} error={error} description={description}><InputBase multiline minRows={rows} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder} sx={{ p: '12px 14px', bgcolor: colors.raised, border: '1px solid', borderColor: error ? colors.error : colors.borderStrong, borderRadius: `${radius.md}px`, '&.Mui-focused': { borderColor: error ? colors.error : colors.focus } }} /></FormField>;
}

export function FormSelect({ label, value, onChange, options, error, description, required, disabled }: Omit<BaseFieldProps, 'onChange'> & { onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <FormField error={error} description={description}><Box sx={{ height: 48, display: 'flex', alignItems: 'center', px: '14px', bgcolor: colors.raised, border: '1px solid', borderColor: error ? colors.error : colors.borderStrong, borderRadius: `${radius.md}px`, opacity: disabled ? 0.55 : 1 }}><Typography sx={{ flex: '0 0 76px', fontSize: 12, color: colors.textSecondary }}>{label}{required && <Box component="span" sx={{ ml: 0.25, color: colors.error }}>*</Box>}</Typography><Select value={value} disabled={disabled} onChange={(e: SelectChangeEvent) => onChange(e.target.value)} variant="standard" disableUnderline IconComponent={KeyboardArrowDownRounded} sx={{ flex: 1, textAlign: 'right', '& .MuiSelect-select': { py: 0, pr: '24px !important', fontSize: 14, fontWeight: 600 } }}>{options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select></Box></FormField>;
}

export function SearchField({ value, onChange, placeholder = '검색', error, description, disabled }: Omit<BaseFieldProps, 'label'>) {
  return <FormField error={error} description={description}><Box sx={{ height: 48, display: 'flex', alignItems: 'center', px: '14px', gap: 1, bgcolor: colors.raised, border: '1px solid', borderColor: error ? colors.error : colors.borderStrong, borderRadius: `${radius.md}px`, '&:focus-within': { borderColor: error ? colors.error : colors.focus } }}><SearchRounded sx={{ fontSize: 18, color: colors.textMuted }} /><InputBase value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} sx={{ flex: 1 }} />{value && <IconButton onClick={() => onChange('')} size="small"><CloseRounded sx={{ fontSize: 16 }} /></IconButton>}</Box></FormField>;
}
