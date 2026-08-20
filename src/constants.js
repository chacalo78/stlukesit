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

// Borrador del modal de Equipos en sessionStorage: el navegador (Chrome
// "Memory Saver" y similares) puede descartar y recargar una pestaña en
// segundo plano, lo que reinicia todo el estado de React y cierra
// cualquier modal abierto. Guardando lo tipeado acá, ModalEquipo/Equipos
// pueden detectar ese caso al volver a montar y reabrir el modal con los
// datos que ya se habían cargado, en vez de perderlos.
const EQUIPO_MODAL_DRAFT_KEY = 'stlukesit_equipo_modal_draft'

export function leerBorradorEquipo() {
  try {
    const raw = sessionStorage.getItem(EQUIPO_MODAL_DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function guardarBorradorEquipo(form) {
  try {
    sessionStorage.setItem(EQUIPO_MODAL_DRAFT_KEY, JSON.stringify({ form }))
  } catch {
    // sessionStorage no disponible (modo privado, cuota llena, etc.): se
    // pierde el auto-guardado pero el formulario sigue funcionando igual.
  }
}

export function limpiarBorradorEquipo() {
  try {
    sessionStorage.removeItem(EQUIPO_MODAL_DRAFT_KEY)
  } catch {
    // ver comentario en guardarBorradorEquipo
  }
}
