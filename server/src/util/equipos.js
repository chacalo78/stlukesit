// Réplica server-side de los helpers de src/constants.js (misma salida, byte a byte).
export const ESTADOS_ESCRITURA = ['Activo', 'En reparación', 'Requiere atención', 'De baja', 'En depósito', 'Prestado'];

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
};

export function identificarEquipo(equipo) {
  if (!equipo) return 'equipo';
  return equipo.numero_inventario || [equipo.tipo, equipo.marca, equipo.modelo].filter(Boolean).join(' ') || 'sin datos';
}

export function camposModificados(anterior, propuesto) {
  return Object.keys(propuesto)
    .filter((k) => propuesto[k] !== (anterior?.[k] ?? null))
    .map((k) => {
      const label = CAMPOS_LABEL_EQUIPO[k] || k;
      const antes = anterior?.[k] ?? '–';
      const despues = propuesto[k] ?? '–';
      return `${label}: "${antes}" → "${despues}"`;
    });
}
