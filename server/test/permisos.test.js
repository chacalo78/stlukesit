import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  ACCIONES, puede, alcanceSolicitudes, alcanceUsuarios, exige,
} from '../src/auth/permisos.js';

const ROLES = ['super_admin', 'admin', 'coordinador', 'director'];
const u = (rol, id = 1, email = 'yo@x.cl') => ({ id, email, rol });

// [accion, [super_admin, admin, coordinador, director]] -- valores escritos a mano.
const SIMPLES = [
  ['EQUIPOS_LEER', [true, true, true, true]],
  ['EQUIPOS_ESCRIBIR', [true, true, false, false]],
  ['MOVIMIENTOS_LEER', [true, true, true, true]],
  ['MOVIMIENTOS_REGISTRAR', [true, true, true, false]],
  ['MOVIMIENTOS_MODIFICAR', [true, true, false, false]],
  ['PRESTAMOS_LEER', [true, true, true, true]],
  ['PRESTAMOS_CREAR', [true, true, true, false]],
  ['PRESTAMOS_DEVOLVER', [true, true, true, false]],
  ['PRESTAMOS_BORRAR', [true, true, false, false]],
  ['REPUESTOS_GESTIONAR', [true, true, false, false]],
  ['SOLICITUDES_CREAR', [true, true, true, false]],
  ['SOLICITUDES_VER', [true, true, true, false]], // sin recurso = "puede listar (con alcance)"
  ['SOLICITUDES_RESOLVER', [true, true, false, false]],
  ['FEEDBACK_CREAR', [true, true, true, true]],
  ['FEEDBACK_VER', [true, true, false, false]],
  ['FEEDBACK_MODIFICAR', [true, false, false, false]],
  ['USUARIOS_VER', [true, true, true, true]], // sin recurso = "puede listar (con alcance)"
  ['EXPORTAR', [true, true, false, false]],
];

describe('matriz simple: rol x accion', () => {
  for (const [nombre, esperado] of SIMPLES) {
    ROLES.forEach((rol, i) => {
      it(`${nombre} / ${rol} -> ${esperado[i]}`, () => {
        expect(puede(u(rol), ACCIONES[nombre])).toBe(esperado[i]);
      });
    });
  }
  it('la tabla cubre todas las acciones simples (sin las dependientes del objetivo)', () => {
    const dep = ['USUARIOS_GESTIONAR', 'USUARIOS_BORRAR', 'USUARIOS_INHABILITAR'];
    const cubiertas = [...SIMPLES.map((s) => s[0]), ...dep].sort();
    expect(Object.keys(ACCIONES).sort()).toEqual(cubiertas);
  });
  it('ACCIONES congelado, valores string unicos', () => {
    expect(Object.isFrozen(ACCIONES)).toBe(true);
    const v = Object.values(ACCIONES);
    expect(new Set(v).size).toBe(v.length);
    expect(v.every((x) => typeof x === 'string')).toBe(true);
    expect(ACCIONES.EQUIPOS_LEER).toBe('equipos:leer');
  });
});

describe('SOLICITUDES_VER con fila concreta', () => {
  const propia = { solicitado_por_email: 'yo@x.cl' };
  const ajena = { solicitado_por_email: 'otro@x.cl' };
  // [rol, propia, ajena]
  const tabla = [
    ['super_admin', true, true],
    ['admin', true, true],
    ['coordinador', true, false],
    ['director', false, false],
  ];
  for (const [rol, p, a] of tabla) {
    it(`${rol}: propia ${p}, ajena ${a}`, () => {
      expect(puede(u(rol), ACCIONES.SOLICITUDES_VER, propia)).toBe(p);
      expect(puede(u(rol), ACCIONES.SOLICITUDES_VER, ajena)).toBe(a);
    });
  }
  it('coordinador: email sin importar mayusculas; vacio/ausente deniega', () => {
    expect(puede(u('coordinador', 1, 'Yo@X.cl'), ACCIONES.SOLICITUDES_VER, propia)).toBe(true);
    expect(puede(u('coordinador'), ACCIONES.SOLICITUDES_VER, { solicitado_por_email: '' })).toBe(false);
    expect(puede(u('coordinador'), ACCIONES.SOLICITUDES_VER, {})).toBe(false);
    expect(puede(u('coordinador', 1, ''), ACCIONES.SOLICITUDES_VER, { solicitado_por_email: '' })).toBe(false);
  });
});

describe('USUARIOS_VER con objetivo', () => {
  // [rol, a si mismo, a otro]
  const tabla = [
    ['super_admin', true, true],
    ['admin', true, true],
    ['coordinador', true, false],
    ['director', true, false],
  ];
  for (const [rol, yo, otro] of tabla) {
    it(`${rol}: si mismo ${yo}, otro ${otro}`, () => {
      expect(puede(u(rol, 5), ACCIONES.USUARIOS_VER, { id: 5, rol })).toBe(yo);
      expect(puede(u(rol, 5), ACCIONES.USUARIOS_VER, { id: 6, rol: 'director' })).toBe(otro);
    });
  }
});

describe('alcances', () => {
  it('alcanceSolicitudes', () => {
    expect(alcanceSolicitudes(u('super_admin'))).toBe('todas');
    expect(alcanceSolicitudes(u('admin'))).toBe('todas');
    expect(alcanceSolicitudes(u('coordinador'))).toBe('propias');
    expect(alcanceSolicitudes(u('director'))).toBe('ninguna');
    expect(alcanceSolicitudes(u('root'))).toBe('ninguna');
    expect(alcanceSolicitudes(null)).toBe('ninguna');
  });
  it('alcanceUsuarios', () => {
    expect(alcanceUsuarios(u('super_admin'))).toBe('todos');
    expect(alcanceUsuarios(u('admin'))).toBe('todos');
    expect(alcanceUsuarios(u('coordinador'))).toBe('propio');
    expect(alcanceUsuarios(u('director'))).toBe('propio');
    expect(alcanceUsuarios(u('root'))).toBe('propio');
    expect(alcanceUsuarios(undefined)).toBe('propio');
  });
});

// Actor id=1; objetivo ajeno id=2. Filas: [actor, rolObjetivo, esperado GESTIONAR, BORRAR, INHABILITAR]
const T = true; const F = false;
const OBJ = [
  // actor super_admin
  ['super_admin', 'super_admin', T, T, F],
  ['super_admin', 'admin', T, T, F],
  ['super_admin', 'coordinador', T, T, T],
  ['super_admin', 'director', T, T, T],
  // actor admin
  ['admin', 'super_admin', F, F, F],
  ['admin', 'admin', F, F, F],
  ['admin', 'coordinador', T, T, T],
  ['admin', 'director', T, T, T],
  // coordinador / director: nada
  ['coordinador', 'super_admin', F, F, F],
  ['coordinador', 'admin', F, F, F],
  ['coordinador', 'coordinador', F, F, F],
  ['coordinador', 'director', F, F, F],
  ['director', 'super_admin', F, F, F],
  ['director', 'admin', F, F, F],
  ['director', 'coordinador', F, F, F],
  ['director', 'director', F, F, F],
];

describe('usuarios: actor x rol del objetivo (otro usuario)', () => {
  for (const [actor, objetivo, g, b, i] of OBJ) {
    it(`${actor} -> ${objetivo}: gestionar ${g}, borrar ${b}, inhabilitar ${i}`, () => {
      const rec = { id: 2, rol: objetivo };
      expect(puede(u(actor), ACCIONES.USUARIOS_GESTIONAR, rec)).toBe(g);
      expect(puede(u(actor), ACCIONES.USUARIOS_BORRAR, rec)).toBe(b);
      expect(puede(u(actor), ACCIONES.USUARIOS_INHABILITAR, rec)).toBe(i);
    });
  }
});

describe('usuarios: uno mismo (id igual)', () => {
  // [rol, gestionar sin cambiar rol, borrar, inhabilitar]
  const tabla = [
    ['super_admin', T, F, F],
    ['admin', F, F, F], // admin no gestiona admin
    ['coordinador', F, F, F],
    ['director', F, F, F],
  ];
  for (const [rol, g, b, i] of tabla) {
    it(`${rol} sobre si mismo: gestionar ${g}, borrar ${b}, inhabilitar ${i}`, () => {
      const rec = { id: 1, rol };
      expect(puede(u(rol), ACCIONES.USUARIOS_GESTIONAR, rec)).toBe(g);
      expect(puede(u(rol), ACCIONES.USUARIOS_BORRAR, rec)).toBe(b);
      expect(puede(u(rol), ACCIONES.USUARIOS_INHABILITAR, rec)).toBe(i);
    });
  }
  it('nadie cambia su propio rol (ni super_admin, ni a otro rol)', () => {
    for (const rolNuevo of ROLES) {
      if (rolNuevo === 'super_admin') continue;
      expect(puede(u('super_admin'), ACCIONES.USUARIOS_GESTIONAR, { id: 1, rol: 'super_admin', rolNuevo })).toBe(false);
    }
    // rolNuevo igual al actual no es un cambio
    expect(puede(u('super_admin'), ACCIONES.USUARIOS_GESTIONAR, { id: 1, rol: 'super_admin', rolNuevo: 'super_admin' })).toBe(true);
  });
});

describe('usuarios: cambio de rol (rolNuevo) sobre otro usuario', () => {
  // [actor, rolActualObjetivo, rolNuevo, esperado]
  const tabla = [
    ['super_admin', 'coordinador', 'admin', T],
    ['super_admin', 'director', 'super_admin', T],
    ['super_admin', 'admin', 'director', T],
    ['super_admin', 'super_admin', 'coordinador', T],
    ['super_admin', 'coordinador', 'director', T],
    ['admin', 'coordinador', 'director', T],
    ['admin', 'director', 'coordinador', T],
    ['admin', 'coordinador', 'admin', F], // escalada
    ['admin', 'director', 'super_admin', F], // escalada
    ['admin', 'admin', 'coordinador', F], // degradar admin
    ['admin', 'super_admin', 'director', F],
    ['coordinador', 'director', 'coordinador', F],
    ['director', 'coordinador', 'director', F],
    ['coordinador', 'coordinador', 'admin', F],
    ['director', 'director', 'super_admin', F],
  ];
  for (const [actor, actual, nuevo, esp] of tabla) {
    it(`${actor}: ${actual} -> ${nuevo} = ${esp}`, () => {
      expect(puede(u(actor), ACCIONES.USUARIOS_GESTIONAR, { id: 2, rol: actual, rolNuevo: nuevo })).toBe(esp);
    });
  }
  it('rolNuevo desconocido deniega', () => {
    expect(puede(u('super_admin'), ACCIONES.USUARIOS_GESTIONAR, { id: 2, rol: 'director', rolNuevo: 'root' })).toBe(false);
    expect(puede(u('super_admin'), ACCIONES.USUARIOS_GESTIONAR, { id: 2, rol: 'director', rolNuevo: 'Admin' })).toBe(false);
  });
});

describe('usuarios: crear (recurso sin id, rol = rol de la cuenta nueva)', () => {
  const tabla = [
    ['super_admin', 'super_admin', T], ['super_admin', 'admin', T], ['super_admin', 'coordinador', T], ['super_admin', 'director', T],
    ['admin', 'super_admin', F], ['admin', 'admin', F], ['admin', 'coordinador', T], ['admin', 'director', T],
    ['coordinador', 'director', F], ['director', 'director', F],
  ];
  for (const [actor, rol, esp] of tabla) {
    it(`${actor} crea ${rol} = ${esp}`, () => {
      expect(puede(u(actor), ACCIONES.USUARIOS_GESTIONAR, { rol })).toBe(esp);
    });
  }
});

describe('deny by default', () => {
  const rec = { id: 2, rol: 'director' };
  it('rol desconocido / mayusculas / vacio', () => {
    for (const rol of ['root', 'Admin', 'SUPER_ADMIN', 'usuario', 'viewer', '', null, undefined, 5]) {
      for (const a of Object.values(ACCIONES)) {
        expect(puede({ id: 1, email: 'yo@x.cl', rol }, a, rec)).toBe(false);
        expect(puede({ id: 1, email: 'yo@x.cl', rol }, a)).toBe(false);
      }
    }
  });
  it('accion desconocida o invalida', () => {
    for (const a of ['equipos:borrar', '', null, undefined, 'toString', '__proto__', 'constructor', 42]) {
      for (const rol of ROLES) expect(puede(u(rol), a, rec)).toBe(false);
    }
  });
  it('usuario ausente', () => {
    expect(puede(null, ACCIONES.EQUIPOS_LEER)).toBe(false);
    expect(puede(undefined, ACCIONES.EQUIPOS_LEER)).toBe(false);
  });
  it('acciones de usuarios sin objetivo deniegan (salvo VER, que es "listar")', () => {
    for (const a of ['USUARIOS_GESTIONAR', 'USUARIOS_BORRAR', 'USUARIOS_INHABILITAR']) {
      for (const rol of ROLES) expect(puede(u(rol), ACCIONES[a])).toBe(false);
    }
  });
  it('objetivo con rol desconocido deniega', () => {
    for (const a of ['USUARIOS_GESTIONAR', 'USUARIOS_BORRAR', 'USUARIOS_INHABILITAR']) {
      expect(puede(u('super_admin'), ACCIONES[a], { id: 2, rol: 'root' })).toBe(false);
      expect(puede(u('super_admin'), ACCIONES[a], { id: 2 })).toBe(false);
    }
  });
});

describe('exige (middleware)', () => {
  function montar(accion, obtener, usuario) {
    const app = express();
    app.use((req, _res, next) => { if (usuario) req.usuario = usuario; next(); });
    app.get('/x', exige(accion, obtener), (_req, res) => res.json({ ok: true }));
    app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }));
    return app;
  }
  it('401 sin req.usuario', async () => {
    const r = await request(montar(ACCIONES.EQUIPOS_LEER, undefined, null)).get('/x');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'No autenticado' });
  });
  it('403 sin permiso', async () => {
    const r = await request(montar(ACCIONES.EQUIPOS_ESCRIBIR, undefined, u('coordinador'))).get('/x');
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'No tenés permiso para realizar esta acción' });
  });
  it('200 con permiso', async () => {
    const r = await request(montar(ACCIONES.EQUIPOS_ESCRIBIR, undefined, u('admin'))).get('/x');
    expect(r.status).toBe(200);
  });
  it('404 si obtenerRecurso devuelve null', async () => {
    const r = await request(montar(ACCIONES.USUARIOS_GESTIONAR, async () => null, u('admin'))).get('/x');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'No encontrado' });
  });
  it('usa el recurso para decidir (403 / 200)', async () => {
    const a1 = montar(ACCIONES.USUARIOS_GESTIONAR, async () => ({ id: 9, rol: 'admin' }), u('admin'));
    expect((await request(a1).get('/x')).status).toBe(403);
    const a2 = montar(ACCIONES.USUARIOS_GESTIONAR, async () => ({ id: 9, rol: 'director' }), u('admin'));
    expect((await request(a2).get('/x')).status).toBe(200);
  });
  it('recibe req en obtenerRecurso y un throw llega al manejador de errores', async () => {
    let visto;
    const app1 = montar(ACCIONES.USUARIOS_GESTIONAR, async (req) => { visto = req.usuario.id; return { id: 9, rol: 'director' }; }, u('admin', 7));
    await request(app1).get('/x');
    expect(visto).toBe(7);
    const app2 = montar(ACCIONES.USUARIOS_GESTIONAR, async () => { throw new Error('boom'); }, u('admin'));
    expect((await request(app2).get('/x')).status).toBe(500);
  });
  it('accion desconocida -> 403', async () => {
    const r = await request(montar('inventada', undefined, u('super_admin'))).get('/x');
    expect(r.status).toBe(403);
  });
});
