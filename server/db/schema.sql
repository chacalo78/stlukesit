-- Esquema MySQL 8 / MariaDB 10.x (St. Luke's IT). Solo CREATE TABLE: nunca poner DROP en este archivo.
SET NAMES utf8mb4;

CREATE TABLE usuarios (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(100) NULL,
  nombre VARCHAR(255) NULL,
  rol VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  sede VARCHAR(255) NULL,
  habilitado TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY usuarios_email_key (email),
  CONSTRAINT usuarios_rol_check CHECK (rol IN ('super_admin','admin','coordinador','director'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Formato por defecto de express-mysql-session.
CREATE TABLE sesiones (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  expires INT UNSIGNED NOT NULL,
  data MEDIUMTEXT COLLATE utf8mb4_bin,
  KEY expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE tokens_password (
  id CHAR(36) NOT NULL PRIMARY KEY,
  usuario_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  tipo VARCHAR(20) COLLATE utf8mb4_bin NOT NULL,
  expira_at DATETIME(3) NOT NULL,
  usado_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY tokens_password_token_hash_key (token_hash),
  CONSTRAINT tokens_password_usuario_fk FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE,
  CONSTRAINT tokens_password_tipo_check CHECK (tipo IN ('recuperacion','invitacion'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE equipos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  numero_inventario VARCHAR(255) NULL,
  tipo VARCHAR(255) NOT NULL,
  marca VARCHAR(255) NULL,
  modelo VARCHAR(255) NULL,
  numero_serie VARCHAR(255) NULL,
  estado VARCHAR(50) COLLATE utf8mb4_bin NULL DEFAULT 'Activo',
  ubicacion VARCHAR(255) NULL,
  fecha_adquisicion DATE NULL,
  garantia_hasta DATE NULL,
  observaciones TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  sector VARCHAR(255) NULL,
  usuario VARCHAR(255) NULL,
  id_red VARCHAR(255) NULL,
  procesador VARCHAR(255) NULL,
  ram VARCHAR(255) NULL,
  disco VARCHAR(255) NULL,
  tipo_disco VARCHAR(255) NULL,
  sistema_operativo VARCHAR(255) NULL,
  fecha_baja_definitiva DATETIME(3) NULL,
  dado_de_baja_definitiva_por VARCHAR(255) NULL,
  KEY equipos_numero_inventario_idx (numero_inventario),
  CONSTRAINT equipos_estado_check CHECK (estado IN ('Activo','En reparación','Requiere atención','De baja','En depósito','Prestado','Baja Definitiva'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE movimientos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  equipo_id CHAR(36) NULL,
  tipo_movimiento VARCHAR(50) COLLATE utf8mb4_bin NOT NULL,
  descripcion TEXT NULL,
  usuario VARCHAR(255) NULL,
  fecha DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY movimientos_equipo_id_idx (equipo_id),
  KEY movimientos_fecha_idx (fecha),
  CONSTRAINT movimientos_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES equipos (id) ON DELETE CASCADE,
  CONSTRAINT movimientos_tipo_movimiento_check CHECK (tipo_movimiento IN ('Alta','Baja','Modificación','Traslado','Reparación','Préstamo','Devolución','Alta usuario','Modificación usuario','Baja usuario','Inhabilitado','Habilitado','Restablecimiento de contraseña','Baja Definitiva'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE prestamos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  equipo_id CHAR(36) NOT NULL,
  persona VARCHAR(255) NOT NULL,
  sector VARCHAR(255) NULL,
  fecha_prestamo DATE NOT NULL DEFAULT (CURRENT_DATE),
  fecha_devolucion_estimada DATE NOT NULL,
  fecha_devolucion_real DATETIME(3) NULL,
  observaciones_entrega TEXT NULL,
  registrado_por VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  observaciones_devolucion TEXT NULL,
  email_destinatario VARCHAR(255) NULL,
  KEY prestamos_equipo_id_idx (equipo_id),
  CONSTRAINT prestamos_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES equipos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE repuestos (
  id CHAR(36) NOT NULL PRIMARY KEY,
  categoria VARCHAR(255) NOT NULL DEFAULT 'Otro',
  marca VARCHAR(255) NULL,
  modelo VARCHAR(255) NULL,
  cantidad INT NOT NULL DEFAULT 1,
  ubicacion VARCHAR(255) NULL,
  observaciones TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE solicitudes_cambio (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tipo_accion VARCHAR(50) COLLATE utf8mb4_bin NOT NULL,
  equipo_id CHAR(36) NULL,
  datos_propuestos JSON NOT NULL,
  datos_anteriores JSON NULL,
  estado VARCHAR(50) COLLATE utf8mb4_bin NOT NULL DEFAULT 'Pendiente',
  solicitado_por VARCHAR(255) NULL,
  solicitado_por_email VARCHAR(255) NULL,
  fecha_solicitud DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  resuelto_por VARCHAR(255) NULL,
  fecha_resolucion DATETIME(3) NULL,
  comentario_resolucion TEXT NULL,
  KEY solicitudes_cambio_estado_idx (estado),
  KEY solicitudes_cambio_solicitado_por_email_idx (solicitado_por_email),
  KEY solicitudes_cambio_equipo_id_idx (equipo_id),
  CONSTRAINT solicitudes_cambio_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES equipos (id),
  CONSTRAINT solicitudes_cambio_estado_check CHECK (estado IN ('Pendiente','Aprobado','Rechazado')),
  CONSTRAINT solicitudes_cambio_tipo_accion_check CHECK (tipo_accion IN ('Alta','Modificación','Baja'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE feedback_desarrollador (
  id CHAR(36) NOT NULL PRIMARY KEY,
  tipo VARCHAR(20) COLLATE utf8mb4_bin NOT NULL,
  seccion VARCHAR(255) NOT NULL,
  asunto TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  estado VARCHAR(20) COLLATE utf8mb4_bin NOT NULL DEFAULT 'Nuevo',
  reportado_por VARCHAR(255) NOT NULL,
  reportado_por_email VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT feedback_desarrollador_estado_check CHECK (estado IN ('Nuevo','Resuelto')),
  CONSTRAINT feedback_desarrollador_tipo_check CHECK (tipo IN ('Error','Falla','Mejora'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
