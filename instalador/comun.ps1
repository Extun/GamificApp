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

# Registro de que esta instalacion sembro datos de demostracion, con las
# lineas de cuentas que imprimio el seed. Permite que una segunda ejecucion
# del instalador —que NO vuelve a sembrar— siga listandolas en
# CREDENCIALES.txt. Es estado de ejecucion de este equipo: vive en .run\
# (ignorado por Git), nunca viaja en el paquete y no contiene nada que no
# imprimiera ya el propio seed en pantalla.
$script:ArchivoDatosDemo = Join-Path $script:CarpetaRun 'datos-demo.txt'

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
# Resolución de Node con prioridad FIJA y deliberada:
#   1. runtime\node\node.exe  — el portable que se distribuye con GamificApp.
#      Gana siempre: así el revisor ejecuta exactamente el Node que se probó.
#   2. el Node instalado en el equipo, si cumple el requisito de Vite.
#   3. error con instrucciones (instalar.ps1 puede descargar el portable
#      antes de llegar aquí; ver instalador\runtime.ps1).
#
# Ninguna de las tres opciones depende del PATH para EJECUTAR node: siempre
# se invoca por ruta absoluta. El PATH solo se toca —y de forma temporal, en
# este proceso— para los lanzadores de node_modules\.bin (ver Anteponer-NodeAlPath).
$script:CarpetaRuntime  = Join-Path $script:Raiz 'runtime'
$script:CarpetaNode     = Join-Path $script:CarpetaRuntime 'node'
$script:NodePortableExe = Join-Path $script:CarpetaNode 'node.exe'

# Caché: evita relanzar `node -v` en cada consulta dentro de una ejecución.
$script:NodeResuelto = $null

# ^20.19.0 || >=22.12.0 — exactamente lo que exige Vite 8.
# La rama 21 y las 22.0–22.11 NO sirven, aunque sean "más nuevas" que la 20.
function Test-NodeCompatible {
    param([version]$Version)
    if ($Version.Major -eq 20) { return ($Version.Minor -ge 19) }
    if ($Version.Major -eq 22) { return ($Version.Minor -ge 12) }
    if ($Version.Major -ge 23) { return $true }
    return $false
}

# Pregunta la versión a un node.exe concreto. Devuelve $null si no existe o
# no responde (binario corrupto, arquitectura equivocada...).
function Obtener-VersionDeNodeExe {
    param([string]$Ruta)
    if (-not $Ruta -or -not (Test-Path $Ruta)) { return $null }
    try {
        $texto = (& $Ruta -v) | Select-Object -First 1
        if (-not $texto) { return $null }
        return [pscustomobject]@{
            Texto   = $texto
            Version = [version]($texto -replace '^v', '')
            Ruta    = $Ruta
        }
    } catch { return $null }
}

# Devuelve el Node elegido con su origen: 'portable', 'global' o
# 'global-incompatible' (existe pero su versión no sirve, y quien llama
# necesita saberlo para dar un mensaje útil).
function Obtener-Node {
    param([switch]$Refrescar)
    if ($script:NodeResuelto -and -not $Refrescar) { return $script:NodeResuelto }
    $script:NodeResuelto = $null

    $portable = Obtener-VersionDeNodeExe -Ruta $script:NodePortableExe
    if ($portable -and (Test-NodeCompatible $portable.Version)) {
        $script:NodeResuelto = [pscustomobject]@{
            Ruta = $portable.Ruta; Texto = $portable.Texto
            Version = $portable.Version; Origen = 'portable'
        }
        return $script:NodeResuelto
    }

    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) {
        $global = Obtener-VersionDeNodeExe -Ruta $cmd.Source
        if ($global) {
            $origen = 'global-incompatible'
            if (Test-NodeCompatible $global.Version) { $origen = 'global' }
            $script:NodeResuelto = [pscustomobject]@{
                Ruta = $global.Ruta; Texto = $global.Texto
                Version = $global.Version; Origen = $origen
            }
            return $script:NodeResuelto
        }
    }
    return $null
}

# Se conserva el nombre porque lo usan iniciar.ps1 y instalar.ps1.
function Obtener-VersionNode { return (Obtener-Node) }

function Obtener-RutaNode {
    $n = Obtener-Node
    if (-not $n) { return $null }
    return $n.Ruta
}

# npm del Node elegido. A propósito se localiza npm-cli.js y NO npm.cmd:
# ese .cmd resuelve `node` por PATH, que es justo la dependencia que esta
# fase elimina. Se invoca siempre como `node.exe npm-cli.js <args>`.
function Obtener-RutaNpmCli {
    $n = Obtener-Node
    if (-not $n) { return $null }
    $cli = Join-Path (Split-Path -Parent $n.Ruta) 'node_modules\npm\bin\npm-cli.js'
    if (Test-Path $cli) { return $cli }
    return $null
}

# Antepone la carpeta del Node elegido al PATH del PROCESO ACTUAL (que los
# procesos hijo heredan) y devuelve el valor anterior para restaurarlo.
#
# NUNCA toca el PATH de usuario ni el de máquina: no usa setx, ni el
# registro, ni [Environment]::SetEnvironmentVariable con ámbito User/Machine.
# Al terminar el script, el cambio desaparece con el proceso.
#
# Hace falta porque los lanzadores de node_modules\.bin —por ejemplo
# vite.cmd, que ejecuta `npm run build`— buscan node.exe junto al lanzador
# y, si no está, caen a `node` a secas resuelto por PATH.
function Anteponer-NodeAlPath {
    $anterior = $env:Path
    $n = Obtener-Node
    if ($n) { $env:Path = "$(Split-Path -Parent $n.Ruta);$anterior" }
    return $anterior
}

function Restaurar-Path {
    param([string]$Anterior)
    if ($null -ne $Anterior) { $env:Path = $Anterior }
}

# Ejecuta npm con el Node elegido y devuelve su código de salida.
# Devuelve -1 si ni siquiera se pudo localizar npm.
function Invocar-Npm {
    param(
        [string[]]$Argumentos,
        [string]$Carpeta,
        [string]$LogSalida,
        [string]$LogErrores
    )
    $node = Obtener-RutaNode
    $cli  = Obtener-RutaNpmCli
    if (-not $node -or -not $cli) { return -1 }
    $lista = @("`"$cli`"") + $Argumentos
    $pathPrevio = Anteponer-NodeAlPath
    try {
        $proceso = Start-Process -FilePath $node -ArgumentList $lista `
            -WorkingDirectory $Carpeta -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $LogSalida -RedirectStandardError $LogErrores
        return $proceso.ExitCode
    } finally {
        Restaurar-Path $pathPrevio
    }
}

# Comprueba Node + npm y aborta con instrucciones si algo falta o no sirve.
function Comprobar-Requisitos-Node {
    Escribir-Paso 'Comprobando Node.js y npm'
    $node = Obtener-Node -Refrescar
    if (-not $node) {
        Terminar-Con-Error 'No se encontro Node.js en este equipo.' @(
            "GamificApp necesita $script:NodeRequisitoTexto.",
            '',
            'Que hacer:',
            '  1. Comprueba que este equipo tiene conexion a internet: el instalador',
            '     puede descargar Node.js por su cuenta, sin instalarlo en el sistema.',
            '  2. Vuelve a ejecutar este archivo.',
            '  3. Si no hay internet, descarga Node.js LTS desde https://nodejs.org/es',
            '     e instalalo con las opciones por defecto.'
        )
    }
    if ($node.Origen -eq 'global-incompatible') {
        Terminar-Con-Error "La version de Node.js instalada ($($node.Texto)) no es compatible." @(
            "GamificApp necesita $script:NodeRequisitoTexto.",
            'Lo exige Vite 8, la herramienta que construye la pagina web.',
            '',
            'Que hacer:',
            '  1. Comprueba que este equipo tiene conexion a internet: el instalador',
            '     puede descargar una version compatible sin tocar la que ya tienes.',
            '  2. Vuelve a ejecutar este archivo.',
            '  3. Si no hay internet, descarga la version LTS desde https://nodejs.org/es'
        )
    }
    if ($node.Origen -eq 'portable') {
        Escribir-Ok "Node.js $($node.Texto) portable (incluido con GamificApp)."
    } else {
        Escribir-Ok "Node.js $($node.Texto) de este equipo es compatible."
    }
    Escribir-Detalle $node.Ruta

    $cli = Obtener-RutaNpmCli
    if (-not $cli) {
        Terminar-Con-Error 'Se encontro Node.js pero no npm.' @(
            'npm se instala junto con Node.js. Reinstala Node.js desde https://nodejs.org/es',
            'y asegurate de no desmarcar el componente "npm package manager".'
        )
    }
    try {
        $versionNpm = (& $node.Ruta $cli -v) | Select-Object -First 1
        Escribir-Ok "npm $versionNpm disponible."
    } catch {
        Escribir-Ok 'npm disponible.'
    }
    Escribir-Detalle $cli
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

# Cambia el VALOR de una clave que ya existe, dejando intacto todo lo demas
# del archivo: comentarios, orden y el resto de variables. Si la clave no
# estuviera, la añade al final.
#
# Se reescribe linea a linea a proposito, en vez de regenerar el .env: ahi
# viven JWT_SECRET y ADMIN_PASSWORD, y regenerar el archivo cerraria la sesion
# de todo el mundo y cambiaria la contraseña del administrador.
function Establecer-ClaveEnv {
    param([string]$Ruta, [string]$Clave, [string]$Valor)
    if (-not (Test-Path $Ruta)) { return $false }

    $lineas = @(Get-Content -Path $Ruta -Encoding UTF8)
    $encontrada = $false
    $salida = foreach ($linea in $lineas) {
        if (-not $encontrada -and $linea -match "^\s*$([regex]::Escape($Clave))\s*=") {
            $encontrada = $true
            "$Clave=$Valor"
        } else {
            $linea
        }
    }
    if (-not $encontrada) {
        Agregar-ClaveEnv -Ruta $Ruta -Clave $Clave -Valor $Valor -Comentario "$Clave — faltaba"
        return $true
    }
    Escribir-TextoSinBom -Ruta $Ruta -Contenido (($salida -join "`r`n") + "`r`n")
    return $true
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
    # -Red deja constancia de si el proceso se lanzo escuchando en toda la red
    # o solo en localhost. Sin ese dato, un arranque posterior no tiene forma
    # de saber si el Vite que ya esta vivo sirve para el modo que el usuario
    # tiene elegido ahora, y habria que adivinarlo.
    param([string]$Nombre, [int]$ProcesoId, [int]$Puerto, [string]$Patron, [bool]$Red = $false)
    if (-not (Test-Path $script:CarpetaRun)) {
        New-Item -ItemType Directory -Path $script:CarpetaRun -Force | Out-Null
    }
    $datos = [pscustomobject]@{
        nombre   = $Nombre
        pid      = $ProcesoId
        puerto   = $Puerto
        patron   = $Patron
        red      = $Red
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
    # PATH con el Node elegido al frente: el backend no lanza sub-procesos
    # hoy, pero así el proceso hijo queda coherente con el runtime elegido.
    $pathPrevio = Anteponer-NodeAlPath
    try {
        $proceso = Start-Process -FilePath (Obtener-RutaNode) `
            -ArgumentList 'server.js' `
            -WorkingDirectory $script:CarpetaServer `
            -RedirectStandardOutput $salida `
            -RedirectStandardError $errores `
            -WindowStyle Hidden -PassThru
    } finally {
        Restaurar-Path $pathPrevio
    }
    Guardar-Proceso -Nombre 'backend' -ProcesoId $proceso.Id -Puerto $script:PuertoBackend -Patron 'server.js'
    return $proceso
}

function Iniciar-Frontend {
    param([switch]$EscucharEnRed)
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
    # Sin --host, `vite preview` solo escucha en localhost y ningun otro
    # dispositivo de la red puede conectarse, ni con el firewall abierto.
    # Solo se anade cuando el usuario activo el acceso desde otros
    # dispositivos: por defecto GamificApp sigue siendo invisible en la red.
    #
    # 0.0.0.0 incluye localhost, asi que el propio equipo servidor sigue
    # entrando por http://localhost:5173 igual que siempre.
    if ($EscucharEnRed) { $argumentos += @('--host', '0.0.0.0') }
    # Vite se invoca por su .js con el Node elegido (nunca por el lanzador
    # vite.cmd), y ademas se le deja ese Node al frente del PATH heredado.
    $pathPrevio = Anteponer-NodeAlPath
    try {
        $proceso = Start-Process -FilePath (Obtener-RutaNode) `
            -ArgumentList $argumentos `
            -WorkingDirectory $script:Raiz `
            -RedirectStandardOutput $salida `
            -RedirectStandardError $errores `
            -WindowStyle Hidden -PassThru
    } finally {
        Restaurar-Path $pathPrevio
    }
    Guardar-Proceso -Nombre 'frontend' -ProcesoId $proceso.Id -Puerto $script:PuertoFrontend -Patron 'vite.js' -Red ([bool]$EscucharEnRed)
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

# ---- Preguntas al usuario ----------------------------------------------
# Vive aqui, y no en instalar.ps1, porque la comparten dos puntos de entrada:
# el instalador y "Configurar GamificApp.cmd". Duplicarla seria la forma mas
# facil de que un dia acepten respuestas distintas.
function Preguntar-SiNo {
    param([string]$Pregunta)
    # El predeterminado es SIEMPRE "No": nada opcional ocurre por inercia.
    while ($true) {
        $respuesta = Read-Host "   $Pregunta [s/N]"
        if ([string]::IsNullOrWhiteSpace($respuesta)) { return $false }
        $r = $respuesta.Trim().ToLower()
        if ($r -eq 's' -or $r -eq 'si' -or $r -eq 'sí' -or $r -eq 'y') { return $true }
        if ($r -eq 'n' -or $r -eq 'no') { return $false }
        Write-Host '   Responde s o n.' -ForegroundColor Yellow
    }
}
