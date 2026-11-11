export function errorHttp(status, mensaje) {
  const e = new Error(mensaje);
  e.status = status;
  return e;
}
