
// Define patterns in order of hierarchy
export const markdownChunkingPatterns = [
    /\n(?=# )/g,         // H1
    /\n(?=## )/g,        // H2
    /\n(?=### )/g,       // H3
    /\n(?=#### )/g,      // H4
    /\n(?=##### )/g,     // H5
    /\n(?=###### )/g,    // H6
    /\n{2,}/g,            // Paragraphs
];

export function recursiveChunk(text: string, patterns: RegExp[] = markdownChunkingPatterns, stack: string[] = []): string[] {
    const prefix = stack.length ? stack.join('\n') : '';

    if (stack.length) {
        debugger;
    }

    if (patterns.length === 0) {
        return [`${prefix}${text}`.trim()];
    }

    if ((text.length / 4) < 6144) {
        return [`${prefix}${text}`.trim()];
    }

    const [currentPattern, ...remainingPatterns] = patterns;

    // Split using the current level's pattern
    const parts = text.split(currentPattern);

    if (remainingPatterns.length === 0 || parts.length === 1 || parts[0]?.length > 512) {
        return parts.filter(part => part.trim()).flatMap((part) => recursiveChunk(part, remainingPatterns, stack));
    }

    const [firstPart, ...restParts] = parts.filter(part => part.trim());

    // For every part found, try splitting it by the next pattern in the list
    return restParts.flatMap((part) => recursiveChunk(part, remainingPatterns, [...stack, firstPart]));
}
