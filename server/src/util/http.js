import { errorHttp } from '../errores.js';

// Valida req.body con zod y deja el resultado en req.datos. Solo se devuelven al cliente los mensajes
// escritos en español en el schema (empiezan con La/El/Los/Las); el resto es 'Datos inválidos'.
export const validar = (schema) => (req, _res, next) => {
  const r = schema.safeParse(req.body ?? {});
  if (!r.success) {
    const i = r.error.issues[0];
    if (i?.code === 'unrecognized_keys') return next(errorHttp(400, `Campos no permitidos: ${i.keys.join(', ')}`));
    return next(errorHttp(400, /^(La|El|Los|Las) /.test(i?.message ?? '') ? i.message : 'Datos inválidos'));
  }
  req.datos = r.data;
  next();
};

export const envolver = (fn) => (req, res, next) => fn(req, res).catch(next);
