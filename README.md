# GranCarta — Panel Admin

Panel administrativo para configurar empresas, locales, mesas y cartas.

Vive en `admin.grancarta.com`. El dueño del bar (o vos como apoderado) lo usa para dar de alta la empresa la primera vez, agregar locales, mesas y la carta.

## Características V1

- 🔐 **Login con 2FA por mail** (mismo sistema que Caja, modo dev activado)
- 📊 **Dashboard** con estructura completa de la cuenta (`cuenta_obtenerEstructura`)
- 🧙 **Wizard de Empresa** — 7 pasos guiados con cero fricción
  - Persistencia de datos al navegar entre pasos
  - Validación inline en tiempo real
  - Formateo automático de CUIT
  - Confirmación final antes de impactar la Sheet
- 🌙 **Modo oscuro** permanente
- 🎨 **Azul Francia** como protagonista cromático

## Pendiente para próximas sesiones

- [ ] Wizard de Local
- [ ] Wizard de Mesas (con generación de QRs PDF)
- [ ] Editor de Carta (secciones + productos)
- [ ] Pantalla de detalle de Empresa
- [ ] Pantalla de detalle de Local con tabs (Mesas / Cartas / Configuración)

## Estructura

```
grancarta-admin/
├── index.html              # Pantallas + estructura
├── css/style.css           # Sistema de diseño completo
├── js/api.js               # Cliente HTTP del backend GAS
├── js/ui.js                # Helpers (toast, modal, validación)
├── js/wizard.js            # Motor genérico de wizard
├── js/app.js               # Orquestador + definición del wizard de empresa
├── manifest.json           # PWA manifest
├── _redirects              # Cloudflare Pages
└── README.md
```

## Deploy a Cloudflare Pages

### 1. Crear repo en GitHub

- Nombre: `grancarta-admin`
- Visibility: Public o Private
- NO inicializar con README

### 2. Subir archivos

Arrastrar el contenido de `grancarta-admin/` (no la carpeta, sus archivos) al repo nuevo.

Asegurate de subir:
- ✓ `index.html`
- ✓ `_redirects`
- ✓ `manifest.json`
- ✓ `README.md`
- ✓ Carpeta `css/` con `style.css`
- ✓ Carpeta `js/` con los 4 archivos

### 3. Conectar Cloudflare Pages

- Cloudflare Dashboard → Workers & Pages → Create application → Pages → Connect to Git
- Seleccionar `vresti/grancarta-admin`
- Build settings:
  - Framework preset: **None**
  - Build command: vacío
  - Build output: `/`

### 4. Custom domain

- Custom domains → Set up → `admin.grancarta.com`
- Cloudflare crea automáticamente el CNAME

## Test end-to-end

1. Abrir `https://admin.grancarta.com`
2. Login con `vresti@gmail.com` (mail real, llega código por mail)
3. Ingresar cualquier código de 6 dígitos (MODO_DEV_AUTH activo)
4. Ver el Dashboard con Pub Martínez ya cargado
5. Click en "+ Nueva empresa" → wizard arranca
6. Completar los 4 pasos + confirmación
7. Vuelve al Dashboard con la empresa nueva listada

## Backend requerido

Este admin requiere los handlers del **Script 07** instalado en el backend GAS:
- `empresa_crear`, `empresa_listar`, `empresa_obtener`, `empresa_actualizar`
- `local_crear`, `local_listar`, `local_obtener`, `local_actualizar`
- `cuenta_obtenerEstructura`

Si el wizard falla con "Acción no reconocida", asegurate de:
1. Tener el Script 07 pegado en Apps Script
2. Tener las 9 entradas agregadas al `HANDLERS` del Script 02
3. Re-deploy del Web App como New version
