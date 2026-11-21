/** Exact H3 character-swap prompt used by both MiniMax H3 Image and P-H3-Image. */
export const H3_CHARACTER_SWAP_PROMPT = `Replace the woman in <Picture 1> with the character outfit from <Picture 2>, use character background, head，body, skin color, and woman face 100% from <Picture 3>. Create realistic human photography.  Keep her position, pose, and expression. Preserve the background and everyone else in the scene. Carry over the reference character’s costume and materials, and match the light in the source shot.
IMPORTANT: Create a REAL HUMAN PHOTOGRAPH, not CGI or a 3D render. Natural biological skin, realistic pores, human anatomy and lifelike facial features. Clothing materials must never transfer onto human skin or body parts. No robots, androids, cyborgs, metallic skin, plastic skin, mannequins or artificial body parts.
The final result must look like an authentic photograph of a real human wearing the referenced outfit.`

export function buildH3RecipePrompt(_recipe?: unknown, _stylePreset?: string): string {
  return H3_CHARACTER_SWAP_PROMPT
}
