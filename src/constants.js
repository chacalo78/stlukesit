export const ESTADOS_EQUIPO = ['Activo', 'En reparación', 'Requiere atención', 'De baja', 'En depósito', 'Prestado']

export const TIPOS_EQUIPO = ['Desktop', 'Notebook', 'Monitor', 'Impresora', 'Redes', 'UPS', 'Servidor', 'Proyector', 'Otro']

export const CATEGORIAS_REPUESTO = ['RAM', 'Disco', 'Fuente', 'Procesador', 'Periférico', 'Cable/Adaptador', 'Batería', 'Otro']

// Tipos que cuentan como "equipo" en Dashboard y Reportes. El resto
// (Hardware, Netbook, Tablet, etc.) es equipamiento pero no entra en
// esas estadísticas — sigue visible normalmente en Equipos/Exportar DB.
export const TIPOS_REPORTABLES = ['Notebook', 'Desktop', 'Proyector', 'Parlante', 'Impresora', 'Redes']

export const SEDES = ['Nordelta', 'HSM', 'Olivos']

export const SECTORES = ['Nivel Inicial', 'Nivel Primario', 'Nivel Secundario', 'Administración', 'IT', 'Intendencia', 'Enfermería', 'Carrito', 'IT Lab Primario', 'IT Lab Secundario', 'Mini IT Lab', 'Secretaría Académica', 'Preceptoría', 'PVAD', 'SST', 'EF']

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
