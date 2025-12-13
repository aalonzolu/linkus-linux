# Contributing to Linkus Linux

## Commit Message Convention

Para que el changelog automático funcione correctamente, sigue estas convenciones al escribir commits:

### Features (Nuevas funcionalidades)
```bash
git commit -m "feat: añadir soporte para múltiples cuentas"
git commit -m "feature: implementar marcación rápida"
git commit -m "add: nuevo tema oscuro"
git commit -m "new: integración con CRM"
```

### Bug Fixes (Corrección de errores)
```bash
git commit -m "fix: corregir error de autenticación"
git commit -m "bug: solucionar crash al abrir enlaces"
git commit -m "patch: arreglar registro de protocolo en Fedora"
git commit -m "hotfix: resolver problema crítico de sesión"
```

### Otros cambios
```bash
git commit -m "docs: actualizar README"
git commit -m "chore: actualizar dependencias"
git commit -m "refactor: mejorar estructura de código"
git commit -m "test: añadir pruebas unitarias"
git commit -m "style: corregir formato de código"
```

## Release Process

1. **Crear un tag de versión:**
   ```bash
   git tag -a v0.2.0 -m "Release v0.2.0"
   git push origin v0.2.0
   ```

2. **Crear el release en GitHub:**
   - Ve a GitHub → Releases → Draft a new release
   - Selecciona el tag creado
   - El workflow automáticamente:
     - Generará los paquetes .deb, .rpm y AppImage
     - Agrupará los commits en Features y Bug Fixes
     - Añadirá el changelog al release
     - Subirá todos los paquetes como assets

3. **Los usuarios podrán descargar:**
   - `linkus-linux_X.X.X_amd64.deb` (Debian/Ubuntu)
   - `linkus-linux-X.X.X.x86_64.rpm` (Fedora/RHEL/openSUSE)
   - `Linkus-Linux-X.X.X.AppImage` (Universal)

## Testing Locally

Antes de crear un release, prueba los builds localmente:

```bash
# Debian/Ubuntu
npm run dist:linux:deb

# Fedora/RHEL
npm run dist:linux:rpm

# AppImage (universal)
npm run dist:linux:AppImage
```

## Versioning

Seguimos [Semantic Versioning](https://semver.org/):
- **MAJOR** (1.0.0): Cambios incompatibles en la API
- **MINOR** (0.1.0): Nuevas funcionalidades compatibles
- **PATCH** (0.0.1): Correcciones de bugs compatibles
