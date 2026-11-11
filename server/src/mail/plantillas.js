// Plantillas de mail. Funciones puras: devuelven { asunto, html }.
// El HTML es el de las Edge Functions de Supabase (notify-prestamo, notify-password-changed, reset-password) y el
// template de recuperación de Supabase Auth, con todo valor interpolado escapado.

export function esc(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatFecha(fecha) {
  if (!fecha) return '-';
  try {
    return new Date(`${fecha}T00:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return fecha;
  }
}

function formatFechaHora(fecha) {
  if (!fecha) return '-';
  try {
    return new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' });
  } catch {
    return fecha;
  }
}

const equipoDescripcion = (d) => [d.tipo, d.marca, d.modelo].filter(Boolean).join(' ') || 'Equipo';

export function prestamo(datos = {}) {
  const opts = datos;
  const equipoDesc = esc(equipoDescripcion(opts));
  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a150b; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px; background-color:#152116; border:1px solid #3a5a3d; border-radius:14px; overflow:hidden; font-family:Arial, Helvetica, sans-serif;">
          <tr>
            <td align="center" style="padding:32px 32px 20px;">
              <img src="https://inventario.chacalo.com.ar/logo.png" alt="St. Luke's College" width="90" style="display:block; margin:0 auto 12px;" />
              <div style="color:#c8a44a; font-size:16px; font-weight:bold; letter-spacing:.5px;">St. Luke's College</div>
              <div style="color:#5c7a5e; font-size:11px; margin-top:2px;">Sistema de IT</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none; border-top:1px solid #3a5a3d; margin:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px; color:#e8f0e8; font-size:14px; line-height:1.6;">
              <p style="margin:0 0 12px;">Hola${opts.persona ? ` ${esc(opts.persona)}` : ''},</p>
              <p style="margin:0 0 16px;">Se registró un préstamo de equipo a tu nombre. Estos son los detalles:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1c2e1e; border:1px solid #2a3f2c; border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px; border-bottom:1px solid #2a3f2c;">Equipo</td>
                  <td style="padding:14px 16px; color:#e8f0e8; font-size:13px; text-align:right; border-bottom:1px solid #2a3f2c;">${equipoDesc}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px; border-bottom:1px solid #2a3f2c;">N° inventario</td>
                  <td style="padding:14px 16px; color:#e8f0e8; font-size:13px; text-align:right; border-bottom:1px solid #2a3f2c;">${esc(opts.numeroInventario || '-')}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px;">Fecha de devolución</td>
                  <td style="padding:14px 16px; color:#c8a44a; font-size:13px; text-align:right; font-weight:bold;">${esc(formatFecha(opts.fechaDevolucion))}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px; color:#9ab89c; font-size:12px; line-height:1.5;">
              Por favor, devolvé el equipo antes de la fecha indicada. Ante cualquier duda, contactá al área de IT.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
  return { asunto: 'Préstamo de equipo registrado', html };
}

export function devolucion(datos = {}) {
  const opts = datos;
  const equipoDesc = esc(equipoDescripcion(opts));
  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a150b; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px; background-color:#152116; border:1px solid #3a5a3d; border-radius:14px; overflow:hidden; font-family:Arial, Helvetica, sans-serif;">
          <tr>
            <td align="center" style="padding:32px 32px 20px;">
              <img src="https://inventario.chacalo.com.ar/logo.png" alt="St. Luke's College" width="90" style="display:block; margin:0 auto 12px;" />
              <div style="color:#c8a44a; font-size:16px; font-weight:bold; letter-spacing:.5px;">St. Luke's College</div>
              <div style="color:#5c7a5e; font-size:11px; margin-top:2px;">Sistema de IT</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none; border-top:1px solid #3a5a3d; margin:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px; color:#e8f0e8; font-size:14px; line-height:1.6;">
              <p style="margin:0 0 12px;">Hola${opts.persona ? ` ${esc(opts.persona)}` : ''},</p>
              <p style="margin:0 0 16px;">Se registró la devolución de un equipo a tu nombre. Estos son los detalles:</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1c2e1e; border:1px solid #2a3f2c; border-radius:10px;">
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px; border-bottom:1px solid #2a3f2c;">Equipo</td>
                  <td style="padding:14px 16px; color:#e8f0e8; font-size:13px; text-align:right; border-bottom:1px solid #2a3f2c;">${equipoDesc}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px; ${opts.observaciones ? 'border-bottom:1px solid #2a3f2c;' : ''}">N° inventario</td>
                  <td style="padding:14px 16px; color:#e8f0e8; font-size:13px; text-align:right; ${opts.observaciones ? 'border-bottom:1px solid #2a3f2c;' : ''}">${esc(opts.numeroInventario || '-')}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px; ${opts.observaciones ? 'border-bottom:1px solid #2a3f2c;' : ''}">Fecha de devolución</td>
                  <td style="padding:14px 16px; color:#c8a44a; font-size:13px; text-align:right; font-weight:bold; ${opts.observaciones ? 'border-bottom:1px solid #2a3f2c;' : ''}">${esc(formatFechaHora(opts.fechaDevolucion))}</td>
                </tr>
                ${opts.observaciones ? `
                <tr>
                  <td style="padding:14px 16px; color:#9ab89c; font-size:12px;">Observaciones</td>
                  <td style="padding:14px 16px; color:#e8f0e8; font-size:13px; text-align:right;">${esc(opts.observaciones)}</td>
                </tr>` : ''}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px; color:#9ab89c; font-size:12px; line-height:1.5;">
              Gracias por devolver el equipo. Ante cualquier duda, contactá al área de IT.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
  return { asunto: 'Devolución de equipo registrada', html };
}

export const MOTIVO_CAMBIO_PROPIO = 'Este cambio lo hiciste vos mismo desde el sistema.';
export const MOTIVO_ADMIN = 'Un administrador del sistema restableció tu contraseña.';

export function passwordCambiada(motivo) {
  const html = `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a150b; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px; background-color:#152116; border:1px solid #3a5a3d; border-radius:14px; overflow:hidden; font-family:Arial, Helvetica, sans-serif;">
          <tr>
            <td align="center" style="padding:32px 32px 20px;">
              <img src="https://inventario.chacalo.com.ar/logo.png" alt="St. Luke's College" width="90" style="display:block; margin:0 auto 12px;" />
              <div style="color:#c8a44a; font-size:16px; font-weight:bold; letter-spacing:.5px;">St. Luke's College</div>
              <div style="color:#5c7a5e; font-size:11px; margin-top:2px;">Sistema de IT</div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px;">
              <hr style="border:none; border-top:1px solid #3a5a3d; margin:0;" />
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 28px; color:#e8f0e8; font-size:14px; line-height:1.6;">
              <p style="margin:0 0 12px;">Tu contraseña de acceso al Sistema de IT fue actualizada correctamente.</p>
              <p style="margin:0 0 16px; color:#9ab89c; font-size:12px;">${esc(motivo)}</p>
              <p style="margin:0; color:#e25555; font-size:12px;">Si no fuiste vos quien hizo este cambio, contactá a un administrador del sistema de inmediato.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
  return { asunto: 'Tu contraseña fue actualizada', html };
}

// Restablecida por un admin: mismo mail que "cambiada" con el motivo de reset-password.
export const passwordRestablecida = () => passwordCambiada(MOTIVO_ADMIN);

export function recuperacion(link) {
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a150b; padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px; background-color:#152116; border:1px solid #3a5a3d; border-radius:14px; overflow:hidden; font-family:Arial, Helvetica, sans-serif;">
        <tr>
          <td align="center" style="padding:32px 32px 20px;">
            <img src="https://inventario.chacalo.com.ar/logo.png" alt="St. Luke's College" width="90" style="display:block; margin:0 auto 12px;" />
            <div style="color:#c8a44a; font-size:16px; font-weight:bold; letter-spacing:.5px;">St. Luke's College</div>
            <div style="color:#5c7a5e; font-size:11px; margin-top:2px;">Sistema de IT</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <hr style="border:none; border-top:1px solid #3a5a3d; margin:0;" />
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px; color:#e8f0e8; font-size:14px; line-height:1.5;">
            Recibimos un pedido para restablecer la contraseña de tu cuenta en el Sistema de IT.
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;" align="center">
            <a href="${esc(link)}" target="_blank" style="display:inline-block; background-color:#c8a44a; color:#1a1a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 28px; border-radius:6px;">
              Restablecer contraseña
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px; color:#9ab89c; font-size:12px; line-height:1.5;">
            Si vos no pediste este cambio, podés ignorar este correo — tu contraseña actual sigue siendo válida.
          </td>
        </tr>
      </table>
      <div style="color:#5c7a5e; font-size:11px; margin-top:16px; font-family:Arial, Helvetica, sans-serif;">
        St. Luke's College · Sistema de IT
      </div>
    </td>
  </tr>
</table>
`;
  return { asunto: 'Restablecer Contraseña', html };
}

// Nueva: misma estética que la recuperación.
export function invitacion(link, nombre) {
  const saludo = nombre ? `Hola ${esc(nombre)}, ` : '';
  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a150b; padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px; background-color:#152116; border:1px solid #3a5a3d; border-radius:14px; overflow:hidden; font-family:Arial, Helvetica, sans-serif;">
        <tr>
          <td align="center" style="padding:32px 32px 20px;">
            <img src="https://inventario.chacalo.com.ar/logo.png" alt="St. Luke's College" width="90" style="display:block; margin:0 auto 12px;" />
            <div style="color:#c8a44a; font-size:16px; font-weight:bold; letter-spacing:.5px;">St. Luke's College</div>
            <div style="color:#5c7a5e; font-size:11px; margin-top:2px;">Sistema de IT</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <hr style="border:none; border-top:1px solid #3a5a3d; margin:0;" />
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 8px; color:#e8f0e8; font-size:14px; line-height:1.5;">
            <div style="color:#c8a44a; font-size:16px; font-weight:bold; margin-bottom:12px;">Te damos la bienvenida al Sistema de IT</div>
            ${saludo}te creamos una cuenta para que puedas ingresar al Sistema de IT. Para empezar, creá tu contraseña con el botón de abajo.
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;" align="center">
            <a href="${esc(link)}" target="_blank" style="display:inline-block; background-color:#c8a44a; color:#1a1a0a; text-decoration:none; font-weight:bold; font-size:14px; padding:12px 28px; border-radius:6px;">
              Crear mi contraseña
            </a>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px; color:#9ab89c; font-size:12px; line-height:1.5;">
            El enlace es válido por 72 horas y se puede usar una sola vez. Si pasó ese tiempo, pedile a un administrador que te envíe otra invitación.
          </td>
        </tr>
      </table>
      <div style="color:#5c7a5e; font-size:11px; margin-top:16px; font-family:Arial, Helvetica, sans-serif;">
        St. Luke's College · Sistema de IT
      </div>
    </td>
  </tr>
</table>
`;
  return { asunto: 'Te damos la bienvenida al Sistema de IT', html };
}
