# ============================================================
# GamificApp — Funciones comunes del instalador local para Windows.
#
# Este archivo NO se ejecuta solo: lo cargan (dot-source) instalar.ps1,
# iniciar.ps1 y detener.ps1.
#
# Reglas que respeta:
#   · Nunca escribe secretos (JWT_SECRET, contraseñas, API keys) en los logs.
#   · Nunca detiene procesos por nombre de imagen (node.exe): siempre por PID
#     registrado y con verificación de la línea de comandos.
#   · Toda espera es por comprobación real (health check), no por sleep fijo.
# ============================================================

$ErrorActionPreference = 'Stop'

# La consola del .cmd viene en UTF-8 (chcp 65001): alineamos PowerShell para
# que los acentos no salgan rotos.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# ---- Rutas y constantes del proyecto -----------------------------------
$script:Raiz          = Split-Path -Parent $PSScriptRoot
$script:CarpetaLogs   = Join-Path $script:Raiz 'logs'
$script:CarpetaRun    = Join-Path $script:Raiz '.run'
$script:CarpetaServer = Join-Path $script:Raiz 'server'
$script:ArchivoEnv    = Join-Path $script:CarpetaServer '.env'
$script:ArchivoLog    = $null

# Requisito REAL de Node: lo impone Vite 8 (node_modules/vite/package.json →
# engines.node = "^20.19.0 || >=22.12.0"). No es un número inventado.
$script:NodeRequisitoTexto = 'Node.js 20.19+ (rama 20) o 22.12+ (rama 22 o superior)'

$script:PuertoBackend  = 3001
$script:PuertoFrontend = 5173
$script:UrlBackend     = "http://localhost:3001"
$script:UrlFrontend    = "http://localhost:5173"

# Base de datos local. Es la única sobre la que se permite sembrar datos de
# demostración (seedDev.js), y coincide con el entorno dev ya documentado.
$script:BaseDatosPredeterminada = 'gamificapp_dev'
# Usuario de aplicación que crea el instalador cuando puede (host '%' porque
# un MySQL en contenedor ve las conexiones llegar desde la red interna).
$script:UsuarioAppMySQL = 'gamificapp_local'

# ---- Censura de secretos ------------------------------------------------
# Cualquier valor registrado aquí se sustituye por *** antes de imprimirse o
# guardarse en un log, venga de donde venga el mensaje.
$script:Secretos = New-Object System.Collections.ArrayList

function Registrar-Secreto {
    param([string]$Valor)
    if ($Valor -and $Valor.Length -ge 6) { [void]$script:Secretos.Add($Valor) }
}

function Censurar {
    param([string]$Texto)
    if (-not $Texto) { return $Texto }
    foreach ($s in $script:Secretos) { $Texto = $Texto.Replace($s, '***') }
    return $Texto
}

# ---- Registro (logs) ----------------------------------------------------
function Iniciar-Registro {
    param([string]$Nombre)
    if (-not (Test-Path $script:CarpetaLogs)) {
        New-Item -ItemType Directory -Path $script:CarpetaLogs -Force | Out-Null
    }
    $script:ArchivoLog = Join-Path $script:CarpetaLogs "$Nombre.log"
    $cabecera = "===== $Nombre — $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ====="
    $cabecera | Out-File -FilePath $script:ArchivoLog -Encoding utf8 -Append
}

function Escribir-Log {
    param(
        [string]$Mensaje,
        [string]$Nivel = 'INFO',
        [bool]$Consola = $true,
        [string]$Color = 'Gray'
    )
    $limpio = Censurar $Mensaje
    if ($script:ArchivoLog) {
        "$(Get-Date -Format 'HH:mm:ss') [$Nivel] $limpio" |
            Out-File -FilePath $script:ArchivoLog -Encoding utf8 -Append
    }
    if ($Consola) { Write-Host $limpio -ForegroundColor $Color }
}

function Escribir-Titulo {
    param([string]$Texto)
    Write-Host ''
    Write-Host "  ============================================================" -ForegroundColor Cyan
    Write-Host "   $Texto" -ForegroundColor Cyan
    Write-Host "  ============================================================" -ForegroundColor Cyan
    Escribir-Log "== $Texto ==" 'INFO' $false
}

function Escribir-Paso    { param([string]$m) Escribir-Log "" 'INFO' $true 'Gray'; Escribir-Log ">> $m" 'PASO' $true 'White' }
function Escribir-Ok      { param([string]$m) Escribir-Log "   [OK] $m" 'OK' $true 'Green' }
function Escribir-Aviso   { param([string]$m) Escribir-Log "   [!]  $m" 'AVISO' $true 'Yellow' }
function Escribir-Detalle { param([string]$m) Escribir-Log "        $m" 'INFO' $true 'DarkGray' }

# Termina la ejecución con un mensaje claro y en español. Código de salida 1
# para que el .cmd pueda avisar de que algo falló.
function Terminar-Con-Error {
    param([string]$Titulo, [string[]]$Instrucciones = @())
    Write-Host ''
    Write-Host "  ------------------------------------------------------------" -ForegroundColor Red
    Write-Host "   NO SE PUDO CONTINUAR" -ForegroundColor Red
    Write-Host "   $Titulo" -ForegroundColor Red
    Write-Host "  ------------------------------------------------------------" -ForegroundColor Red
    Escribir-Log "ERROR: $Titulo" 'ERROR' $false
    foreach ($linea in $Instrucciones) {
        Write-Host "   $linea" -ForegroundColor Yellow
        Escribir-Log "       $linea" 'ERROR' $false
    }
    if ($script:ArchivoLog) {
        Write-Host ''
        Write-Host "   Detalle tecnico en: $script:ArchivoLog" -ForegroundColor DarkGray
    }
    exit 1
}

# ---- Requisitos: Node y npm --------------------------------------------
function Obtener-VersionNode {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) { return $null }
    try {
        $texto = (& node -v) | Select-Object -First 1
        return [pscustomobject]@{
            Texto   = $texto
            Version = [version]($texto -replace '^v', '')
            Ruta    = $cmd.Source
        }
    } catch { return $null }
}

# ^20.19.0 || >=22.12.0 — exactamente lo que exige Vite 8.
# La rama 21 y las 22.0–22.11 NO sirven, aunque sean "más nuevas" que la 20.
function Test-NodeCompatible {
    param([version]$Version)
    if ($Version.Major -eq 20) { return ($Version.Minor -ge 19) }
    if ($Version.Major -eq 22) { return ($Version.Minor -ge 12) }
    if ($Version.Major -ge 23) { return $true }
    return $false
}

function Obtener-RutaNode {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) { return $null }
    return $cmd.Source
}

function Obtener-RutaNpm {
    $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $cmd) { $cmd = Get-Command npm -ErrorAction SilentlyContinue }
    if (-not $cmd) { return $null }
    return $cmd.Source
}

# Comprueba Node + npm y aborta con instrucciones si algo falta o no sirve.
function Comprobar-Requisitos-Node {
    Escribir-Paso 'Comprobando Node.js y npm'
    $node = Obtener-VersionNode
    if (-not $node) {
        Terminar-Con-Error 'No se encontro Node.js en este equipo.' @(
            "GamificApp necesita $script:NodeRequisitoTexto.",
            '',
            'Que hacer:',
            '  1. Descarga Node.js LTS desde  https://nodejs.org/es',
            '  2. Instalalo con las opciones por defecto.',
            '  3. Cierra esta ventana, abre otra y vuelve a ejecutar este archivo.'
        )
    }
    if (-not (Test-NodeCompatible $node.Version)) {
        Terminar-Con-Error "La version de Node.js instalada ($($node.Texto)) no es compatible." @(
            "GamificApp necesita $script:NodeRequisitoTexto.",
            'Lo exige Vite 8, la herramienta que construye la pagina web.',
            '',
            'Que hacer:',
            '  1. Descarga la version LTS desde  https://nodejs.org/es',
            '  2. Instalala encima de la actual (el instalador la reemplaza).',
            '  3. Cierra esta ventana, abre otra y vuelve a ejecutar este archivo.'
        )
    }
    Escribir-Ok "Node.js $($node.Texto) es compatible."
    Escribir-Detalle $node.Ruta

    $npm = Obtener-RutaNpm
    if (-not $npm) {
        Terminar-Con-Error 'Se encontro Node.js pero no npm.' @(
            'npm se instala junto con Node.js. Reinstala Node.js desde https://nodejs.org/es',
            'y asegurate de no desmarcar el componente "npm package manager".'
        )
    }
    try {
        $versionNpm = (& $npm -v) | Select-Object -First 1
        Escribir-Ok "npm $versionNpm disponible."
    } catch {
        Escribir-Ok 'npm disponible.'
    }
}

# ---- Puertos ------------------------------------------------------------
function Obtener-DuenoPuerto {
    param([int]$Puerto)
    $conexion = Get-NetTCPConnection -State Listen -LocalPort $Puerto -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $conexion) { return $null }
    $procesoId = [int]$conexion.OwningProcess
    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$procesoId" -ErrorAction SilentlyContinue
    $nombre = 'desconocido'
    $linea  = ''
    if ($info) { $nombre = $info.Name; $linea = $info.CommandLine }
    return [pscustomobject]@{ ProcesoId = $procesoId; Nombre = $nombre; Linea = $linea }
}

function Test-PuertoTcpAbierto {
    param([string]$Servidor, [int]$Puerto, [int]$TimeoutMs = 1500)
    $cliente = $null
    try {
        $cliente = New-Object System.Net.Sockets.TcpClient
        $intento = $cliente.BeginConnect($Servidor, $Puerto, $null, $null)
        $listo = $intento.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if ($listo) { $cliente.EndConnect($intento) }
        return $listo
    } catch {
        return $false
    } finally {
        if ($cliente) { $cliente.Close() }
    }
}

# ---- HTTP / health checks ----------------------------------------------
function Invocar-Http {
    param([string]$Url, [int]$TimeoutMs = 5000)
    try {
        $peticion = [System.Net.HttpWebRequest]::Create($Url)
        $peticion.Method           = 'GET'
        $peticion.Timeout          = $TimeoutMs
        $peticion.ReadWriteTimeout = $TimeoutMs
        $peticion.Proxy            = $null      # localhost nunca pasa por proxy
        $respuesta = $peticion.GetResponse()
        $lector = New-Object System.IO.StreamReader($respuesta.GetResponseStream())
        $cuerpo = $lector.ReadToEnd()
        $codigo = [int]$respuesta.StatusCode
        $lector.Close(); $respuesta.Close()
        return [pscustomobject]@{ Ok = $true; Codigo = $codigo; Cuerpo = $cuerpo; Error = '' }
    } catch {
        return [pscustomobject]@{ Ok = $false; Codigo = 0; Cuerpo = ''; Error = $_.Exception.Message }
    }
}

# Espera activa hasta que una URL responde de verdad. Si el proceso que
# deberia atenderla se muere, corta al instante en vez de agotar el tiempo.
function Esperar-Respuesta {
    param(
        [string]$Url,
        [int]$SegundosMax = 60,
        [System.Diagnostics.Process]$Proceso = $null
    )
    $limite = (Get-Date).AddSeconds($SegundosMax)
    $ultimoError = ''
    while ((Get-Date) -lt $limite) {
        if ($Proceso -and $Proceso.HasExited) {
            # ExitCode no siempre esta disponible en el objeto de Start-Process:
            # si no lo esta, se informa igual sin inventar un numero.
            $codigo = $null
            try { $codigo = $Proceso.ExitCode } catch { $codigo = $null }
            $detalle = ''
            if ($null -ne $codigo -and "$codigo" -ne '') { $detalle = " (codigo de salida $codigo)" }
            return [pscustomobject]@{
                Ok = $false
                Motivo = "El proceso se cerro solo$detalle. El error concreto esta justo arriba."
                Cuerpo = ''
            }
        }
        $r = Invocar-Http -Url $Url -TimeoutMs 4000
        if ($r.Ok -and $r.Codigo -ge 200 -and $r.Codigo -lt 400) {
            return [pscustomobject]@{ Ok = $true; Motivo = ''; Cuerpo = $r.Cuerpo }
        }
        $ultimoError = $r.Error
        Start-Sleep -Milliseconds 700
    }
    return [pscustomobject]@{
        Ok = $false
        Motivo = "Sin respuesta de $Url tras $SegundosMax segundos. $ultimoError"
        Cuerpo = ''
    }
}

# ---- Archivo .env -------------------------------------------------------
function Leer-Env {
    param([string]$Ruta)
    $mapa = @{}
    if (-not (Test-Path $Ruta)) { return $mapa }
    foreach ($linea in (Get-Content -Path $Ruta -Encoding UTF8)) {
        $texto = $linea.Trim()
        if ($texto -eq '' -or $texto.StartsWith('#')) { continue }
        $corte = $texto.IndexOf('=')
        if ($corte -lt 1) { continue }
        $clave = $texto.Substring(0, $corte).Trim()
        $valor = $texto.Substring($corte + 1).Trim()
        if ($valor.Length -ge 2) {
            $primero = $valor.Substring(0, 1)
            $ultimo  = $valor.Substring($valor.Length - 1, 1)
            if (($primero -eq '"' -and $ultimo -eq '"') -or ($primero -eq "'" -and $ultimo -eq "'")) {
                $valor = $valor.Substring(1, $valor.Length - 2)
            }
        }
        $mapa[$clave] = $valor
    }
    return $mapa
}

# Escribe texto en UTF-8 SIN BOM: dotenv leeria el BOM como parte de la
# primera clave y la variable dejaria de existir.
function Escribir-TextoSinBom {
    param([string]$Ruta, [string]$Contenido)
    $codificacion = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Ruta, $Contenido, $codificacion)
}

# Añade una clave al final de un .env existente SIN tocar ninguna linea
# previa. Se usa solo cuando falta una variable obligatoria.
function Agregar-ClaveEnv {
    param([string]$Ruta, [string]$Clave, [string]$Valor, [string]$Comentario)
    $texto = [System.IO.File]::ReadAllText($Ruta)
    if (-not $texto.EndsWith("`n")) { $texto += "`r`n" }
    $texto += "`r`n# $Comentario (agregado por el instalador)`r`n$Clave=$Valor`r`n"
    Escribir-TextoSinBom -Ruta $Ruta -Contenido $texto
}

# ---- Generación de secretos --------------------------------------------
function Nuevo-SecretoHex {
    param([int]$Bytes = 48)
    $buffer = New-Object byte[] $Bytes
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([System.BitConverter]::ToString($buffer) -replace '-', '').ToLower()
}

# Contraseña legible: sin caracteres ambiguos (0/O, 1/l/I) para que se pueda
# teclear sin dudar. Generada con el RNG criptografico del sistema.
function Nueva-ClaveLegible {
    param([int]$Longitud = 18)
    $alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    $limite = 256 - (256 % $alfabeto.Length)   # descarta el resto sesgado
    $resultado = ''
    $buffer = New-Object byte[] 64
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    try {
        while ($resultado.Length -lt $Longitud) {
            $rng.GetBytes($buffer)
            foreach ($b in $buffer) {
                if ($resultado.Length -ge $Longitud) { break }
                if ($b -lt $limite) { $resultado += $alfabeto[$b % $alfabeto.Length] }
            }
        }
    } finally { $rng.Dispose() }
    return $resultado
}

# ---- Registro de procesos (.run) ---------------------------------------
function Guardar-Proceso {
    param([string]$Nombre, [int]$ProcesoId, [int]$Puerto, [string]$Patron)
    if (-not (Test-Path $script:CarpetaRun)) {
        New-Item -ItemType Directory -Path $script:CarpetaRun -Force | Out-Null
    }
    $datos = [pscustomobject]@{
        nombre   = $Nombre
        pid      = $ProcesoId
        puerto   = $Puerto
        patron   = $Patron
        iniciado = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    }
    $datos | ConvertTo-Json | Out-File -FilePath (Join-Path $script:CarpetaRun "$Nombre.json") -Encoding utf8
}

function Leer-Proceso {
    param([string]$Nombre)
    $ruta = Join-Path $script:CarpetaRun "$Nombre.json"
    if (-not (Test-Path $ruta)) { return $null }
    try { return (Get-Content -Path $ruta -Raw -Encoding UTF8 | ConvertFrom-Json) }
    catch { return $null }
}

function Borrar-RegistroProceso {
    param([string]$Nombre)
    $ruta = Join-Path $script:CarpetaRun "$Nombre.json"
    if (Test-Path $ruta) { Remove-Item -Path $ruta -Force -ErrorAction SilentlyContinue }
}

# Un PID solo se considera nuestro si sigue vivo, es un node.exe y su linea
# de comandos contiene el patron esperado. Asi un PID reciclado por Windows
# jamas se confunde con un proceso de GamificApp.
function Test-ProcesoDeGamificApp {
    param([int]$ProcesoId, [string]$Patron)
    if ($ProcesoId -le 0) { return $false }
    $info = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcesoId" -ErrorAction SilentlyContinue
    if (-not $info) { return $false }
    if ($info.Name -notlike '*node*') { return $false }
    if ($Patron -and ($info.CommandLine -notlike "*$Patron*")) { return $false }
    return $true
}

function Obtener-EstadoServicio {
    param([string]$Nombre, [int]$Puerto, [string]$UrlSalud)
    $registro = Leer-Proceso $Nombre
    $vivo = $false
    $procesoId = 0
    if ($registro) {
        $procesoId = [int]$registro.pid
        $vivo = Test-ProcesoDeGamificApp -ProcesoId $procesoId -Patron $registro.patron
    }
    $responde = $false
    if ($UrlSalud) {
        $r = Invocar-Http -Url $UrlSalud -TimeoutMs 2500
        $responde = ($r.Ok -and $r.Codigo -ge 200 -and $r.Codigo -lt 400)
    }
    $dueno = Obtener-DuenoPuerto -Puerto $Puerto
    return [pscustomobject]@{
        Nombre      = $Nombre
        ProcesoId   = $procesoId
        Registrado  = [bool]$registro
        Vivo        = $vivo
        Responde    = $responde
        DuenoPuerto = $dueno
    }
}

# ---- Arranque de los procesos ------------------------------------------
function Iniciar-Backend {
    $salida  = Join-Path $script:CarpetaLogs 'backend.log'
    $errores = Join-Path $script:CarpetaLogs 'backend-errores.log'
    $proceso = Start-Process -FilePath (Obtener-RutaNode) `
        -ArgumentList 'server.js' `
        -WorkingDirectory $script:CarpetaServer `
        -RedirectStandardOutput $salida `
        -RedirectStandardError $errores `
        -WindowStyle Hidden -PassThru
    Guardar-Proceso -Nombre 'backend' -ProcesoId $proceso.Id -Puerto $script:PuertoBackend -Patron 'server.js'
    return $proceso
}

function Iniciar-Frontend {
    $salida  = Join-Path $script:CarpetaLogs 'frontend.log'
    $errores = Join-Path $script:CarpetaLogs 'frontend-errores.log'
    $vite = Join-Path $script:Raiz 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path $vite)) {
        Terminar-Con-Error 'Falta Vite en node_modules.' @(
            'Ejecuta primero "Instalar GamificApp.cmd" para instalar las dependencias.'
        )
    }
    # --strictPort es obligatorio: si Vite saltara solo al 5174, el backend
    # rechazaria las peticiones por CORS (CORS_ORIGIN apunta al 5173).
    $argumentos = @("`"$vite`"", 'preview', '--port', "$script:PuertoFrontend", '--strictPort')
    $proceso = Start-Process -FilePath (Obtener-RutaNode) `
        -ArgumentList $argumentos `
        -WorkingDirectory $script:Raiz `
        -RedirectStandardOutput $salida `
        -RedirectStandardError $errores `
        -WindowStyle Hidden -PassThru
    Guardar-Proceso -Nombre 'frontend' -ProcesoId $proceso.Id -Puerto $script:PuertoFrontend -Patron 'vite.js'
    return $proceso
}

# Detiene SOLO un proceso registrado por nosotros y verificado. Nunca usa
# taskkill /IM node.exe: eso mataria otras aplicaciones Node del usuario.
function Detener-Servicio {
    param([string]$Nombre)
    $registro = Leer-Proceso $Nombre
    if (-not $registro) { return 'sin-registro' }
    $procesoId = [int]$registro.pid
    if (-not (Test-ProcesoDeGamificApp -ProcesoId $procesoId -Patron $registro.patron)) {
        Borrar-RegistroProceso $Nombre
        return 'no-estaba'
    }
    try {
        Stop-Process -Id $procesoId -Force -ErrorAction Stop
    } catch {
        return "error: $($_.Exception.Message)"
    }
    # Confirmacion real de que murio (hasta 10 s), no un sleep a ciegas.
    $limite = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $limite) {
        if (-not (Test-ProcesoDeGamificApp -ProcesoId $procesoId -Patron $registro.patron)) { break }
        Start-Sleep -Milliseconds 300
    }
    Borrar-RegistroProceso $Nombre
    return 'detenido'
}

function Mostrar-ColaLog {
    param([string]$Ruta, [int]$Lineas = 15)
    if (-not (Test-Path $Ruta)) { return }
    # -Encoding UTF8: Node escribe los mensajes en UTF-8 y sin esto los
    # acentos y emojis del backend saldrian como caracteres rotos.
    $contenido = Get-Content -Path $Ruta -Tail $Lineas -Encoding UTF8 -ErrorAction SilentlyContinue
    if (-not $contenido) { return }
    Write-Host ''
    Write-Host "   Ultimas lineas de $(Split-Path -Leaf $Ruta):" -ForegroundColor DarkGray
    foreach ($linea in $contenido) { Write-Host "     $(Censurar $linea)" -ForegroundColor DarkGray }
}

# Ejecuta uno de los scripts .mjs de esta carpeta pasandole las credenciales
# por variables de entorno (nunca por argumentos: la linea de comandos es
# visible en la lista de procesos del sistema) y devuelve su respuesta JSON.
function Invocar-ScriptBD {
    param([string]$Script, [hashtable]$Variables)
    $anteriores = @{}
    foreach ($clave in $Variables.Keys) {
        $anteriores[$clave] = [Environment]::GetEnvironmentVariable($clave, 'Process')
        [Environment]::SetEnvironmentVariable($clave, $Variables[$clave], 'Process')
    }
    try {
        $texto = ((& (Obtener-RutaNode) (Join-Path $PSScriptRoot $Script)) | Out-String).Trim()
        if (-not $texto) {
            return [pscustomobject]@{ ok = $false; error = 'El script no devolvio ninguna respuesta.' }
        }
        return ($texto | ConvertFrom-Json)
    } catch {
        return [pscustomobject]@{ ok = $false; error = $_.Exception.Message }
    } finally {
        foreach ($clave in $Variables.Keys) {
            [Environment]::SetEnvironmentVariable($clave, $anteriores[$clave], 'Process')
        }
    }
}

# Tablas que NO crea database/produccion_defaultdb.sql (11 tablas) sino las
# migraciones idempotentes de server/initDb.js. Sirven para saber si el
# esquema quedo realmente completo.
$script:TablasDeMigraciones = 'auditoria,misiones,mision_estudiante,docente_curso,banco_preguntas,configuracion_ia,tipos_juego'

function Abrir-Navegador {
    param([string]$Url)
    try { Start-Process $Url | Out-Null } catch { }
}
