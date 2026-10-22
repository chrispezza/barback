import type { Cocktail } from './types';

// Bar Assistant v5.15.3 escapes a cocktail's free text on output with Laravel's
// e(): htmlspecialchars($value ?? '', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8',
// $doubleEncode = true) (app/Http/Resources/CocktailResource.php:96-98;
// Illuminate/Support/helpers.php:138). The client receives entities, not the
// text the recipe was written with.

/** What e() writes under ENT_QUOTES with the default HTML 4.01 table: these
 *  five and nothing else. */
const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
} as const;

const ENTITY = /&(?:amp|lt|gt|quot|#039);/g;

/**
 * Undo e() once: the five entities it writes back into their characters, in a
 * single pass, so a stored "&amp;" (sent as "&amp;amp;") reads "&amp;" again.
 * Any other entity-shaped text is left as it is: e() never wrote it, so it was
 * stored that way.
 *
 * The result is plain text and may now hold "<" and "&". Render it as a text
 * node (JSX children), never as HTML: decoding is only safe because nothing
 * downstream parses it.
 */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (entity) => ENTITIES[entity as keyof typeof ENTITIES]);
}

/**
 * A cocktail with the fields upstream escapes read back as stored: the
 * instructions and the garnish. `description` is escaped too, but the client
 * types and shows none. `name` is sent unescaped and is left alone. Pure: the
 * response it reads is not changed.
 */
export function decodeCocktailText<T extends Pick<Cocktail, 'instructions' | 'garnish'>>(cocktail: T): T {
  return {
    ...cocktail,
    instructions: decodeEntities(cocktail.instructions),
    garnish: cocktail.garnish === null ? null : decodeEntities(cocktail.garnish),
  };
}
