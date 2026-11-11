// Matriz de permisos: unica fuente de verdad de autorizacion (reemplaza las RLS de Supabase).
// puede() es pura (sin base de datos); exige() es el middleware que la aplica.
// Deny by default: rol o accion desconocidos -> false. Rol exacto (sensible a mayusculas).
import { errorHttp } from '../errores.js';

export const ACCIONES = Object.freeze({
  EQUIPOS_LEER: 'equipos:leer',
  EQUIPOS_ESCRIBIR: 'equipos:escribir', // crear/editar/baja/baja definitiva
  MOVIMIENTOS_LEER: 'movimientos:leer',
  MOVIMIENTOS_REGISTRAR: 'movimientos:registrar',
  MOVIMIENTOS_MODIFICAR: 'movimientos:modificar', // editar/borrar
  PRESTAMOS_LEER: 'prestamos:leer',
  PRESTAMOS_CREAR: 'prestamos:crear',
  PRESTAMOS_DEVOLVER: 'prestamos:devolver', // = editar prestamo
  PRESTAMOS_BORRAR: 'prestamos:borrar',
  REPUESTOS_GESTIONAR: 'repuestos:gestionar',
  SOLICITUDES_CREAR: 'solicitudes:crear',
  SOLICITUDES_VER: 'solicitudes:ver', // con recurso { solicitado_por_email }: esa fila; sin recurso: puede listar (ver alcanceSolicitudes)
  SOLICITUDES_RESOLVER: 'solicitudes:resolver',
  FEEDBACK_CREAR: 'feedback:crear',
  FEEDBACK_VER: 'feedback:ver',
  FEEDBACK_MODIFICAR: 'feedback:modificar', // editar/borrar
  USUARIOS_VER: 'usuarios:ver', // con recurso { id }: ese usuario; sin recurso: puede listar (ver alcanceUsuarios)
  USUARIOS_GESTIONAR: 'usuarios:gestionar', // crear/editar/reset; recurso { id?, rol, rolNuevo? }
  USUARIOS_BORRAR: 'usuarios:borrar', // recurso { id, rol }
  USUARIOS_INHABILITAR: 'usuarios:inhabilitar', // recurso { id, rol }
  EXPORTAR: 'exportar:db',
});

const SA = 'super_admin';
const AD = 'admin';
const CO = 'coordinador';
const DI = 'director';
const ROLES = [SA, AD, CO, DI];
const esRol = (r) => typeof r === 'string' && ROLES.includes(r);
const esAdminOSuper = (r) => r === SA || r === AD;

// Acciones que dependen solo del rol del actor.
const POR_ROL = new Map([
  [ACCIONES.EQUIPOS_LEER, [SA, AD, CO, DI]],
  [ACCIONES.EQUIPOS_ESCRIBIR, [SA, AD]],
  [ACCIONES.MOVIMIENTOS_LEER, [SA, AD, CO, DI]],
  [ACCIONES.MOVIMIENTOS_REGISTRAR, [SA, AD, CO]],
  [ACCIONES.MOVIMIENTOS_MODIFICAR, [SA, AD]],
  [ACCIONES.PRESTAMOS_LEER, [SA, AD, CO, DI]],
  [ACCIONES.PRESTAMOS_CREAR, [SA, AD, CO]],
  [ACCIONES.PRESTAMOS_DEVOLVER, [SA, AD, CO]],
  [ACCIONES.PRESTAMOS_BORRAR, [SA, AD]],
  [ACCIONES.REPUESTOS_GESTIONAR, [SA, AD]],
  [ACCIONES.SOLICITUDES_CREAR, [SA, AD, CO]],
  [ACCIONES.SOLICITUDES_RESOLVER, [SA, AD]],
  [ACCIONES.FEEDBACK_CREAR, [SA, AD, CO, DI]],
  [ACCIONES.FEEDBACK_VER, [SA, AD]],
  [ACCIONES.FEEDBACK_MODIFICAR, [SA]],
  [ACCIONES.EXPORTAR, [SA, AD]],
]);

const mismo = (a, b) => a != null && b != null && String(a) === String(b);
const normEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

// Puede el actor gestionar (crear/editar/borrar/reset) una cuenta con rol `objetivo`?
function puedeSobreRol(actor, objetivo) {
  if (actor === SA) return esRol(objetivo);
  if (actor === AD) return objetivo === CO || objetivo === DI;
  return false;
}

function gestionar(usuario, recurso) {
  if (!recurso || !esRol(recurso.rol)) return false;
  if (!puedeSobreRol(usuario.rol, recurso.rol)) return false;
  const { rolNuevo } = recurso;
  if (rolNuevo !== undefined && rolNuevo !== null) {
    if (!esRol(rolNuevo) || !puedeSobreRol(usuario.rol, rolNuevo)) return false;
    // Nadie cambia su propio rol.
    if (mismo(usuario.id, recurso.id) && rolNuevo !== recurso.rol) return false;
  }
  return true;
}

export function puede(usuario, accion, recurso) {
  if (!usuario || !esRol(usuario.rol) || typeof accion !== 'string') return false;
  const rol = usuario.rol;

  const permitidos = POR_ROL.get(accion);
  if (permitidos) return permitidos.includes(rol);

  switch (accion) {
    case ACCIONES.SOLICITUDES_VER:
      if (rol === SA || rol === AD) return true;
      if (rol !== CO) return false;
      if (recurso === undefined || recurso === null) return true;
      {
        const mia = normEmail(usuario.email);
        return mia !== '' && normEmail(recurso.solicitado_por_email) === mia;
      }
    case ACCIONES.USUARIOS_VER:
      if (rol === SA || rol === AD) return true;
      if (recurso === undefined || recurso === null) return true;
      return mismo(usuario.id, recurso.id);
    case ACCIONES.USUARIOS_GESTIONAR:
      return gestionar(usuario, recurso);
    case ACCIONES.USUARIOS_BORRAR:
      if (!recurso || mismo(usuario.id, recurso.id)) return false;
      return gestionar(usuario, { id: recurso.id, rol: recurso.rol });
    case ACCIONES.USUARIOS_INHABILITAR:
      // Nadie inhabilita a un admin/super_admin, ni a si mismo.
      if (!recurso || mismo(usuario.id, recurso.id) || esAdminOSuper(recurso.rol)) return false;
      return gestionar(usuario, { id: recurso.id, rol: recurso.rol });
    default:
      return false;
  }
}

export function alcanceSolicitudes(usuario) {
  if (!usuario) return 'ninguna';
  if (usuario.rol === SA || usuario.rol === AD) return 'todas';
  if (usuario.rol === CO) return 'propias';
  return 'ninguna';
}

export function alcanceUsuarios(usuario) {
  return usuario && (usuario.rol === SA || usuario.rol === AD) ? 'todos' : 'propio';
}

export function exige(accion, obtenerRecurso) {
  return async (req, _res, next) => {
    try {
      if (!req.usuario) throw errorHttp(401, 'No autenticado');
      let recurso;
      if (obtenerRecurso) {
        recurso = await obtenerRecurso(req);
        if (recurso === null || recurso === undefined) throw errorHttp(404, 'No encontrado');
      }
      if (!puede(req.usuario, accion, recurso)) {
        throw errorHttp(403, 'No tenés permiso para realizar esta acción');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
