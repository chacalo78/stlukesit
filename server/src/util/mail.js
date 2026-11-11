// Envía y espera el mail. Nunca rechaza: devuelve el detalle del error (string) o undefined si salió bien.
// Es el equivalente de lo que el frontend mostraba del `detail` de la Edge Function (String(e.message)).
export async function mandarMail(mailer, msg) {
  try {
    if (!mailer) throw new Error('Mail no configurado');
    await mailer.enviar(msg);
    return undefined;
  } catch (e) {
    return String(e?.message || 'No se pudo enviar el mail');
  }
}
