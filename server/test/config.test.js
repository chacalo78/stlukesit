import { describe, it, expect } from 'vitest';
import { leerConfig } from '../src/config.js';

const base = {
  DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'n', SESSION_SECRET: 's'.repeat(32),
  APP_URL: 'https://inventario.chacalo.com.ar', CORS_ORIGINS: 'https://inventario.chacalo.com.ar',
  SMTP_HOST: 'smtp.x', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_FROM_EMAIL: 'a@b.c',
};

describe('leerConfig', () => {
  it('config mínima válida; defaults', () => {
    const c = leerConfig(base);
    expect(c.trustProxy).toBe(1);
    expect(c.diagnostico).toBe(false);
    expect(c.smtp.fromName).toBe('Sistema IT de ST. Luke´s');
  });
  it('lista en español lo que falta (CORS y SMTP incluidos)', () => {
    const { CORS_ORIGINS, SMTP_HOST, SMTP_PASS, ...resto } = base;
    expect(() => leerConfig(resto)).toThrow(/Faltan variables de entorno: .*CORS_ORIGINS.*SMTP_HOST.*SMTP_PASS/);
    expect(() => leerConfig({ ...base, CORS_ORIGINS: ' , ' })).toThrow(/CORS_ORIGINS/);
  });
  it('normaliza orígenes: trim, barra final, esquema y host en minúsculas, sin duplicados', () => {
    const c = leerConfig({ ...base, CORS_ORIGINS: ' HTTPS://Inventario.Chacalo.com.ar/ , https://beta-inventario.chacalo.com.ar, https://inventario.chacalo.com.ar' });
    expect(c.corsOrigins).toEqual(['https://inventario.chacalo.com.ar', 'https://beta-inventario.chacalo.com.ar']);
  });
  it('SESSION_SECRET de al menos 32 caracteres', () => {
    expect(() => leerConfig({ ...base, SESSION_SECRET: 'corto' })).toThrow(/SESSION_SECRET.*32/);
  });
  it('TRUST_PROXY: entero no negativo, default 1; si no, falla', () => {
    expect(leerConfig({ ...base, TRUST_PROXY: '2' }).trustProxy).toBe(2);
    expect(leerConfig({ ...base, TRUST_PROXY: '0' }).trustProxy).toBe(0);
    for (const malo of ['-1', 'x', '1.5', 'true']) expect(() => leerConfig({ ...base, TRUST_PROXY: malo })).toThrow(/TRUST_PROXY/);
  });
  it('DIAGNOSTICO solo con "1"', () => {
    expect(leerConfig({ ...base, DIAGNOSTICO: '1' }).diagnostico).toBe(true);
    expect(leerConfig({ ...base, DIAGNOSTICO: '0' }).diagnostico).toBe(false);
  });
});
