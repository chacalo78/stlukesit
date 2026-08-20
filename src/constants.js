export const ESTADOS_EQUIPO = ['Activo', 'En reparación', 'Requiere atención', 'De baja', 'En depósito', 'Prestado']

export const TIPOS_EQUIPO = ['Desktop', 'Notebook', 'Monitor', 'Impresora', 'Redes', 'UPS', 'Servidor', 'Proyector', 'Otro']

export const CATEGORIAS_REPUESTO = ['RAM', 'Disco', 'Fuente', 'Procesador', 'Periférico', 'Cable/Adaptador', 'Batería', 'Otro']

// Tipos que cuentan como "equipo" en Dashboard y Reportes. El resto
// (Hardware, Netbook, Tablet, etc.) es equipamiento pero no entra en
// esas estadísticas — sigue visible normalmente en Equipos/Exportar DB.
export const TIPOS_REPORTABLES = ['Notebook', 'Desktop', 'Proyector', 'Parlante', 'Impresora', 'Redes']

export const SEDES = ['Nordelta', 'HSM', 'Olivos']

export const SECTORES = ['Nivel Inicial', 'Nivel Primario', 'Nivel Secundario', 'Administración', 'IT', 'Intendencia', 'Enfermería', 'Carrito', 'IT Lab Primario', 'IT Lab Secundario', 'Mini IT Lab', 'Secretaría Académica', 'Preceptoría', 'PVAD', 'SST', 'EF', 'Teatro']

export const CAMPOS_LABEL_EQUIPO = {
  numero_inventario: 'N° Inventario',
  id_red: 'ID de Red',
  tipo: 'Tipo',
  marca: 'Marca',
  modelo: 'Modelo',
  numero_serie: 'N° de Serie',
  estado: 'Estado',
  procesador: 'Procesador',
  ram: 'RAM',
  disco: 'Disco',
  tipo_disco: 'Tipo de Disco',
  sistema_operativo: 'Sistema Operativo',
  ubicacion: 'Sede',
  sector: 'Sector',
  usuario: 'Usuario',
  fecha_adquisicion: 'Fecha de adquisición',
  garantia_hasta: 'Garantía hasta',
  observaciones: 'Observaciones',
}

// Identificador legible de un equipo para logs/descripciones: usa el
// N° de inventario si lo tiene, si no arma "Tipo Marca Modelo" (util
// para equipos sin numero de inventario, ej. Redes/Proyector/Parlante).
export function identificarEquipo(equipo) {
  if (!equipo) return 'equipo'
  return equipo.numero_inventario || [equipo.tipo, equipo.marca, equipo.modelo].filter(Boolean).join(' ') || 'sin datos'
}

// Compara valores anteriores vs propuestos y devuelve, por cada campo
// que cambió, "Campo: 'antes' → 'después'" — para dejar rastro claro
// en movimientos/solicitudes de qué dato se tocó y cómo (clave para
// rastrear reasignaciones de Usuario/Sector, traslados de Sede, etc).
export function camposModificados(anterior, propuesto) {
  return Object.keys(propuesto)
    .filter(k => propuesto[k] !== (anterior?.[k] ?? null))
    .map(k => {
      const label = CAMPOS_LABEL_EQUIPO[k] || k
      const antes = anterior?.[k] ?? '–'
      const despues = propuesto[k] ?? '–'
      return `${label}: "${antes}" → "${despues}"`
    })
}

// Borradores de modales de alta/edición en sessionStorage: el navegador
// (Chrome "Memory Saver" y similares) puede descartar y recargar una
// pestaña en segundo plano, lo que reinicia todo el estado de React y
// cierra cualquier modal abierto. Guardando lo tipeado acá, cada modal
// (junto con su pantalla contenedora) puede detectar ese caso al volver
// a montar y reabrirse con los datos que ya se habían cargado, en vez
// de perderlos. No se usa para datos sensibles (contraseñas).
function leerBorrador(key) {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function guardarBorrador(key, form) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ form }))
  } catch {
    // sessionStorage no disponible (modo privado, cuota llena, etc.): se
    // pierde el auto-guardado pero el formulario sigue funcionando igual.
  }
}

function limpiarBorrador(key) {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ver comentario en guardarBorrador
  }
}

const EQUIPO_MODAL_DRAFT_KEY = 'stlukesit_equipo_modal_draft'
export const leerBorradorEquipo = () => leerBorrador(EQUIPO_MODAL_DRAFT_KEY)
export const guardarBorradorEquipo = (form) => guardarBorrador(EQUIPO_MODAL_DRAFT_KEY, form)
export const limpiarBorradorEquipo = () => limpiarBorrador(EQUIPO_MODAL_DRAFT_KEY)

const PRESTAMO_MODAL_DRAFT_KEY = 'stlukesit_prestamo_modal_draft'
export const leerBorradorPrestamo = () => leerBorrador(PRESTAMO_MODAL_DRAFT_KEY)
export const guardarBorradorPrestamo = (form) => guardarBorrador(PRESTAMO_MODAL_DRAFT_KEY, form)
export const limpiarBorradorPrestamo = () => limpiarBorrador(PRESTAMO_MODAL_DRAFT_KEY)

const REPUESTO_MODAL_DRAFT_KEY = 'stlukesit_repuesto_modal_draft'
export const leerBorradorRepuesto = () => leerBorrador(REPUESTO_MODAL_DRAFT_KEY)
export const guardarBorradorRepuesto = (form) => guardarBorrador(REPUESTO_MODAL_DRAFT_KEY, form)
export const limpiarBorradorRepuesto = () => limpiarBorrador(REPUESTO_MODAL_DRAFT_KEY)

const USUARIO_MODAL_DRAFT_KEY = 'stlukesit_usuario_modal_draft'
export const leerBorradorUsuario = () => leerBorrador(USUARIO_MODAL_DRAFT_KEY)
export const guardarBorradorUsuario = (form) => guardarBorrador(USUARIO_MODAL_DRAFT_KEY, form)
export const limpiarBorradorUsuario = () => limpiarBorrador(USUARIO_MODAL_DRAFT_KEY)
