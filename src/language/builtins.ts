/*
 * Minimal fallback vocabulary used only when no language folder (bundled or
 * user-supplied) could be loaded. The real data comes from
 * goblin++/functions/registry.json, units/registry.json and grammar/goblinpp.json.
 */
import type { FunctionEntry } from './manifest'

export const KEYWORDS = ['for', 'in', 'while', 'range', 'break', 'continue', 'if', 'else', 'switch', 'case', 'default', 'g_func', 'return', 'import', 'seal']
export const LITERALS = ['true', 'false', 'argc']
export const DIRECTIVES = ['GO_PARANOID', 'GO_LOOP_BUDGET', 'GO_NUMERIC_AUDIT', 'COMPLETELY_MAD', 'RUST_INLINE_BEGIN', 'RUST_INLINE_END']
export const CONSTANTS = ['speed_of_light', 'planck_constant', 'gravitational_constant', 'boltzmann_constant', 'avogadro_constant', 'molar_gas_constant', 'atomic_mass_constant', 'hbar', 'pi', 'k_B', 'N_A', 'm_u', 'R', 'c', 'h', 'G', 'π', 'ħ']
export const UNITS = ['kg', 'g', 'm', 'km', 's', 'K', 'mol', 'J', 'L', 'mL', 'uL', 'µL', 'nm', 'pm', 'angstrom', 'Å', 'Pa', 'kPa', 'bar', 'atm', 'Da', 'A', 'mA', 'uA', 'µA', 'C', 'V', 'mV', 'kV', 'ohm', 'Ω', 'kohm', 'kΩ', 'Mohm', 'MΩ', 'F', 'mF', 'uF', 'µF', 'nF', 'pF', 'H', 'mH', 'uH', 'µH', 'W', 'mW', 'kW', 'S', 'mS', 'uS', 'µS', 'Hz', 'kHz', 'MHz']

export const BUILTINS: FunctionEntry[] = [
  { name: 'print', domain: 'Core', signature: 'print(message)', description: 'Print values; "{name}" and "{name:.3f}" interpolate.' },
  { name: 'printf', domain: 'Core', signature: 'printf(format, value)', description: 'Python-percent style formatted output.' },
  { name: 'input', domain: 'Core', signature: 'input(prompt)', description: 'Read a line of text; hashed into the receipt.' },
  { name: 'len', domain: 'Core', signature: 'len(array)', description: 'Array length.' },
  { name: 'append', domain: 'Core', signature: 'append(array, value)', description: 'Return a new array with the value appended.' },
  { name: 'sqrt', domain: 'Math', signature: 'sqrt(value)', description: 'Real square root with checked dimensions.' },
  { name: 'hypot', domain: 'Math', signature: 'hypot(x, y)', description: 'Hypotenuse of two quantities with matching dimensions.' },
  { name: 'sinr', domain: 'Math', signature: 'sinr(radians)', description: 'Sine of an angle in radians.' },
  { name: 'sind', domain: 'Math', signature: 'sind(degrees)', description: 'Sine of an angle in degrees.' },
  { name: 'write_text', domain: 'Outputs', signature: 'write_text(path, text)', description: 'Write an audited text output into the run directory.' },
  { name: 'ee_current', domain: 'Electrical', signature: 'ee_current(voltage, resistance)', description: "Ohm's law: I = V / R." },
  { name: 'chem_molar_mass', domain: 'Chemistry', signature: 'chem_molar_mass(formula)', description: 'Molar mass from the registered element table.' },
  { name: 'fits_column', domain: 'FITS', signature: 'fits_column(file, hdu, column, row)', description: 'Read one BINTABLE cell.' },
  { name: 'rng_seed', domain: 'Randomness & Resampling', signature: 'rng_seed(seed)', description: 'Seed the PCG32 stream (required before any rng_* call).' },
]
export const BUILTIN_NAMES = BUILTINS.map((b) => b.name)
