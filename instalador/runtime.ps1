# ============================================================
# GamificApp — Runtimes portables (Fase Local 2.1: Node.js).
#
# Este archivo NO se ejecuta solo: lo carga (dot-source) instalar.ps1.
# `iniciar.ps1` NO lo carga a propósito: el arranque diario jamás debe
# depender de la red.
#
# Qué garantiza:
#   · La descarga se verifica por SHA-256 contra el valor publicado por
#     nodejs.org ANTES de extraer nada. Si no coincide, el archivo se borra
#     y no se ejecuta ni un solo byte.
#   · No instala nada en el sistema: no toca el PATH permanente, ni el
#     registro, ni Program Files, ni servicios, ni pide privilegios de
#     administrador. Todo vive dentro de runtime\node\.
#   · runtime\ está en .gitignore: los binarios nunca entran al repositorio.
# ============================================================

# ---- Versión fijada (nunca "latest") -----------------------------------
# El revisor debe ejecutar EXACTAMENTE el mismo Node que se probó aquí, así
# que la versión se clava y se verifica.
#
#   · Rama 22 LTS ("Jod"). Cumple con holgura el requisito real de Vite 8
#     (^20.19.0 || >=22.12.0) que replica Test-NodeCompatible.
#   · Arquitectura win-x64 (única soportada por esta fase).
#   · SHA-256 tomado de la línea "node-v22.23.1-win-x64.zip" de
#     https://nodejs.org/dist/v22.23.1/SHASUMS256.txt  (consultado 2026-07-28).
#     Ese archivo es la fuente oficial de integridad de Node.js; para
#     actualizar la versión hay que copiar el hash de ahí, nunca calcularlo
#     a partir de un archivo ya descargado (eso solo comprueba que el
#     archivo es igual a sí mismo).
$script:NodeVersion = 'v22.23.1'
$script:NodeCarpetaZip = "node-$($script:NodeVersion)-win-x64"
$script:NodeArchivoZip = "$($script:NodeCarpetaZip).zip"
$script:NodeUrl        = "https://nodejs.org/dist/$($script:NodeVersion)/$($script:NodeArchivoZip)"
$script:NodeSha256     = '7DF0BC9375723F4A86B3AA1B7CC73342423D9677A8DF4538ACA31A049E309C29'

# ---- Comprobaciones previas --------------------------------------------
function Test-ArquitecturaX64 {
    # PROCESSOR_ARCHITECTURE del proceso puede decir x86 si PowerShell corre
    # en 32 bits sobre un Windows de 64; PROCESSOR_ARCHITEW6432 lo delata.
    $arq = $env:PROCESSOR_ARCHITECTURE
    $arq6432 = $env:PROCESSOR_ARCHITEW6432
    return ($arq -eq 'AMD64' -or $arq6432 -eq 'AMD64')
}

# ---- Descarga y verificación -------------------------------------------
function Recibir-Archivo {
    param([string]$Url, [string]$Destino)
    # TLS 1.2 explícito: Windows PowerShell 5.1 no siempre lo negocia solo.
    try {
        [Net.ServicePointManager]::SecurityProtocol =
            [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    } catch { }
    # Sin barra de progreso: en PS 5.1 la hace hasta 10 veces más lenta.
    $progresoPrevio = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
        Invoke-WebRequest -Uri $Url -OutFile $Destino -UseBasicParsing -TimeoutSec 300
        return $true
    } catch {
        Escribir-Log "Fallo la descarga de $Url : $($_.Exception.Message)" 'ERROR' $false
        return $false
    } finally {
        $ProgressPreference = $progresoPrevio
    }
}

function Test-Sha256 {
    param([string]$Ruta, [string]$Esperado)
    $real = (Get-FileHash -Path $Ruta -Algorithm SHA256).Hash
    return @{
        Ok    = ($real -eq $Esperado.ToUpper())
        Real  = $real
    }
}

# ---- Preparación del runtime de Node ------------------------------------
# Política (la aprobada en el diseño de la Fase Local 2.0):
#   1. Si runtime\node\node.exe existe y es compatible -> se usa, sin red.
#   2. Si no, y el equipo tiene un Node global compatible -> se usa ese y NO
#      se descarga nada. Así el equipo de desarrollo no cambia de Node ni
#      gasta 30 MB por gusto.
#   3. Si no hay ninguno de los dos (o se pide -Forzar) -> se descarga.
#
# La distribución que recibe el revisor lleva runtime\node\ ya preparado, con
# lo que cae siempre en el caso 1 y no necesita ni red ni Node instalado.
function Preparar-RuntimeNode {
    param([switch]$Forzar)

    Escribir-Paso 'Preparando el entorno de ejecucion de Node.js'

    if (-not $Forzar) {
        $actual = Obtener-Node -Refrescar
        if ($actual -and $actual.Origen -eq 'portable') {
            Escribir-Ok "Node portable ya presente: $($actual.Texto)."
            Escribir-Detalle $actual.Ruta
            return
        }
        if ($actual -and $actual.Origen -eq 'global') {
            Escribir-Ok "Se usara el Node.js del equipo ($($actual.Texto)): es compatible."
            Escribir-Detalle "$($actual.Ruta)  ·  no se descarga nada"
            return
        }
    }

    # A partir de aquí hay que descargar: o no hay Node, o el que hay no
    # sirve, o se pidió expresamente.
    if (-not (Test-ArquitecturaX64)) {
        Terminar-Con-Error 'Este equipo no es Windows de 64 bits (x64).' @(
            'GamificApp solo trae Node.js portable para Windows x64.',
            'En Windows ARM o de 32 bits hay que instalar Node.js manualmente desde',
            'https://nodejs.org/es y volver a ejecutar este archivo.'
        )
    }

    $carpetaDescargas = Join-Path $script:CarpetaRuntime 'descargas'
    if (-not (Test-Path $carpetaDescargas)) {
        New-Item -ItemType Directory -Path $carpetaDescargas -Force | Out-Null
    }
    $zip = Join-Path $carpetaDescargas $script:NodeArchivoZip

    Escribir-Detalle "Descargando Node.js $script:NodeVersion (unos 30 MB). Puede tardar un par de minutos..."
    Escribir-Log "Origen: $script:NodeUrl" 'INFO' $false
    if (Test-Path $zip) { Remove-Item -Path $zip -Force -ErrorAction SilentlyContinue }

    if (-not (Recibir-Archivo -Url $script:NodeUrl -Destino $zip)) {
        Terminar-Con-Error 'No se pudo descargar Node.js.' @(
            'GamificApp necesita Node.js y no lo encontro instalado en este equipo.',
            '',
            'Que hacer:',
            '  1. Comprueba que este equipo tiene conexion a internet.',
            '  2. Vuelve a ejecutar este archivo.',
            '  3. Si no hay internet, instala Node.js LTS desde https://nodejs.org/es',
            '     en otro momento y vuelve a intentarlo.'
        )
    }

    # VERIFICACION OBLIGATORIA antes de tocar el contenido. Si el hash no
    # coincide el archivo se borra: no se extrae ni se ejecuta nada.
    $comprobacion = Test-Sha256 -Ruta $zip -Esperado $script:NodeSha256
    if (-not $comprobacion.Ok) {
        Escribir-Log "SHA-256 esperado: $($script:NodeSha256)" 'ERROR' $false
        Escribir-Log "SHA-256 obtenido: $($comprobacion.Real)" 'ERROR' $false
        Remove-Item -Path $zip -Force -ErrorAction SilentlyContinue
        Terminar-Con-Error 'El archivo de Node.js descargado no supero la verificacion de seguridad.' @(
            'La huella SHA-256 no coincide con la publicada por nodejs.org, asi que',
            'el archivo se ha borrado sin abrirlo.',
            '',
            'Causa habitual: la descarga se corto a medias, o una red corporativa la',
            'ha alterado.',
            '',
            'Que hacer:',
            '  1. Vuelve a ejecutar este archivo para reintentar la descarga.',
            '  2. Si vuelve a fallar, instala Node.js LTS desde https://nodejs.org/es'
        )
    }
    Escribir-Ok 'Descarga verificada (SHA-256 coincide con el publicado por nodejs.org).'

    # Marca de "archivo de internet": sin quitarla, algunas politicas
    # bloquean lo que salga del zip.
    try { Unblock-File -Path $zip -ErrorAction SilentlyContinue } catch { }

    # Extraccion. Se hace sobre runtime\ (el zip ya trae su propia carpeta
    # raiz) y despues se renombra: asi no hay copias entre carpetas ni rutas
    # temporales largas.
    $extraido = Join-Path $script:CarpetaRuntime $script:NodeCarpetaZip
    if (Test-Path $extraido) { Remove-Item -Path $extraido -Recurse -Force -ErrorAction SilentlyContinue }

    Escribir-Detalle 'Extrayendo...'
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $script:CarpetaRuntime)
    } catch {
        Terminar-Con-Error 'No se pudo extraer Node.js.' @(
            "Detalle: $($_.Exception.Message)",
            '',
            'Causas habituales: no queda espacio en disco, o un antivirus bloquea la',
            'escritura en la carpeta del proyecto.'
        )
    }
    if (-not (Test-Path (Join-Path $extraido 'node.exe'))) {
        Terminar-Con-Error 'El paquete de Node.js no tenia el contenido esperado.' @(
            "No aparecio node.exe dentro de $extraido."
        )
    }

    # Reemplazo del runtime anterior (si lo hubiera) por el recien extraido.
    if (Test-Path $script:CarpetaNode) {
        Remove-Item -Path $script:CarpetaNode -Recurse -Force -ErrorAction SilentlyContinue
    }
    Rename-Item -Path $extraido -NewName 'node' -ErrorAction Stop

    Remove-Item -Path $zip -Force -ErrorAction SilentlyContinue

    # Comprobacion real: que el binario arranque y diga la version esperada.
    $nuevo = Obtener-Node -Refrescar
    if (-not $nuevo -or $nuevo.Origen -ne 'portable') {
        Terminar-Con-Error 'Node portable quedo instalado pero no responde.' @(
            "Se esperaba un ejecutable funcional en $script:NodePortableExe."
        )
    }
    if ($nuevo.Texto -ne $script:NodeVersion) {
        Escribir-Aviso "Node portable responde $($nuevo.Texto) y se esperaba $script:NodeVersion."
    }
    if (-not (Obtener-RutaNpmCli)) {
        Terminar-Con-Error 'Node portable quedo instalado pero sin npm.' @(
            'El paquete oficial de Node.js incluye npm; la copia extraida no lo tiene.',
            'Borra la carpeta runtime\node y vuelve a ejecutar este archivo.'
        )
    }
    Escribir-Ok "Node portable $($nuevo.Texto) listo (no se instalo nada en el sistema)."
    Escribir-Detalle $nuevo.Ruta
}
