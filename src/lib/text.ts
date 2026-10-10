/**
 * Saca los acentos de un texto que se va a mostrar en mayúsculas. La
 * tipografía pixelada no tiene lugar para el acento arriba de una mayúscula
 * y dibuja esas letras más chicas; como en los arcades, van sin acento. La
 * ñ se conserva.
 */
export function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/ñ/g, "ñ")
    .replace(/Ñ/g, "Ñ")
    .replace(/[̀-ͯ]/g, "");
}
