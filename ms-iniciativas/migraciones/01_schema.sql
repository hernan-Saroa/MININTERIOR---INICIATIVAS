-- =====================================================================
-- Proyecto: Iniciativas Legislativas · Viceministerio para el Diálogo
--           Social y los Derechos Humanos · Ministerio del Interior
-- Motor: MySQL 8.0+ / MariaDB 10.5+
-- Archivo: 01_schema.sql — creación de base de datos y tablas
-- =====================================================================

CREATE DATABASE IF NOT EXISTS iniciativas_legislativas
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE iniciativas_legislativas;

-- ---------------------------------------------------------------------
-- Tabla: direcciones
-- Las direcciones vinculadas al Viceministerio
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS direcciones (
  id              VARCHAR(30)   NOT NULL PRIMARY KEY,
  nombre          VARCHAR(255)  NOT NULL,
  nombre_corto    VARCHAR(100)  NOT NULL,
  descripcion     TEXT          NULL,
  orden           INT           NOT NULL DEFAULT 0,
  creado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: iniciativas
-- Cada iniciativa legislativa pertenece a una dirección
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS iniciativas (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  direccion_id        VARCHAR(30)   NOT NULL,
  nombre              VARCHAR(500)  NOT NULL,
  objeto              TEXT          NULL,
  numero_proyecto     VARCHAR(150)  NULL,
  estado              ENUM('En formulación','Radicado','En comisión','Aprobado','Archivado')
                        NOT NULL DEFAULT 'En formulación',
  prioridad           ENUM('Alta','Media','Baja') NOT NULL DEFAULT 'Media',
  fecha_actualizacion DATE          NULL,
  fuente_publica      BOOLEAN       NOT NULL DEFAULT FALSE,
  activo              BOOLEAN       NOT NULL DEFAULT TRUE,
  creado_en           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
                        ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_iniciativas_direccion
    FOREIGN KEY (direccion_id) REFERENCES direcciones(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_direccion (direccion_id),
  INDEX idx_estado (estado),
  INDEX idx_prioridad (prioridad)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: documentos
-- Documentos (enlaces al repositorio institucional) por iniciativa
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documentos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  iniciativa_id   INT           NOT NULL,
  nombre          VARCHAR(500)  NOT NULL,
  enlace          VARCHAR(1000) NULL,
  fecha           DATE          NULL,
  creado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_documentos_iniciativa
    FOREIGN KEY (iniciativa_id) REFERENCES iniciativas(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_iniciativa (iniciativa_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabla: usuarios (opcional — control básico de acceso al tablero)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  nombre          VARCHAR(255)  NOT NULL,
  correo          VARCHAR(255)  NOT NULL UNIQUE,
  direccion_id    VARCHAR(30)   NULL,
  rol             ENUM('viceministro','director','editor','lector') NOT NULL DEFAULT 'lector',
  activo          BOOLEAN       NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_usuarios_direccion
    FOREIGN KEY (direccion_id) REFERENCES direcciones(id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;
