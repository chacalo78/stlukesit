// Envío "dispara y olvida": nunca rechaza y solo loguea un mensaje genérico (el detalle de SMTP puede incluir
// direcciones o credenciales). Las promesas pendientes se registran para poder esperarlas en tests y al apagar.
const pendientes = new Set();

export function enSegundoPlano(fn) {
  const p = (async () => {
    try {
      await fn();
    } catch {
      console.warn('No se pudo completar una tarea de mail en segundo plano');
    }
  })();
  pendientes.add(p);
  p.finally(() => pendientes.delete(p));
  return p;
}

export function enviarSinEsperar(mailer, mensaje) {
  return enSegundoPlano(async () => {
    if (!mailer) throw new Error('sin mailer');
    await mailer.enviar(mensaje);
  });
}

export async function esperarPendientes() {
  while (pendientes.size) await Promise.all([...pendientes]);
}
