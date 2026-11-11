// Limitador en memoria de intentos de login FALLIDOS por clave (ip|email).
// Ventana deslizante: se cuentan los fallos de los últimos `ventanaMs`.
export const MAX_FALLOS = 5;
export const VENTANA_MS = 15 * 60 * 1000;
const LIMITE_CLAVES = 5000;

export function crearLimiteIntentos({ ahora = () => Date.now(), maxFallos = MAX_FALLOS, ventanaMs = VENTANA_MS } = {}) {
  const fallos = new Map(); // clave -> [timestamps]

  function vigentes(clave) {
    const t = ahora();
    const lista = (fallos.get(clave) || []).filter((x) => t - x < ventanaMs);
    if (lista.length) fallos.set(clave, lista);
    else fallos.delete(clave);
    return lista;
  }

  function purgar() {
    for (const clave of fallos.keys()) vigentes(clave);
  }

  return {
    bloqueado: (clave) => vigentes(clave).length >= maxFallos,
    registrarFallo(clave) {
      // El email lo controla el cliente: acotar la memoria.
      if (fallos.size >= LIMITE_CLAVES) purgar();
      const lista = vigentes(clave);
      lista.push(ahora());
      fallos.set(clave, lista);
    },
    reiniciar: (clave) => { fallos.delete(clave); },
  };
}
