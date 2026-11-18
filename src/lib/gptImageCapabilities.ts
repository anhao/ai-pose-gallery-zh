/** Only older GPT Image models accept an explicit input_fidelity setting.
 * GPT Image 2 and newer always use high input fidelity. Unknown/custom model
 * aliases use their server default instead of receiving an unsupported option.
 */
export function getGptInputFidelity(model: string, requested: 'high' | 'low'): 'high' | 'low' | undefined {
  if (/^gpt-image-1(?:\.5)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) return requested
  if (/^gpt-image-1-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(model) && requested === 'low') return 'low'
  return undefined
}
