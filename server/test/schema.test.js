import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { crearDbDeTest, limpiar } from './helpers.js';

let db;
beforeAll(async () => { db = await crearDbDeTest(); });
afterAll(() => limpiar(db));

async function nuevoEquipo(extra = {}) {
  const id = randomUUID();
  const e = { tipo: 'Notebook', ...extra };
  await db.query('INSERT INTO equipos SET id = ?, ?', [id, e]);
  return id;
}

describe('esquema', () => {
  it('equipos.estado fuera de la lista falla', async () => {
    await expect(nuevoEquipo({ estado: 'Inexistente' })).rejects.toThrow();
  });

  it('equipos.estado tiene default Activo', async () => {
    const id = await nuevoEquipo();
    const [[r]] = await db.query('SELECT estado FROM equipos WHERE id = ?', [id]);
    expect(r.estado).toBe('Activo');
  });

  it('borrar un equipo borra sus movimientos', async () => {
    const id = await nuevoEquipo();
    await db.query('INSERT INTO movimientos (id, equipo_id, tipo_movimiento) VALUES (?, ?, ?)', [randomUUID(), id, 'Alta']);
    await db.query('DELETE FROM equipos WHERE id = ?', [id]);
    const [rows] = await db.query('SELECT 1 FROM movimientos WHERE equipo_id = ?', [id]);
    expect(rows).toHaveLength(0);
  });

  it('borrar un equipo con préstamo falla por FK', async () => {
    const id = await nuevoEquipo();
    await db.query(
      'INSERT INTO prestamos (id, equipo_id, persona, fecha_devolucion_estimada) VALUES (?, ?, ?, ?)',
      [randomUUID(), id, 'Ana', '2030-01-01'],
    );
    await expect(db.query('DELETE FROM equipos WHERE id = ?', [id])).rejects.toThrow();
  });

  it('email duplicado en usuarios falla', async () => {
    await db.query("INSERT INTO usuarios (id, email, rol) VALUES (?, 'a@x.com', 'admin')", [randomUUID()]);
    await expect(
      db.query("INSERT INTO usuarios (id, email, rol) VALUES (?, 'a@x.com', 'admin')", [randomUUID()]),
    ).rejects.toThrow();
  });

  it("guarda y lee 'Préstamo — Ñandú' idéntico", async () => {
    const id = await nuevoEquipo({ observaciones: 'Préstamo — Ñandú' });
    const [[r]] = await db.query('SELECT observaciones FROM equipos WHERE id = ?', [id]);
    expect(r.observaciones).toBe('Préstamo — Ñandú');
  });

  it('prestamos sin fecha_prestamo toma la fecha de hoy', async () => {
    const id = await nuevoEquipo();
    const pid = randomUUID();
    await db.query(
      'INSERT INTO prestamos (id, equipo_id, persona, fecha_devolucion_estimada) VALUES (?, ?, ?, ?)',
      [pid, id, 'Ana', '2030-01-01'],
    );
    const [[r]] = await db.query('SELECT fecha_prestamo, CURRENT_DATE() AS hoy FROM prestamos WHERE id = ?', [pid]);
    expect(r.fecha_prestamo).toBe(String(r.hoy).slice(0, 10));
  });

  it("usuarios.rol='usuario' es rechazado", async () => {
    await expect(
      db.query("INSERT INTO usuarios (id, email, rol) VALUES (?, 'b@x.com', 'usuario')", [randomUUID()]),
    ).rejects.toThrow();
  });

  it('equipos.updated_at cambia en un UPDATE', async () => {
    const id = await nuevoEquipo();
    await db.query("UPDATE equipos SET updated_at = '2000-01-01 00:00:00.000' WHERE id = ?", [id]);
    await db.query("UPDATE equipos SET marca = 'HP' WHERE id = ?", [id]);
    const [[r]] = await db.query("SELECT updated_at > '2000-01-02' AS cambio FROM equipos WHERE id = ?", [id]);
    expect(Number(r.cambio)).toBe(1);
  });

  it('columna JSON guarda y devuelve un objeto', async () => {
    const obj = { tipo: 'Notebook', n: 3, ñ: ['á'] };
    const id = randomUUID();
    await db.query(
      "INSERT INTO solicitudes_cambio (id, tipo_accion, datos_propuestos) VALUES (?, 'Alta', ?)",
      [id, JSON.stringify(obj)],
    );
    const [[r]] = await db.query('SELECT datos_propuestos, estado FROM solicitudes_cambio WHERE id = ?', [id]);
    const v = typeof r.datos_propuestos === 'string' ? JSON.parse(r.datos_propuestos) : r.datos_propuestos;
    expect(v).toEqual(obj);
    expect(r.estado).toBe('Pendiente');
  });

  describe('enumeraciones exactas (CHECK binario)', () => {
    const ESTADOS = ['Activo', 'En reparación', 'Requiere atención', 'De baja', 'En depósito', 'Prestado', 'Baja Definitiva'];
    const MOVS = ['Alta', 'Baja', 'Modificación', 'Traslado', 'Reparación', 'Préstamo', 'Devolución', 'Alta usuario',
      'Modificación usuario', 'Baja usuario', 'Inhabilitado', 'Habilitado', 'Restablecimiento de contraseña', 'Baja Definitiva'];
    const esCheck = (e) => [4025, 3819].includes(e.errno) || ['ER_CONSTRAINT_FAILED', 'ER_CHECK_CONSTRAINT_VIOLATED'].includes(e.code);
    const rechazaCheck = async (p) => {
      const e = await p.then(() => null, (x) => x);
      expect(e, 'debía fallar').not.toBeNull();
      expect(esCheck(e), `no es violación de CHECK: ${e.code} ${e.errno}`).toBe(true);
    };

    it.each(ESTADOS)('equipos.estado %s se acepta', async (estado) => {
      await expect(nuevoEquipo({ estado })).resolves.toBeTruthy();
    });

    it.each(MOVS)('movimientos.tipo_movimiento %s se acepta', async (t) => {
      await db.query('INSERT INTO movimientos (id, tipo_movimiento) VALUES (?, ?)', [randomUUID(), t]);
    });

    it.each(['En reparacion', 'activo'])("equipos.estado '%s' se rechaza por CHECK", (estado) =>
      rechazaCheck(nuevoEquipo({ estado })));

    it("movimientos.tipo_movimiento 'Prestamo' se rechaza por CHECK", () =>
      rechazaCheck(db.query("INSERT INTO movimientos (id, tipo_movimiento) VALUES (?, 'Prestamo')", [randomUUID()])));

    it("usuarios.rol 'Admin' se rechaza por CHECK", () =>
      rechazaCheck(db.query("INSERT INTO usuarios (id, email, rol) VALUES (?, 'c@x.com', 'Admin')", [randomUUID()])));
  });
});
